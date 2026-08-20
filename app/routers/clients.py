"""API заказчиков и их локаций. Локации всегда принадлежат заказчику."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Client, Location
from app.schemas import (
    ClientCreate, ClientUpdate, ClientOut,
    LocationCreate, LocationUpdate, LocationOut,
)

router = APIRouter(prefix="/api/clients", tags=["clients"])


# ---------- Заказчики ----------

@router.post("", response_model=ClientOut)
def create_client(data: ClientCreate, db: Session = Depends(get_db)):
    client = Client(**data.model_dump())
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.get("", response_model=list[ClientOut])
def list_clients(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(Client)
    if not include_inactive:
        q = q.filter(Client.is_active == True)  # noqa: E712
    return q.order_by(Client.name).all()


@router.get("/{client_id}", response_model=ClientOut)
def get_client(client_id: int, db: Session = Depends(get_db)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Заказчик не найден")
    return client


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(client_id: int, data: ClientUpdate, db: Session = Depends(get_db)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Заказчик не найден")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(client, field, value)
    db.commit()
    db.refresh(client)
    return client


# ---------- Локации заказчика ----------

@router.post("/{client_id}/locations", response_model=LocationOut)
def create_location(client_id: int, data: LocationCreate, db: Session = Depends(get_db)):
    if not db.get(Client, client_id):
        raise HTTPException(404, "Заказчик не найден")
    loc = Location(client_id=client_id, **data.model_dump())
    db.add(loc)
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
):
    loc = db.get(Location, location_id)
    if not loc or loc.client_id != client_id:
        raise HTTPException(404, "Локация не найдена")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(loc, field, value)
    db.commit()
    db.refresh(loc)
    return loc
