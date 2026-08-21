"""
Запись в журнал изменений (SPEC п.9, п.25).
Единственная точка, через которую пишется AuditLog, — чтобы формат
записей был одинаковым во всех модулях.
"""
from sqlalchemy.orm import Session

from app.models import AuditLog


def log_change(
    db: Session,
    *,
    actor_id: int,
    entity: str,
    entity_id: int,
    field: str,
    old_value,
    new_value,
    reason: str | None = None,
) -> AuditLog:
    """Добавляет запись в audit_log. Коммит делает вызывающий код."""
    rec = AuditLog(
        actor_id=actor_id,
        entity=entity,
        entity_id=entity_id,
        field=field,
        old_value=None if old_value is None else str(old_value),
        new_value=None if new_value is None else str(new_value),
        reason=reason,
    )
    db.add(rec)
    return rec


def history_for(db: Session, entity: str, entity_id: int) -> list[AuditLog]:
    """История изменений одной сущности, от старых к новым."""
    return list(
        db.query(AuditLog)
        .filter(AuditLog.entity == entity, AuditLog.entity_id == entity_id)
        .order_by(AuditLog.created_at, AuditLog.id)
    )
