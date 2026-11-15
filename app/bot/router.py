"""
Webhook бота: привязка аккаунта по номеру телефона + аварийный ввод часов.

Сценарий ввода (для учётчика без интернета в Mini App, SPEC п.22):
  - человек пишет боту число: "8" или "7.5" — часы за СЕГОДНЯ;
  - если у него ровно один вариант (одна группа, где он учётчик, или одно
    активное задание) — запись создаётся сразу;
  - если заданий несколько — бот присылает inline-кнопки (h:<task>:<hours>);
    формы "8 /t12" и "8 /g5" по-прежнему работают, но больше не предлагаются.
Вся бизнес-логика — сервисы модуля 5, здесь только разбор сообщений.
"""
import hmac
import html
import re
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bot.i18n import t
from app.bot.telegram import WEBHOOK_SECRET, send_message
from app.db import get_db
from app.models import (
    AccessRequest,
    AccessRequestStatus,
    Task,
    TaskAssignment,
    TaskGroup,
    TaskStatus,
    User,
)
from app.services import work_entries as svc
from app.services.work_entries import WorkEntryError
from app.tz import today_local

router = APIRouter(prefix="/bot", tags=["bot"])

# "8", "7.5", "7,5", опционально с целью: "8 /g5" или "8 /t12"
HOURS_RE = re.compile(r"^(\d{1,2}(?:[.,]\d{1,2})?)(?:\s+/([gt])(\d+))?$")


# ---------- цели для записи часов ----------

def _reporter_groups(db: Session, user: User) -> list[TaskGroup]:
    return list(db.execute(
        select(TaskGroup)
        .join(Task, Task.id == TaskGroup.task_id)
        .where(TaskGroup.reporter_id == user.id,
               Task.status == TaskStatus.active)
    ).scalars().all())


def _own_tasks(db: Session, user: User) -> list[Task]:
    return list(db.execute(
        select(Task)
        .join(TaskAssignment, TaskAssignment.task_id == Task.id)
        .where(TaskAssignment.user_id == user.id,
               Task.status == TaskStatus.active)
    ).scalars().all())


def _save_group(db: Session, user: User, group: TaskGroup, hours: Decimal) -> str:
    task = db.get(Task, group.task_id)
    created, skipped = svc.create_group_entries(
        db, actor=user, group_id=group.id, work_date=today_local(), hours=hours,
    )
    text = t(user.lang, "saved_group", hours=hours, date=today_local(),
             task=task.title, created=len(created))
    already = [s["user_id"] for s in skipped if s["reason"] == "already_has_entry"]
    if already:
        names = [db.get(User, uid).name for uid in already]
        text += "\n" + t(user.lang, "saved_group_skipped", skipped=", ".join(names))
    return text


def _save_self(db: Session, user: User, task: Task, hours: Decimal) -> str:
    svc.create_entry(
        db, actor=user, task_id=task.id, work_date=today_local(), hours=hours,
    )
    return t(user.lang, "saved_self", hours=hours, date=today_local(),
             task=task.title)


def _hours_str(hours: Decimal) -> str:
    """Нормализованные часы для callback_data: 8 -> "8", 7.50 -> "7.5"."""
    return format(hours.normalize(), "f")


def _pick_task_reply(user: User, tasks: list[Task], hours: Decimal) -> dict:
    """Ответ с inline-кнопками: по кнопке на задание (callback h:<task>:<hours>)."""
    hs = _hours_str(hours)
    rows = []
    for tk in tasks:
        label = tk.title
        if len(tk.locations) == 1:
            label += " · " + tk.locations[0].name
        rows.append([{"text": label[:60], "callback_data": f"h:{tk.id}:{hs}"}])
    return {
        "text": t(user.lang, "pick_task", hours=hs),
        "reply_markup": {"inline_keyboard": rows},
    }


def _handle_hours(db: Session, user: User, text: str) -> str | dict:
    m = HOURS_RE.match(text)
    if not m:
        return t(user.lang, "hours_help")
    hours = Decimal(m.group(1).replace(",", "."))
    if not (0 < hours <= 24):
        return t(user.lang, "hours_bad_value")
    kind, target_id = m.group(2), m.group(3)

    groups = _reporter_groups(db, user)
    # свои задания минус те, где человек — учётчик группы (там group-ввод главнее)
    group_task_ids = {g.task_id for g in groups}
    own = [tk for tk in _own_tasks(db, user) if tk.id not in group_task_ids]

    try:
        if kind == "g":  # явная цель: группа
            group = next((g for g in groups if g.id == int(target_id)), None)
            if group is None:
                return t(user.lang, "target_not_found")
            return _save_group(db, user, group, hours)
        if kind == "t":  # явная цель: за себя
            task = next((tk for tk in own if tk.id == int(target_id)), None)
            if task is None:
                return t(user.lang, "target_not_found")
            return _save_self(db, user, task, hours)

        # цель не указана — определяем автоматически
        targets = len(groups) + len(own)
        if targets == 0:
            return t(user.lang, "no_active_work")
        if targets == 1:
            if groups:
                return _save_group(db, user, groups[0], hours)
            return _save_self(db, user, own[0], hours)

        # неоднозначно — личные задания показываем inline-кнопками
        # (группы/учётчик в интерфейсе больше не предлагаются)
        personal = _own_tasks(db, user)
        if personal:
            return _pick_task_reply(user, personal, hours)

        # только устаревший случай: одни группы — список команд
        lines = [t(user.lang, "choose_target", hours=hours)]
        for g in groups:
            task = db.get(Task, g.task_id)
            lines.append(t(user.lang, "target_group_line", hours=hours,
                           id=g.id, members=len(g.members), task=task.title))
        for tk in own:
            lines.append(t(user.lang, "target_self_line", hours=hours,
                           id=tk.id, task=tk.title))
        return "\n".join(lines)
    except WorkEntryError as e:
        return t(user.lang, "entry_error", detail=e.render(user.lang))


