"""
Уведомления (SPEC п.21). Вызываются из сервисов/роутеров других модулей.
Не поднимают исключений: если у человека нет tg_id или Telegram недоступен,
бизнес-операция всё равно завершается успешно.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bot.i18n import t
from app.bot.telegram import send_message
from app.models import (
    Task, TaskAssignment, TaskGroup, TaskLocation, Location, User, WorkEntry,
)


def _fmt_dates(task: Task, lang) -> str:
    if not task.date_start and not task.date_end:
        return t(lang, "no_dates")
    return f"{task.date_start or '…'} — {task.date_end or '…'}"


def _location_block(db: Session, task: Task, lang) -> str:
    """Локации задания с send_to_reporter=True (SPEC п.4)."""
    rows = db.execute(
        select(Location)
        .join(TaskLocation, TaskLocation.location_id == Location.id)
        .where(TaskLocation.task_id == task.id,
               TaskLocation.send_to_reporter.is_(True))
    ).scalars().all()
    parts = []
    for loc in rows:
        details = "\n".join(p for p in (loc.address, loc.map_url) if p)
        parts.append(t(lang, "notif_location", name=loc.name, details=details))
    return "\n".join(parts)


def notify_task_assigned(db: Session, task: Task) -> None:
    """
    Разослать назначенным: 'новое задание'.
    Локацию получают учётчики групп и одиночки (им некому её передать);
    рядовым участникам групп локацию доносит учётчик — как в SPEC п.4.
    Вызывать при переводе задания в active (или при назначении на активное).
    """
    assignments = db.execute(
        select(TaskAssignment).where(TaskAssignment.task_id == task.id)
    ).scalars().all()
    reporter_ids = {
        g.reporter_id for g in db.execute(
            select(TaskGroup).where(TaskGroup.task_id == task.id)
        ).scalars().all()
    }
    for a in assignments:
        user = db.get(User, a.user_id)
        if user is None or not user.is_active or user.tg_id is None:
            continue
        text = t(user.lang, "notif_new_task",
                 title=task.title,
                 client=task.client.name if task.client else "—",
                 dates=_fmt_dates(task, user.lang))
        is_reporter = user.id in reporter_ids
        if is_reporter:
            text += "\n" + t(user.lang, "notif_you_are_reporter")
        if is_reporter or a.group_id is None:
            block = _location_block(db, task, user.lang)
            if block:
                text += "\n" + block
        send_message(user.tg_id, text)


def notify_task_changed(db: Session, task: Task, what: str) -> None:
    """Разослать назначенным: 'задание изменено'. what — короткое описание."""
    assignments = db.execute(
        select(TaskAssignment).where(TaskAssignment.task_id == task.id)
    ).scalars().all()
    for a in assignments:
        user = db.get(User, a.user_id)
        if user is None or not user.is_active or user.tg_id is None:
            continue
        send_message(user.tg_id, t(user.lang, "notif_task_changed",
                                   title=task.title, what=what))


def notify_hours_corrected(
    db: Session, entry: WorkEntry, old_hours, new_hours, reason: str | None,
) -> None:
    """
    Сотрудник должен ВИДЕТЬ, что часы изменили (SPEC п.9).
    Вызывать из svc.update_hours после commit.
    """
    user = db.get(User, entry.user_id)
    if user is None or user.tg_id is None:
        return
    task = db.get(Task, entry.task_id)
    send_message(user.tg_id, t(
        user.lang, "notif_hours_corrected",
        date=entry.work_date, task=task.title if task else f"#{entry.task_id}",
        old=old_hours, new=new_hours,
        reason=reason or t(user.lang, "no_reason"),
    ))
