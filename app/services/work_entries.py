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

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.bot.notifications import notify_hours_corrected
from app.errors import AppError
from app.models import (
    Task,
    TaskAssignment,
    TaskGroup,
    TaskLocation,
    TaskStatus,
    User,
    WorkEntry,
)
from app.services.audit import history_for, log_change

ENTITY = "work_entries"


class WorkEntryError(AppError):
    """Бизнес-ошибка с ключом перевода (текст — на языке пользователя)."""


# ---------- внутренние проверки ----------

def _get_task_for_work(db: Session, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise WorkEntryError(404, "err_task_not_found")
    if task.status != TaskStatus.active:
        raise WorkEntryError(409, "err_hours_active_task_only")
    return task


def _check_assignment(db: Session, task_id: int, user_id: int) -> None:
    ok = db.execute(
        select(TaskAssignment.id).where(
            TaskAssignment.task_id == task_id,
            TaskAssignment.user_id == user_id,
        )
    ).first()
    if not ok:
        raise WorkEntryError(409, "err_not_assigned")


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
        raise WorkEntryError(409, "err_location_not_in_task")


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
        # Учётчик может вносить часы участникам СВОЕЙ группы на активном
        # задании (SPEC п.6: учётчик вводит часы за группу одним действием).
        allowed = db.execute(
            select(TaskGroup.id)
            .join(TaskAssignment, TaskAssignment.group_id == TaskGroup.id)
            .where(
                TaskGroup.task_id == task_id,
                TaskGroup.reporter_id == actor.id,
                TaskAssignment.user_id == target_id,
            )
        ).first()
        if not allowed:
            raise WorkEntryError(403, "err_create_for_other")

    target = db.get(User, target_id)
    if target is None or not target.is_active:
        raise WorkEntryError(404, "err_worker_not_found_or_inactive")

    _get_task_for_work(db, task_id)
    _check_assignment(db, task_id, target_id)
    _check_location(db, task_id, location_id)
    if _entry_exists(db, target_id, task_id, work_date):
        raise WorkEntryError(409, "err_entry_exists")

    entry = _new_entry(
        db, user=target, task_id=task_id, work_date=work_date,
        hours=hours, location_id=location_id, entered_by=actor.id,
    )
    try:
        db.commit()
    except IntegrityError:
        # Гонка при двойном нажатии/офлайн-синке: уникальность БД
        # (uq_we_user_task_date) сработала раньше проверки в коде (аудит, п.27).
        db.rollback()
        raise WorkEntryError(409, "err_entry_exists") from None
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
        raise WorkEntryError(404, "err_group_not_found")
    if actor.id != group.reporter_id and not actor.is_manager:
        raise WorkEntryError(403, "err_group_hours_forbidden")

    _get_task_for_work(db, group.task_id)
    _check_location(db, group.task_id, location_id)

    members = db.execute(
        select(User)
        .join(TaskAssignment, TaskAssignment.user_id == User.id)
        .where(TaskAssignment.group_id == group_id)
    ).scalars().all()
    if not members:
        raise WorkEntryError(409, "err_group_empty")

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

    try:
        db.commit()
    except IntegrityError:
        # Гонка при офлайн-синке: часть записей уже создана параллельным
        # запросом — уникальность БД (uq_we_user_task_date) отклонила вставку.
        db.rollback()
        raise WorkEntryError(409, "err_sync_conflict") from None
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
        raise WorkEntryError(403, "err_edit_manager_only")

    entry = db.get(WorkEntry, entry_id)
    if entry is None:
        raise WorkEntryError(404, "err_entry_not_found")

    old = entry.hours
    if Decimal(old) == new_hours:
        raise WorkEntryError(409, "err_same_value")

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
        raise WorkEntryError(404, "err_entry_not_found")
    if entry.user_id != actor.id and not actor.is_manager:
        raise WorkEntryError(403, "err_entry_foreign")
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
            raise WorkEntryError(403, "err_own_entries_only")
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
        raise WorkEntryError(403, "err_task_summary_manager_only")
    if db.get(Task, task_id) is None:
        raise WorkEntryError(404, "err_task_not_found")

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
