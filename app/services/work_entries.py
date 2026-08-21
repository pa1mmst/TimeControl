"""
Сервисный слой учёта времени (SPEC п.6–п.11, п.25).

Инварианты, которые обязан соблюдать ЛЮБОЙ код, работающий с часами:
- work_entries никогда не удаляются;
- любое изменение часов идёт только через update_hours() ниже,
  которая одновременно меняет запись и пишет AuditLog;
- rate_snapshot берётся из users.hourly_rate в момент создания записи;
- групповой ввод = N индивидуальных записей с одинаковым entered_by;
- одна запись = один человек + один день + одно задание (дубли запрещены).
"""
from datetime import date
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models import (
    Task, TaskAssignment, TaskGroup, TaskLocation, TaskStatus,
    User, WorkEntry,
)
from app.services.audit import log_change, history_for
from app.bot.notifications import notify_hours_corrected

ENTITY = "work_entries"


class WorkEntryError(Exception):
    """Бизнес-ошибка. Роутер превращает её в HTTP-ответ."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


# ---------- внутренние проверки ----------

def _get_task_for_work(db: Session, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise WorkEntryError(404, "Задание не найдено")
    if task.status != TaskStatus.active:
        raise WorkEntryError(409, "Часы можно вносить только по активному заданию")
    return task


def _check_assignment(db: Session, task_id: int, user_id: int) -> None:
    ok = db.execute(
        select(TaskAssignment.id).where(
            TaskAssignment.task_id == task_id,
            TaskAssignment.user_id == user_id,
        )
    ).first()
    if not ok:
        raise WorkEntryError(409, "Сотрудник не назначен на это задание")


def _check_location(db: Session, task_id: int, location_id: int | None) -> None:
    if location_id is None:
        return
    ok = db.execute(
        select(TaskLocation.location_id).where(
            TaskLocation.task_id == task_id,
            TaskLocation.location_id == location_id,
        )
    ).first()
    if not ok:
        raise WorkEntryError(409, "Локация не привязана к этому заданию")


def _entry_exists(db: Session, user_id: int, task_id: int, work_date: date) -> bool:
    return db.execute(
        select(WorkEntry.id).where(
            WorkEntry.user_id == user_id,
            WorkEntry.task_id == task_id,
            WorkEntry.work_date == work_date,
        )
    ).first() is not None


def _new_entry(
    db: Session, *, user: User, task_id: int, work_date: date,
    hours: Decimal, location_id: int | None, entered_by: int,
) -> WorkEntry:
    entry = WorkEntry(
        user_id=user.id,
        task_id=task_id,
        location_id=location_id,
        work_date=work_date,
        hours=hours,
        # Снимок ставки в момент записи — смена ставки не трогает историю (SPEC п.16)
        rate_snapshot=Decimal(user.hourly_rate),
        entered_by=entered_by,
    )
    db.add(entry)
    return entry


# ---------- публичный API сервиса ----------

def create_entry(
    db: Session, *, actor: User, task_id: int, work_date: date,
    hours: Decimal, location_id: int | None = None, user_id: int | None = None,
) -> WorkEntry:
    """
    Индивидуальная запись (SPEC п.6, источник 1: сам сотрудник).
    Работник создаёт только на себя; руководитель — на любого (SPEC п.8).
    """
    target_id = user_id if user_id is not None else actor.id
    if target_id != actor.id and not actor.is_manager:
        raise WorkEntryError(403, "Создавать записи за другого может только руководитель")

    target = db.get(User, target_id)
    if target is None or not target.is_active:
        raise WorkEntryError(404, "Сотрудник не найден или деактивирован")

    _get_task_for_work(db, task_id)
    _check_assignment(db, task_id, target_id)
    _check_location(db, task_id, location_id)
    if _entry_exists(db, target_id, task_id, work_date):
        raise WorkEntryError(
            409, "Запись за этот день по этому заданию уже существует. "
                 "Изменить часы может руководитель."
        )

    entry = _new_entry(
        db, user=target, task_id=task_id, work_date=work_date,
        hours=hours, location_id=location_id, entered_by=actor.id,
    )
    db.commit()
    db.refresh(entry)
    return entry


def create_group_entries(
    db: Session, *, actor: User, group_id: int, work_date: date,
    hours: Decimal, location_id: int | None = None,
    exclude_user_ids: list[int] | None = None,
) -> tuple[list[WorkEntry], list[dict]]:
    """
    Групповой ввод (SPEC п.6, источник 2: учётчик за группу).
    Одно действие -> индивидуальная запись каждому участнику группы.
    Учёт остаётся индивидуальным: бригада — только способ массового ввода.
    Возвращает (созданные записи, пропущенные участники).
    Уже существующие записи пропускаются, а не дублируются — это же
    делает повторную отправку после offline-синхронизации безопасной (SPEC п.22).
    """
    exclude = set(exclude_user_ids or [])

    group = db.get(TaskGroup, group_id)
    if group is None:
        raise WorkEntryError(404, "Группа не найдена")
    if actor.id != group.reporter_id and not actor.is_manager:
        raise WorkEntryError(403, "Вводить часы за группу может её учётчик или руководитель")

    _get_task_for_work(db, group.task_id)
    _check_location(db, group.task_id, location_id)

    members = db.execute(
        select(User)
        .join(TaskAssignment, TaskAssignment.user_id == User.id)
        .where(TaskAssignment.group_id == group_id)
    ).scalars().all()
    if not members:
        raise WorkEntryError(409, "В группе нет участников")

    created: list[WorkEntry] = []
    skipped: list[dict] = []
    for member in members:
        if member.id in exclude:
            skipped.append({"user_id": member.id, "reason": "excluded"})
            continue
        if _entry_exists(db, member.id, group.task_id, work_date):
            skipped.append({"user_id": member.id, "reason": "already_has_entry"})
            continue
        created.append(_new_entry(
            db, user=member, task_id=group.task_id, work_date=work_date,
            hours=hours, location_id=location_id, entered_by=actor.id,
        ))

    db.commit()
    for e in created:
        db.refresh(e)
    return created, skipped


def update_hours(
    db: Session, *, actor: User, entry_id: int,
    new_hours: Decimal, reason: str | None = None,
) -> WorkEntry:
    """
    Правка часов. ТОЛЬКО руководитель (SPEC п.9, п.12).
    Единственный легальный способ изменить hours: UPDATE + AuditLog
    в одной транзакции. Прямые UPDATE в обход этой функции запрещены.
    """
    if not actor.is_manager:
        raise WorkEntryError(403, "Изменять часы может только руководитель")

    entry = db.get(WorkEntry, entry_id)
    if entry is None:
        raise WorkEntryError(404, "Запись не найдена")

    old = entry.hours
    if Decimal(old) == new_hours:
        raise WorkEntryError(409, "Новое значение совпадает с текущим")

    entry.hours = new_hours
    log_change(
        db,
        actor_id=actor.id,
        entity=ENTITY,
        entity_id=entry.id,
        field="hours",
        old_value=old,
        new_value=new_hours,
        reason=reason,
    )
    db.commit()  # запись и аудит фиксируются атомарно
    db.refresh(entry)
    # Сотрудник должен видеть, что часы изменили (SPEC п.9).
    # Уведомление не может завалить операцию — send_message глотает ошибки.
    notify_hours_corrected(db, entry, old, new_hours, reason)
    return entry


def get_entry(db: Session, *, actor: User, entry_id: int) -> WorkEntry:
    entry = db.get(WorkEntry, entry_id)
    if entry is None:
        raise WorkEntryError(404, "Запись не найдена")
    if entry.user_id != actor.id and not actor.is_manager:
        raise WorkEntryError(403, "Нет доступа к чужой записи")
    return entry


def get_entry_history(db: Session, *, actor: User, entry_id: int):
    """История изменений видна руководителю и владельцу записи (SPEC п.9)."""
    get_entry(db, actor=actor, entry_id=entry_id)  # заодно проверка доступа
    return history_for(db, ENTITY, entry_id)


def list_entries(
    db: Session, *, actor: User,
    user_id: int | None = None, task_id: int | None = None,
    date_from: date | None = None, date_to: date | None = None,
) -> list[WorkEntry]:
    """Работник видит только свои записи; руководитель — любые (SPEC п.12, п.14)."""
    if actor.is_manager:
        effective_user_id = user_id
    else:
        if user_id is not None and user_id != actor.id:
            raise WorkEntryError(403, "Доступны только собственные записи")
        effective_user_id = actor.id

    q = select(WorkEntry)
    if effective_user_id is not None:
        q = q.where(WorkEntry.user_id == effective_user_id)
    if task_id is not None:
        q = q.where(WorkEntry.task_id == task_id)
    if date_from is not None:
        q = q.where(WorkEntry.work_date >= date_from)
    if date_to is not None:
        q = q.where(WorkEntry.work_date <= date_to)
    q = q.order_by(WorkEntry.work_date.desc(), WorkEntry.id.desc())
    return list(db.execute(q).scalars().all())


def task_summary(db: Session, *, actor: User, task_id: int) -> dict:
    """
    Общая картина по заданию (SPEC п.11):
    по людям, по группам ввода и итог. Только руководитель.
    """
    if not actor.is_manager:
        raise WorkEntryError(403, "Сводка по заданию доступна только руководителю")
    if db.get(Task, task_id) is None:
        raise WorkEntryError(404, "Задание не найдено")

    # по людям (+ начислено по снимку ставки)
    by_user_rows = db.execute(
        select(
            WorkEntry.user_id,
            User.name,
            func.coalesce(func.sum(WorkEntry.hours), 0),
            func.coalesce(func.sum(WorkEntry.hours * WorkEntry.rate_snapshot), 0),
        )
        .join(User, User.id == WorkEntry.user_id)
        .where(WorkEntry.task_id == task_id)
        .group_by(WorkEntry.user_id, User.name)
        .order_by(User.name)
    ).all()

    # по группам ввода: часы участников агрегируются по group_id назначения;
    # group_id IS NULL = одиночки (SPEC п.3, п.11)
    by_group_rows = db.execute(
        select(
            TaskAssignment.group_id,
            TaskGroup.reporter_id,
            func.coalesce(func.sum(WorkEntry.hours), 0),
        )
        .join(
            TaskAssignment,
            (TaskAssignment.task_id == WorkEntry.task_id)
            & (TaskAssignment.user_id == WorkEntry.user_id),
        )
        .outerjoin(TaskGroup, TaskGroup.id == TaskAssignment.group_id)
        .where(WorkEntry.task_id == task_id)
        .group_by(TaskAssignment.group_id, TaskGroup.reporter_id)
    ).all()

    total = db.execute(
        select(func.coalesce(func.sum(WorkEntry.hours), 0))
        .where(WorkEntry.task_id == task_id)
    ).scalar_one()

    return {
        "task_id": task_id,
        "by_user": [
            {"user_id": r[0], "user_name": r[1],
             "total_hours": r[2], "total_amount": r[3]}
            for r in by_user_rows
        ],
        "by_group": [
            {"group_id": r[0], "reporter_id": r[1], "total_hours": r[2]}
            for r in by_group_rows
        ],
        "total_hours": total,
    }