# ---------- привязка аккаунта по телефону ----------

def _normalize_phone(phone: str) -> str:
    return "".join(ch for ch in phone if ch.isdigit())[-9:]  # последние 9 цифр


def _handle_contact(db: Session, tg_id: int, contact: dict, from_user: dict) -> str:
    # Привязать можно только СВОЙ контакт
    if contact.get("user_id") != tg_id:
        return t("ru", "contact_not_found")
    incoming = _normalize_phone(contact.get("phone_number", ""))
    if incoming:
        for u in db.execute(
            select(User).where(User.is_active.is_(True),
                               User.tg_id.is_(None),
                               User.phone.is_not(None))
        ).scalars():
            if _normalize_phone(u.phone) == incoming:
                u.tg_id = tg_id
                db.commit()
                return t(u.lang, "linked_ok", name=u.name)

    # Телефона нет среди users — поток заявки (SPEC §12/§28):
    # человек сам делится номером, руководитель одобряет.
    lang = (from_user.get("language_code") or "ru")[:2]
    lang = lang if lang in ("ru", "uk", "es") else "ru"
    name = (contact.get("first_name") or from_user.get("first_name")
            or from_user.get("username") or t(lang, "no_name"))
    phone = contact.get("phone_number") or ""

    existing = db.execute(
        select(AccessRequest).where(
            AccessRequest.tg_id == tg_id,
            AccessRequest.status == AccessRequestStatus.pending)
    ).scalar_one_or_none()
    if existing:
        return t(lang, "request_pending")

    req = AccessRequest(tg_id=tg_id, name=name, phone=phone, lang=lang)
    db.add(req)
    db.commit()

    # уведомить всех активных руководителей с кнопками решения
    username = from_user.get("username")
    username_part = f"\nUsername: @{username}" if username else ""
    username_part = html.escape(username_part, quote=False)
    managers = db.execute(
        select(User).where(User.is_manager.is_(True), User.is_active.is_(True))
    ).scalars().all()
    for m in managers:
        if m.tg_id:
            kb = {
                "inline_keyboard": [[
                    {"text": t(m.lang, "approve_btn"),
                     "callback_data": f"acc:approve:{req.id}"},
                    {"text": t(m.lang, "reject_btn"),
                     "callback_data": f"acc:reject:{req.id}"},
                ]]
            }
            send_message(
                m.tg_id,
                t(m.lang, "mgr_new_request", name=html.escape(name, quote=False),
                  phone=html.escape(phone, quote=False),
                  username=username_part),
                reply_markup=kb,
            )
    return t(lang, "request_sent")


def _contact_keyboard(lang) -> dict:
    return {
        "keyboard": [[{"text": t(lang, "contact_button"), "request_contact": True}]],
        "resize_keyboard": True,
        "one_time_keyboard": True,
    }


# ---------- заявки на доступ: решение руководителя ----------

PICK_RE = re.compile(r"^h:(\d{1,12}):(\d{1,2}(?:\.\d{1,2})?)$")


def _handle_pick_callback(db: Session, cbq: dict, data: str) -> None:
    """Кнопка выбора задания (callback_data h:<task_id>:<hours>)."""
    from_tg = cbq["from"]["id"]
    user = db.execute(
        select(User).where(User.tg_id == from_tg, User.is_active.is_(True))
    ).scalar_one_or_none()
    if user is None:
        return
    chat_id = (cbq.get("message") or {}).get("chat", {}).get("id", from_tg)

    m = PICK_RE.match(data)
    hours = Decimal(m.group(2)) if m else Decimal(0)
    task = None
    if m and 0 < hours <= 24:
        task_id = int(m.group(1))
        task = next((tk for tk in _own_tasks(db, user) if tk.id == task_id), None)
    if task is None:
        text = t(user.lang, "pick_stale")
    else:
        try:
            svc.create_entry(db, actor=user, task_id=task.id,
                             work_date=today_local(), hours=hours)
            text = t(user.lang, "saved_pick", hours=_hours_str(hours),
                     task=task.title)
        except WorkEntryError as e:
            text = t(user.lang, "entry_error", detail=e.render(user.lang))
    _answer_callback(cbq, html.unescape(text)[:200])
    send_message(chat_id, text)


