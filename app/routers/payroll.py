"""API денег: авансы, расчёт периода, выплаты.

Все эндпоинты — только для руководителя (аудит, п.1–3):
router-level dependency require_manager_dep; actor берётся из подписанного
initData, actor_id из тела запроса игнорируется (схемы не менялись,
чтобы не ломать фронтенд).
"""
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_manager_dep
from app.errors import AppError
from app.models import Advance, AuditLog, Payout, User
from app.schemas import (
    AdvanceCreate,
    AdvanceOut,
    AdvanceUpdate,
    PayoutOut,
    PayoutStatusUpdate,
    PayrollClose,
    PayrollRow,
)
from app.services import payroll as payroll_service

router = APIRouter(
    prefix="/api/payroll",
    tags=["payroll"],
    dependencies=[Depends(require_manager_dep)],
)


# ---------- Авансы ----------

@router.post("/advances", response_model=AdvanceOut)
def create_advance(
    data: AdvanceCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    if not db.get(User, data.user_id):
        raise AppError(404, "err_worker_not_found")
    payload = data.model_dump()
    # Actor из подписанного initData; поле created_by из тела игнорируем.
    payload["created_by"] = actor.id
    a = Advance(**payload)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


@router.get("/advances", response_model=list[AdvanceOut])
def list_advances(
    user_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Advance)
    if user_id:
        q = q.filter(Advance.user_id == user_id)
    if start:
        q = q.filter(Advance.date >= start)
    if end:
        q = q.filter(Advance.date <= end)
    return q.order_by(Advance.date.desc()).all()


@router.patch("/advances/{advance_id}", response_model=AdvanceOut)
def update_advance(
    advance_id: int,
    data: AdvanceUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    a = db.get(Advance, advance_id)
    if not a:
        raise AppError(404, "err_advance_not_found")
    # Аванс, уже учтённый в закрытом периоде, менять нельзя —
    # иначе payout и реальность разойдутся
    locked = (
        db.query(Payout)
        .filter(
            Payout.user_id == a.user_id,
            Payout.period_start <= a.date,
            Payout.period_end >= a.date,
        )
        .first()
    )
    if locked:
        raise AppError(400, "err_advance_in_closed")

    payload = data.model_dump(exclude_unset=True)
    payload.pop("actor_id", None)  # actor_id из тела игнорируем
    reason = payload.pop("reason", None)
    actor_id = actor.id  # actor из подписанного initData
    for field, value in payload.items():
        old = getattr(a, field)
        if str(old) != str(value):
            db.add(AuditLog(
                actor_id=actor_id, entity="advances", entity_id=a.id,
                field=field, old_value=str(old), new_value=str(value),
                reason=reason,
            ))
            setattr(a, field, value)
    db.commit()
    db.refresh(a)
    return a


# ---------- Расчёт периода ----------

@router.get("/preview", response_model=list[PayrollRow])
def preview(start: date, end: date, db: Session = Depends(get_db)):
    """Таблица 'Сотрудник|Часы|Начислено|Аванс|К выплате' без сохранения."""
    return payroll_service.preview_period(db, start, end)


@router.post("/close", response_model=list[PayoutOut])
def close_period(
    data: PayrollClose,
    db: Session = Depends(get_db),
):
    """Зафиксировать период: создаёт payout каждому сотруднику."""
    if data.period_end < data.period_start:
        raise AppError(400, "err_date_end_before_start")
    return payroll_service.close_period(db, data.period_start, data.period_end)


# ---------- Выплаты ----------

@router.get("/payouts", response_model=list[PayoutOut])
def list_payouts(
    user_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Payout)
    if user_id:
        q = q.filter(Payout.user_id == user_id)
    if status:
        q = q.filter(Payout.status == status)
    return q.order_by(Payout.id.desc()).all()


@router.patch("/payouts/{payout_id}", response_model=PayoutOut)
def update_payout_status(
    payout_id: int,
    data: PayoutStatusUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    p = db.get(Payout, payout_id)
    if not p:
        raise AppError(404, "err_payout_not_found")
    # Actor из подписанного initData; actor_id из тела игнорируем.
    effective_actor_id = actor.id
    return payroll_service.set_payout_status(db, p, data.status, effective_actor_id)
