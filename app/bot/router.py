"""
Webhook бота: привязка аккаунта по номеру телефона + аварийный ввод часов.

Сценарий ввода (для учётчика без интернета в Mini App, SPEC п.22):
  - человек пишет боту число: "8" или "7.5" — часы за СЕГОДНЯ;
  - если у него ровно один вариант (одна группа, где он учётчик, или одно
    активное задание) — запись создаётся сразу;
  - если вариантов несколько — бот присылает список команд вида
    "8 /g5" (за группу) и "8 /t12" (за себя), человек копирует нужную.
Вся бизнес-логика — сервисы модуля 5, здесь только разбор сообщений.
"""
import re
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bot.i18n import t
from app.bot.telegram import WEBHOOK_SECRET, send_message
from app.db import get_db
from app.models import Task, TaskAssignment, TaskGroup, TaskStatus, User
from app.services import work_entries as svc
from app.services.work_entries import WorkEntryError

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
        db, actor=user, group_id=group.id, work_date=date.today(), hours=hours,
    )
    text = t(user.lang, "saved_group", hours=hours, date=date.today(),
             task=task.title, created=len(created))
    already = [s["user_id"] for s in skipped if s["reason"] == "already_has_entry"]
    if already:
        names = [db.get(User, uid).name for uid in already]
        text += "\n" + t(user.lang, "saved_group_skipped", skipped=", ".join(names))
    return text


def _save_self(db: Session, user: User, task: Task, hours: Decimal) -> str:
    svc.create_entry(
        db, actor=user, task_id=task.id, work_date=date.today(), hours=hours,
    )
    return t(user.lang, "saved_self", hours=hours, date=date.today(),
             task=task.title)


def _handle_hours(db: Session, user: User, text: str) -> str:
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

        # неоднозначно — показываем список команд
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
        return t(user.lang, "entry_error", detail=e.detail)


# ---------- привязка аккаунта по телефону ----------

def _normalize_phone(phone: str) -> str:
    return "".join(ch for ch in phone if ch.isdigit())[-9:]  # последние 9 цифр


def _handle_contact(db: Session, tg_id: int, contact: dict) -> str:
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
    return t("ru", "contact_not_found")


def _contact_keyboard(lang) -> dict:
    return {
        "keyboard": [[{"text": t(lang, "contact_button"), "request_contact": True}]],
        "resize_keyboard": True,
        "one_time_keyboard": True,
    }


# ---------- webhook ----------

@router.post("/webhook")
def telegram_webhook(
    update: dict = Body(...),
    secret: str | None = Header(None, alias="X-Telegram-Bot-Api-Secret-Token"),
    db: Session = Depends(get_db),
):
    if secret != WEBHOOK_SECRET:
        raise HTTPException(403, "bad secret")

    msg = update.get("message")
    if not msg:
        return {"ok": True}  # другие типы апдейтов игнорируем
    chat_id = msg["chat"]["id"]
    tg_id = msg["from"]["id"]

    if msg.get("contact"):
        send_message(chat_id, _handle_contact(db, tg_id, msg["contact"]))
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
        send_message(chat_id, _handle_hours(db, user, text))
    return {"ok": True}
