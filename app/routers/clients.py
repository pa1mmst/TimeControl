"""API заказчиков и их локаций. Локации всегда принадлежат заказчику.

Все эндпоинты — только для руководителя (аудит, п.1–3, п.6):
router-level dependency require_manager_dep; actor берётся из подписанного
initData. Изменения фиксируются в журнале (log_change).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_manager_dep
from app.models import Client, Location, TaskLocation, User, WorkEntry
from app.schemas import (
    ClientCreate,
    ClientOut,
    ClientUpdate,
    LocationCreate,
    LocationOut,
    LocationUpdate,
)
from app.services.audit import log_change

router = APIRouter(
    prefix="/api/clients",
    tags=["clients"],
    dependencies=[Depends(require_manager_dep)],
)


# ---------- Заказчики ----------

@router.post("", response_model=ClientOut)
def create_client(
    data: ClientCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    client = Client(**data.model_dump())
    db.add(client)
    db.flush()
    log_change(
        db, actor_id=actor.id, entity="clients", entity_id=client.id,
        field="created", old_value=None, new_value=client.name,
    )
    db.commit()
    db.refresh(client)
    return client


@router.get("", response_model=list[ClientOut])
def list_clients(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(Client)
    if not include_inactive:
        q = q.filter(Client.is_active == True)
    return q.order_by(Client.name).all()


@router.get("/{client_id}", response_model=ClientOut)
def get_client(client_id: int, db: Session = Depends(get_db)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Заказчик не найден")
    return client


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: int,
    data: ClientUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Заказчик не найден")
    for field, value in data.model_dump(exclude_unset=True).items():
        old = getattr(client, field)
        if str(old) != str(value):
            log_change(
                db, actor_id=actor.id, entity="clients", entity_id=client.id,
                field=field, old_value=old, new_value=value,
            )
            setattr(client, field, value)
    db.commit()
    db.refresh(client)
    return client


# ---------- Локации заказчика ----------

@router.post("/{client_id}/locations", response_model=LocationOut)
def create_location(
    client_id: int,
    data: LocationCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    if not db.get(Client, client_id):
        raise HTTPException(404, "Заказчик не найден")
    loc = Location(client_id=client_id, **data.model_dump())
    db.add(loc)
    db.flush()
    log_change(
        db, actor_id=actor.id, entity="locations", entity_id=loc.id,
        field="created", old_value=None, new_value=loc.name,
    )
    db.commit()
    db.refresh(loc)
    return loc


@router.get("/{client_id}/locations", response_model=list[LocationOut])
def list_locations(client_id: int, db: Session = Depends(get_db)):
    if not db.get(Client, client_id):
        raise HTTPException(404, "Заказчик не найден")
    return (
        db.query(Location)
        .filter(Location.client_id == client_id)
        .order_by(Location.name)
        .all()
    )


@router.patch("/{client_id}/locations/{location_id}", response_model=LocationOut)
def update_location(
    client_id: int, location_id: int, data: LocationUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    loc = db.get(Location, location_id)
    if not loc or loc.client_id != client_id:
        raise HTTPException(404, "Локация не найдена")
    for field, value in data.model_dump(exclude_unset=True).items():
        old = getattr(loc, field)
        if str(old) != str(value):
            log_change(
                db, actor_id=actor.id, entity="locations", entity_id=loc.id,
                field=field, old_value=old, new_value=value,
            )
            setattr(loc, field, value)
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/{client_id}/locations/{location_id}")
def delete_location(
    client_id: int, location_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    """Удалить локацию заказчика. Связки с заданиями (task_locations)
    снимаются; локацию, по которой уже есть часы, удалять нельзя —
    иначе история часов потеряет место работы."""
    loc = db.get(Location, location_id)
    if not loc or loc.client_id != client_id:
        raise HTTPException(404, "Локация не найдена")
    used = db.execute(
        select(WorkEntry.id).where(WorkEntry.location_id == location_id)
    ).first()
    if used:
        raise HTTPException(
            400, "По этой локации уже есть внесённые часы — удалить нельзя"
        )
    name = loc.name
    db.query(TaskLocation).filter(
        TaskLocation.location_id == location_id
    ).delete(synchronize_session=False)
    db.delete(loc)
    log_change(
        db, actor_id=actor.id, entity="locations", entity_id=location_id,
        field="deleted", old_value=name, new_value=None,
    )
    db.commit()
    return {"ok": True}
