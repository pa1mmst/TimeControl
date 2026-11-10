"""
Отчёты — бизнес-логика (вынесена из роутера, аудит п.14 и п.25).

Правила:
- роутер тонкий: HTTP-коды (404) поднимает он, сервис возвращает dict/None;
- N+1 закрыт: связанные task/location/user догружаются selectinload
  в тех же запросах записей (аудит, п.25);
- все деньги — Decimal, никакого float.
"""
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Client,
    Location,
    Payout,
    Task,
    User,
    WorkEntry,
)

# Общие опции загрузки: снимки связаны с task/location/user —
# без selectinload каждый доступ e.task / e.location / e.user
# давал бы отдельный SELECT (N+1).
_ENTRY_OPTIONS = (
    selectinload(WorkEntry.task),
    selectinload(WorkEntry.location),
    selectinload(WorkEntry.user),
)


def _date_filter(q, start: date | None, end: date | None):
    if start:
        q = q.filter(WorkEntry.work_date >= start)
    if end:
        q = q.filter(WorkEntry.work_date <= end)
    return q


def user_report(
    db: Session, user_id: int, start: date | None, end: date | None
) -> dict | None:
    """Сколько часов, за какие дни, где, сколько заработал, статус выплат."""
    user = db.get(User, user_id)
    if not user:
        return None

    q = _date_filter(
        db.query(WorkEntry).filter(WorkEntry.user_id == user_id),
        start, end,
    )
    entries = (
        q.options(*_ENTRY_OPTIONS).order_by(WorkEntry.work_date).all()
    )

    days = [{
        "date": e.work_date,
        "task_id": e.task_id,
        "task": e.task.title,
        "location": e.location.name if e.location else None,
        "hours": e.hours,
        "amount": e.hours * e.rate_snapshot,
    } for e in entries]

    payouts = [{
        "period": f"{p.period_start} — {p.period_end}",
        "net": p.net,
        "status": p.status,
    } for p in db.query(Payout).filter(Payout.user_id == user_id)
        .order_by(Payout.period_start).all()]

    return {
        "user": {"id": user.id, "name": user.name},
        "total_hours": sum((e.hours for e in entries), 0),
        "total_earned": sum((e.hours * e.rate_snapshot for e in entries), 0),
        "days": days,
        "payouts": payouts,
    }


def task_report(db: Session, task_id: int) -> dict | None:
    """Кто назначен, группы/учётчики, часы по людям и всего (SPEC п.11)."""
    task = db.get(Task, task_id)
    if not task:
        return None

    per_user = (
        db.query(User.id, User.name, func.sum(WorkEntry.hours).label("hours"))
        .join(WorkEntry, WorkEntry.user_id == User.id)
        .filter(WorkEntry.task_id == task_id)
        .group_by(User.id, User.name)
        .all()
    )
    return {
        "task": {"id": task.id, "title": task.title, "status": task.status},
        "client": task.client.name,
        "locations": [loc.name for loc in task.locations],
        "groups": [{
            "group_id": g.id,
            "reporter": g.reporter.name,
            "members": [m.user.name for m in g.members],
        } for g in task.groups],
        "assigned": [{
            "user_id": a.user_id,
            "name": a.user.name,
            "solo": a.group_id is None,
        } for a in task.assignments],
        "hours_by_user": [
            {"user_id": r.id, "name": r.name, "hours": r.hours}
            for r in per_user
        ],
        "total_hours": sum((r.hours for r in per_user), 0),
    }


def location_report(
    db: Session, location_id: int, start: date | None, end: date | None
) -> dict | None:
    """Какие задания, какие люди, сколько часов на этом месте."""
    loc = db.get(Location, location_id)
    if not loc:
        return None

    q = _date_filter(
        db.query(WorkEntry).filter(WorkEntry.location_id == location_id),
        start, end,
    )
    entries = q.options(*_ENTRY_OPTIONS).all()
    tasks = sorted({e.task.title for e in entries})
    per_user: dict[str, object] = {}
    for e in entries:
        per_user[e.user.name] = per_user.get(e.user.name, 0) + e.hours

    return {
        "location": {
            "id": loc.id, "name": loc.name, "client": loc.client.name,
        },
        "tasks": tasks,
        "hours_by_user": per_user,
        "total_hours": sum((e.hours for e in entries), 0),
    }


def client_report(
    db: Session, client_id: int, start: date | None, end: date | None
) -> dict | None:
    """Все локации, задания, люди и общее число часов заказчика (SPEC п.18)."""
    client = db.get(Client, client_id)
    if not client:
        return None

    # Часы цепляем через задание: у записи может не быть локации,
    # но задание всегда принадлежит заказчику
    q = _date_filter(
        db.query(WorkEntry).join(Task, WorkEntry.task_id == Task.id)
        .filter(Task.client_id == client_id),
        start, end,
    )
    entries = q.options(*_ENTRY_OPTIONS).all()
    per_location: dict[str, object] = {}
    for e in entries:
        key = e.location.name if e.location else "(без локации)"
        per_location[key] = per_location.get(key, 0) + e.hours

    return {
        "client": {"id": client.id, "name": client.name},
        "locations": [loc.name for loc in client.locations],
        "tasks": [
            {"id": t.id, "title": t.title, "status": t.status}
            for t in db.query(Task).filter(Task.client_id == client_id).all()
        ],
        "workers": sorted({e.user.name for e in entries}),
        "hours_by_location": per_location,
        "total_hours": sum((e.hours for e in entries), 0),
    }
