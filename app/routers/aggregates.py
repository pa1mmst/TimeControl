"""
Агрегатные read-only эндпоинты для Mini App v4.

Правила:
- только GET, ничего не пишет (даже аудит);
- деньги — Decimal (как в services/payroll.py);
- actor: подписанный initData (get_actor) приоритетен; без initData —
  fallback на X-Actor-Id (старые клиенты и _e2e_check.py);
- manager-эндпоинты: require_manager для initData-actor,
  fallback_actor_is_manager для X-Actor-Id;
- без N+1: selectinload и агрегатные запросы.
"""
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.deps import get_actor, require_manager, fallback_actor_is_manager
from app.models import (
    User, Task, TaskAssignment, TaskGroup, TaskStatus,
    WorkEntry, Advance, Payout, PayoutStatus, AuditLog, InventoryItem,
)

router = APIRouter(tags=["aggregates"])

EPOCH = date(1970, 1, 1)  # "начало времён" для открытого периода


# ---------- Общий актор ----------

def _resolve_actor(
    actor: User | None,
    x_actor_id: int | None,
    db: Session,
) -> User:
    """initData-actor приоритетен; иначе X-Actor-Id (как в старых роутерах)."""
    if actor is not None:
        return actor
    if x_actor_id is None:
        raise HTTPException(401, "Требуется авторизация (initData или X-Actor-Id)")
    user = db.get(User, x_actor_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Неизвестный или деактивированный пользователь")
    return user


def _actor_dep(
    actor: User | None = Depends(get_actor),
    x_actor_id: int | None = Header(None, alias="X-Actor-Id"),
    db: Session = Depends(get_db),
) -> User:
    return _resolve_actor(actor, x_actor_id, db)


def _manager_dep(
    actor: User | None = Depends(get_actor),
    x_actor_id: int | None = Header(None, alias="X-Actor-Id"),
    db: Session = Depends(get_db),
) -> User:
    if actor is not None:
        return require_manager(actor)
    if x_actor_id is None:
        raise HTTPException(401, "Требуется авторизация (initData или X-Actor-Id)")
    fallback_actor_is_manager(x_actor_id, db)
    return db.get(User, x_actor_id)


# ---------- Общие помощники ----------

def _active_today_filter(q, today: date):
    """Активные задания, идущие сегодня (date_end NULL = бессрочное)."""
    return q.filter(
        Task.status == TaskStatus.active,
        Task.date_start <= today,
        (Task.date_end >= today) | (Task.date_end.is_(None)),
    )


def _open_period_start(db: Session, user_id: int) -> date:
    """Начало открытого периода: день после последнего закрытого периода."""
    last = (
        db.query(Payout)
        .filter(Payout.user_id == user_id)
        .order_by(Payout.period_end.desc())
        .first()
    )
    return last.period_end + timedelta(days=1) if last else EPOCH


def _money_for(db: Session, user: User, start: date) -> dict:
    """Заработок/авансы/к выплате за открытый период — логика preview_period."""
    row = (
        db.query(
            func.coalesce(func.sum(WorkEntry.hours), 0).label("hours"),
            func.coalesce(func.sum(WorkEntry.hours * WorkEntry.rate_snapshot), 0)
            .label("gross"),
        )
        .filter(WorkEntry.user_id == user.id, WorkEntry.work_date >= start)
        .first()
    )
    gross = Decimal(row.gross or 0).quantize(Decimal("0.01"))
    adv = Decimal(
        db.query(func.coalesce(func.sum(Advance.amount), 0))
        .filter(Advance.user_id == user.id, Advance.date >= start)
        .scalar()
    ).quantize(Decimal("0.01"))
    last_payout = (
        db.query(Payout)
        .filter(Payout.user_id == user.id)
        .order_by(Payout.period_end.desc())
        .first()
    )
    return {
        "period_start": start,
        "hours": Decimal(row.hours or 0).quantize(Decimal("0.01")),
        "earned": gross,
        "advances": adv,
        "to_pay": (gross - adv).quantize(Decimal("0.01")),
        "rate": Decimal(user.hourly_rate).quantize(Decimal("0.01")),
        "last_payout": (
            {
                "date": last_payout.period_end,
                "amount": Decimal(last_payout.net).quantize(Decimal("0.01")),
                "status": last_payout.status,
            }
            if last_payout
            else None
        ),
    }


def _inventory(db: Session, user_id: int) -> list[dict]:
    return [
        {"id": i.id, "name": i.name}
        for i in db.query(InventoryItem)
        .filter(InventoryItem.holder_id == user_id)
        .order_by(InventoryItem.name)
        .all()
    ]


def _reporter_ids_by_task(task_ids: list[int], db: Session) -> dict[int, set[int]]:
    """task_id -> {user_id учётчиков}. Один запрос."""
    if not task_ids:
        return {}
    rows = (
        db.query(TaskGroup.task_id, TaskGroup.reporter_id)
        .filter(TaskGroup.task_id.in_(task_ids))
        .all()
    )
    result: dict[int, set[int]] = {}
    for task_id, reporter_id in rows:
        result.setdefault(task_id, set()).add(reporter_id)
    return result


def _hours_per_user_day(
    db: Session, task_ids: list[int], day: date
) -> dict[tuple[int, int], Decimal]:
    """(task_id, user_id) -> часы за указанный день. Один запрос."""
    if not task_ids:
        return {}
    rows = (
        db.query(
            WorkEntry.task_id,
            WorkEntry.user_id,
            func.coalesce(func.sum(WorkEntry.hours), 0),
        )
        .filter(WorkEntry.task_id.in_(task_ids), WorkEntry.work_date == day)
        .group_by(WorkEntry.task_id, WorkEntry.user_id)
        .all()
    )
    return {(r[0], r[1]): Decimal(r[2]) for r in rows}


# ---------- 1. Мои задания на сегодня ----------

@router.get("/api/me/today")
def me_today(
    db: Session = Depends(get_db),
    me: User = Depends(_actor_dep),
):
    today = date.today()
    tasks = _active_today_filter(
        db.query(Task)
        .options(
            selectinload(Task.locations),
            selectinload(Task.assignments).selectinload(TaskAssignment.user),
            selectinload(Task.client),
        )
        .join(TaskAssignment, TaskAssignment.task_id == Task.id)
        .filter(TaskAssignment.user_id == me.id)
        .order_by(Task.id),
        today,
    ).all()

    task_ids = [t.id for t in tasks]
    hours_map = _hours_per_user_day(db, task_ids, today)
    reporters = _reporter_ids_by_task(task_ids, db)

    out = []
    for t in tasks:
        workers = [
            {
                "user_id": a.user_id,
                "name": a.user.name if a.user else f"#{a.user_id}",
                "hours_today": hours_map.get((t.id, a.user_id)),
                "is_reporter": a.user_id in reporters.get(t.id, set()),
            }
            for a in t.assignments
        ]
        out.append({
            "id": t.id,
            "title": t.title,
            "client_name": t.client.name if t.client else None,
            "location_names": [loc.name for loc in t.locations],
            "workers": workers,
            "my_hours_today": hours_map.get((t.id, me.id), Decimal("0")),
            "is_reporter": me.id in reporters.get(t.id, set()),
        })
    return {"date": today, "tasks": out}


# ---------- 2. Моя история ----------

@router.get("/api/me/history")
def me_history(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(_actor_dep),
):
    q = (
        db.query(WorkEntry)
        .options(
            selectinload(WorkEntry.task),
            selectinload(WorkEntry.location),
        )
        .filter(WorkEntry.user_id == me.id)
    )
    if date_from:
        q = q.filter(WorkEntry.work_date >= date_from)
    if date_to:
        q = q.filter(WorkEntry.work_date <= date_to)
    entries = q.order_by(WorkEntry.work_date.desc(), WorkEntry.id.desc()).all()

    # corrected: есть ли audit_log по записи. Один запрос на все записи.
    ids = [e.id for e in entries]
    audit_map: dict[int, str] = {}
    if ids:
        logs = (
            db.query(AuditLog)
            .filter(
                AuditLog.entity == "work_entries",
                AuditLog.entity_id.in_(ids),
                AuditLog.field == "hours",
            )
            .order_by(AuditLog.id.desc())
            .all()
        )
        for log in logs:  # первый (свежий) лог по записи — его reason
            audit_map.setdefault(log.entity_id, log.reason or "")

    return [
        {
            "id": e.id,
            "date": e.work_date,
            "task_id": e.task_id,
            "task_title": e.task.title if e.task else None,
            "location": e.location.name if e.location else None,
            "hours": Decimal(e.hours).quantize(Decimal("0.01")),
            "corrected": e.id in audit_map,
            "corrected_reason": audit_map.get(e.id),
        }
        for e in entries
    ]


# ---------- 3. Мои деньги ----------

@router.get("/api/me/money")
def me_money(
    db: Session = Depends(get_db),
    me: User = Depends(_actor_dep),
):
    start = _open_period_start(db, me.id)
    money = _money_for(db, me, start)
    money["inventory"] = _inventory(db, me.id)
    return money


# ---------- 4. Дашборд руководителя ----------

@router.get("/api/dashboard/today")
def dashboard_today(
    db: Session = Depends(get_db),
    manager: User = Depends(_manager_dep),
):
    today = date.today()
    tasks = _active_today_filter(
        db.query(Task)
        .options(
            selectinload(Task.locations),
            selectinload(Task.assignments).selectinload(TaskAssignment.user),
            selectinload(Task.client),
        )
        .order_by(Task.id),
        today,
    ).all()

    task_ids = [t.id for t in tasks]
    hours_map = _hours_per_user_day(db, task_ids, today)
    reporters = _reporter_ids_by_task(task_ids, db)

    out_tasks = []
    workers_with_hours: set[int] = set()
    tasks_no_hours = []
    for t in tasks:
        workers = []
        task_has_hours = False
        for a in t.assignments:
            h = hours_map.get((t.id, a.user_id))
            if h is not None and h > 0:
                task_has_hours = True
                workers_with_hours.add(a.user_id)
            workers.append({
                "user_id": a.user_id,
                "name": a.user.name if a.user else f"#{a.user_id}",
                "hours_today": h,
                "is_reporter": a.user_id in reporters.get(t.id, set()),
            })
        if not task_has_hours:
            tasks_no_hours.append(t.id)
        out_tasks.append({
            "id": t.id,
            "title": t.title,
            "client_name": t.client.name if t.client else None,
            "location_names": [loc.name for loc in t.locations],
            "workers": workers,
        })

    return {
        "date": today,
        "workers_count": len(workers_with_hours),
        "hours_today": sum(
            (h for h in hours_map.values() if h > 0), Decimal("0")
        ).quantize(Decimal("0.01")),
        "tasks_no_hours": tasks_no_hours,
        "tasks": out_tasks,
    }


# ---------- 5. Матрица задания ----------

@router.get("/api/tasks/{task_id}/matrix")
def task_matrix(
    task_id: int,
    db: Session = Depends(get_db),
    manager: User = Depends(_manager_dep),
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Задание не найдено")
    if not task.date_start:
        raise HTTPException(400, "У задания не задана дата начала")

    today = date.today()
    end = min(task.date_end, today) if task.date_end else today
    if end < task.date_start:
        raise HTTPException(400, "Задание ещё не началось")
    dates = [
        task.date_start + timedelta(days=i)
        for i in range((end - task.date_start).days + 1)
    ]

    assignments = (
        db.query(TaskAssignment)
        .options(selectinload(TaskAssignment.user))
        .filter(TaskAssignment.task_id == task_id)
        .all()
    )
    rows_map = {
        a.user_id: {"user_id": a.user_id, "name": a.user.name, "cells": {}}
        for a in assignments
    }
    for d in dates:
        for r in rows_map.values():
            r["cells"][d.isoformat()] = None

    # Часы за весь диапазон одним запросом
    if dates:
        entries = (
            db.query(WorkEntry.user_id, WorkEntry.work_date, WorkEntry.hours)
            .filter(
                WorkEntry.task_id == task_id,
                WorkEntry.work_date >= dates[0],
                WorkEntry.work_date <= dates[-1],
            )
            .all()
        )
        for user_id, work_date, hours in entries:
            row = rows_map.get(user_id)
            if row:
                key = work_date.isoformat()
                prev = row["cells"].get(key)
                row["cells"][key] = (
                    Decimal(hours) if prev is None else prev + Decimal(hours)
                )

    return {
        "task_id": task.id,
        "title": task.title,
        "dates": [d.isoformat() for d in dates],
        "rows": [
            {
                "user_id": r["user_id"],
                "name": r["name"],
                "cells": {d: r["cells"][d] for d in sorted(r["cells"])},
            }
            for r in rows_map.values()
        ],
    }


# ---------- 6. Сводка по сотруднику ----------

@router.get("/api/users/{user_id}/summary")
def user_summary(
    user_id: int,
    db: Session = Depends(get_db),
    manager: User = Depends(_manager_dep),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")

    start = _open_period_start(db, user.id)
    money = _money_for(db, user, start)

    last_entries = (
        db.query(WorkEntry)
        .options(
            selectinload(WorkEntry.task),
            selectinload(WorkEntry.location),
        )
        .filter(WorkEntry.user_id == user.id)
        .order_by(WorkEntry.work_date.desc(), WorkEntry.id.desc())
        .limit(5)
        .all()
    )

    return {
        "id": user.id,
        "name": user.name,
        "rate": money["rate"],
        "is_active": user.is_active,
        "is_manager": user.is_manager,
        "period_start": start,
        "hours_period": money["hours"],
        "earned_period": money["earned"],
        "advances_period": money["advances"],
        "to_pay_period": money["to_pay"],
        "inventory": _inventory(db, user.id),
        "last_entries": [
            {
                "date": e.work_date,
                "task_title": e.task.title if e.task else None,
                "location": e.location.name if e.location else None,
                "hours": Decimal(e.hours).quantize(Decimal("0.01")),
            }
            for e in last_entries
        ],
    }
