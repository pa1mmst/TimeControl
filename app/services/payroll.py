"""
Расчёт зарплаты за период (SPEC п.17).
Правила:
- начислено = сумма hours * rate_snapshot из work_entries —
  история ставок не плывёт при смене ставки (SPEC п.16);
- все деньги — Decimal, никакого float;
- закрытие периода ФИКСИРУЕТ числа в payouts: правки часов задним числом
  не меняют уже созданную выплату (осознанное решение из models.py);
- у одного человека не может быть двух пересекающихся периодов выплат.
"""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    User, WorkEntry, Advance, Payout, PayoutStatus, AuditLog,
)

CENT = Decimal("0.01")


def _q(x) -> Decimal:
    """Приводит любое число к Decimal с 2 знаками."""
    return Decimal(x or 0).quantize(CENT)


def preview_period(db: Session, start: date, end: date) -> list[dict]:
    """Таблица расчёта БЕЗ сохранения — руководитель сверяет глазами."""
    work = (
        db.query(
            WorkEntry.user_id,
            func.sum(WorkEntry.hours).label("hours"),
            func.sum(WorkEntry.hours * WorkEntry.rate_snapshot).label("gross"),
        )
        .filter(WorkEntry.work_date >= start, WorkEntry.work_date <= end)
        .group_by(WorkEntry.user_id)
        .all()
    )
    advances = dict(
        db.query(Advance.user_id, func.sum(Advance.amount))
        .filter(Advance.date >= start, Advance.date <= end)
        .group_by(Advance.user_id)
        .all()
    )
    work_map = {w.user_id: w for w in work}
    user_ids = set(work_map) | set(advances)
    users = {
        u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()
    }

    rows = []
    for uid in sorted(user_ids):
        w = work_map.get(uid)
        gross = _q(w.gross if w else 0)
        adv = _q(advances.get(uid, 0))
        rows.append({
            "user_id": uid,
            "name": users[uid].name if uid in users else "?",
            "hours": _q(w.hours if w else 0),
            "gross": gross,
            "advances_total": adv,
            "net": _q(gross - adv),
        })
    return rows


def close_period(db: Session, start: date, end: date) -> list[Payout]:
    """Создаёт payout каждому, у кого в периоде есть часы или авансы."""
    # Защита от двойного закрытия / пересечения периодов
    overlapping = (
        db.query(Payout)
        .filter(Payout.period_start <= end, Payout.period_end >= start)
        .all()
    )
    if overlapping:
        busy = sorted({p.user_id for p in overlapping})
        raise ValueError(
            f"Период пересекается с уже закрытыми выплатами сотрудников: {busy}"
        )

    payouts = []
    for row in preview_period(db, start, end):
        p = Payout(
            user_id=row["user_id"],
            period_start=start,
            period_end=end,
            gross=row["gross"],
            advances_total=row["advances_total"],
            net=row["net"],
            status=PayoutStatus.accrued,
        )
        db.add(p)
        payouts.append(p)
    db.commit()
    for p in payouts:
        db.refresh(p)
    return payouts


def set_payout_status(
    db: Session, payout: Payout, new_status: PayoutStatus, actor_id: int
) -> Payout:
    """Смена статуса выплаты — всегда через аудит (SPEC п.25)."""
    old = payout.status.value
    payout.status = new_status
    payout.paid_at = datetime.now() if new_status == PayoutStatus.paid else None
    db.add(AuditLog(
        actor_id=actor_id,
        entity="payouts",
        entity_id=payout.id,
        field="status",
        old_value=old,
        new_value=new_status.value,
    ))
    db.commit()
    db.refresh(payout)
    return payout