def _callback_lang(db: Session, cbq: dict) -> str:
    """Язык ответа на кнопку: язык известного пользователя, иначе язык клиента Telegram."""
    frm = cbq.get("from") or {}
    user = db.execute(select(User).where(User.tg_id == frm.get("id"))).scalar_one_or_none()
    if user is not None:
        return user.lang.value
    code = (frm.get("language_code") or "ru")[:2]
    return code if code in ("ru", "uk", "es") else "ru"


def _handle_callback(db: Session, cbq: dict) -> None:
    """Inline-кнопки «Одобрить/Отклонить» у заявки (callback_data acc:approve:<id>)."""
    data = cbq.get("data") or ""
    if data.startswith("h:"):
        _handle_pick_callback(db, cbq, data)
        return
    parts = data.split(":")
    if len(parts) != 3 or parts[0] != "acc":
        return
    action, req_id = parts[1], parts[2]
    if action not in ("approve", "reject") or not req_id.isdigit():
        return

    from_tg = cbq["from"]["id"]
    manager = db.execute(
        select(User).where(User.tg_id == from_tg, User.is_manager.is_(True),
                           User.is_active.is_(True))
    ).scalar_one_or_none()
    if manager is None:
        _answer_callback(cbq, t(_callback_lang(db, cbq), "cb_manager_only"))
        return

    req = db.get(AccessRequest, int(req_id))
    if req is None or req.status != AccessRequestStatus.pending:
        _answer_callback(cbq, t(manager.lang, "cb_already_processed"))
        return

    if action == "approve":
        user = User(
            tg_id=req.tg_id, name=req.name, phone=req.phone,
            lang=req.lang, is_active=True, is_manager=False,
        )
        db.add(user)
        req.status = AccessRequestStatus.approved
        req.decided_at = datetime.now(UTC).replace(tzinfo=None)
        req.decided_by = manager.id
        db.commit()
        _answer_callback(cbq, t(manager.lang, "cb_approved"))
        send_message(req.tg_id, t(req.lang, "approved_ok"))
        send_message(
            from_tg,
            t(manager.lang, "mgr_approved_confirm", name=req.name, phone=req.phone),
        )
    else:
        req.status = AccessRequestStatus.rejected
        req.decided_at = datetime.now(UTC).replace(tzinfo=None)
        req.decided_by = manager.id
        db.commit()
        _answer_callback(cbq, t(manager.lang, "cb_rejected"))
        send_message(req.tg_id, t(req.lang, "rejected_info"))
        send_message(
            from_tg,
            t(manager.lang, "mgr_rejected_confirm", name=req.name, phone=req.phone),
        )


def _answer_callback(cbq: dict, text: str) -> None:
    """answerCallbackQuery — всплывающий ответ на нажатие кнопки."""
    import httpx

    from app.bot.telegram import BOT_TOKEN
    if not BOT_TOKEN:
        return
    try:
        httpx.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/answerCallbackQuery",
            json={"callback_query_id": cbq["id"], "text": text},
            timeout=10,
        )
    except httpx.HTTPError:
        pass  # ответ на кнопку не критичен


# ---------- webhook ----------

@router.post("/webhook")
def telegram_webhook(
    update: dict = Body(...),
    secret: str | None = Header(None, alias="X-Telegram-Bot-Api-Secret-Token"),
    db: Session = Depends(get_db),
):
    if not WEBHOOK_SECRET:
        # Секрет не настроен — webhook не должен работать вообще (аудит, п.4).
        raise HTTPException(503, "webhook не настроен")
    if not hmac.compare_digest(secret or "", WEBHOOK_SECRET):
        raise HTTPException(403, "bad secret")

    msg = update.get("message")
    cbq = update.get("callback_query")
    if cbq:
        _handle_callback(db, cbq)
        return {"ok": True}
    if not msg:
        return {"ok": True}  # другие типы апдейтов игнорируем
    chat_id = msg["chat"]["id"]
    tg_id = msg["from"]["id"]

    if msg.get("contact"):
        send_message(chat_id, _handle_contact(db, tg_id, msg["contact"], msg["from"]))
        return {"ok": True}

    user = db.execute(
        select(User).where(User.tg_id == tg_id, User.is_active.is_(True))
    ).scalar_one_or_none()

    if user is None:
        # незнакомец: просим телефон (язык пока неизвестен — по языку клиента TG)
        lang = (msg["from"].get("language_code") or "ru")[:2]
        lang = lang if lang in ("ru", "uk", "es") else "ru"
        send_message(chat_id, t(lang, "ask_contact"),
                     reply_markup=_contact_keyboard(lang))
        return {"ok": True}

    text = (msg.get("text") or "").strip()
    if text.startswith("/start"):
        send_message(chat_id, t(user.lang, "already_linked", name=user.name))
    else:
        reply = _handle_hours(db, user, text)
        if isinstance(reply, dict):
            send_message(chat_id, reply["text"], reply_markup=reply["reply_markup"])
        else:
            send_message(chat_id, reply)
    return {"ok": True}
