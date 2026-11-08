"""Инвентарь (SPEC п.20): предмет + у кого. Без истории движения.

Все эндпоинты — только для руководителя (аудит, п.1–3, п.6):
router-level dependency require_manager_dep; actor из подписанного initData.
Изменения фиксируются в журнале (log_change).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_manager_dep
from app.models import InventoryItem, User
from app.schemas import InventoryCreate, InventoryOut, InventoryUpdate
from app.services.audit import log_change

router = APIRouter(
    prefix="/api/inventory",
    tags=["inventory"],
    dependencies=[Depends(require_manager_dep)],
)


def _check_holder(holder_id: int | None, db: Session):
    if holder_id is not None:
        u = db.get(User, holder_id)
        if not u or not u.is_active:
            raise HTTPException(404, "Сотрудник не найден или деактивирован")


@router.post("", response_model=InventoryOut)
def create_item(
    data: InventoryCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    _check_holder(data.holder_id, db)
    item = InventoryItem(**data.model_dump())
    db.add(item)
    db.flush()
    log_change(
        db, actor_id=actor.id, entity="inventory", entity_id=item.id,
        field="created", old_value=None, new_value=item.name,
    )
    db.commit()
    db.refresh(item)
    return item


@router.get("", response_model=list[InventoryOut])
def list_items(
    holder_id: int | None = None,
    on_stock: bool = False,   # ?on_stock=true — только склад
    db: Session = Depends(get_db),
):
    q = db.query(InventoryItem)
    if on_stock:
        q = q.filter(InventoryItem.holder_id.is_(None))
    elif holder_id:
        q = q.filter(InventoryItem.holder_id == holder_id)
    return q.order_by(InventoryItem.name).all()


@router.patch("/{item_id}", response_model=InventoryOut)
def update_item(
    item_id: int,
    data: InventoryUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    """Переименовать, передать другому человеку или вернуть на склад
    (прислать "holder_id": null)."""
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(404, "Предмет не найден")
    payload = data.model_dump(exclude_unset=True)
    if "holder_id" in payload:
        _check_holder(payload["holder_id"], db)
    for field, value in payload.items():
        old = getattr(item, field)
        if str(old) != str(value):
            log_change(
                db, actor_id=actor.id, entity="inventory", entity_id=item.id,
                field=field, old_value=old, new_value=value,
            )
            setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}")
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    """Списать предмет (сломался/потерян). История по SPEC п.20 не нужна."""
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(404, "Предмет не найден")
    name = item.name
    db.delete(item)
    log_change(
        db, actor_id=actor.id, entity="inventory", entity_id=item_id,
        field="deleted", old_value=name, new_value=None,
    )
    db.commit()
    return {"ok": True}
