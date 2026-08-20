"""
Pydantic-схемы: формат данных, которые API принимает и отдаёт.
Отделены от models.py: модели — это база данных, схемы — это "анкеты"
для входящих и исходящих запросов.
"""
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict

from app.models import Lang


# ---------- Сотрудники ----------

class UserCreate(BaseModel):
    """Что руководитель заполняет при создании сотрудника."""
    name: str
    phone: str | None = None
    lang: Lang = Lang.ru
    hourly_rate: Decimal = Decimal("0")
    is_manager: bool = False


class UserUpdate(BaseModel):
    """Все поля необязательные: меняем только то, что прислали."""
    name: str | None = None
    phone: str | None = None
    lang: Lang | None = None
    hourly_rate: Decimal | None = None
    is_manager: bool | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    """Что API отдаёт наружу."""
    model_config = ConfigDict(from_attributes=True)  # позволяет отдавать объекты SQLAlchemy

    id: int
    tg_id: int | None
    name: str
    phone: str | None
    lang: Lang
    hourly_rate: Decimal
    is_manager: bool
    is_active: bool
    created_at: datetime


# ---------- Заказчики ----------

class ClientCreate(BaseModel):
    name: str
    notes: str | None = None


class ClientUpdate(BaseModel):
    name: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    name: str
    address: str | None
    map_url: str | None
    lat: float | None
    lon: float | None


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    notes: str | None
    is_active: bool
    locations: list[LocationOut] = []


# ---------- Локации ----------

class LocationCreate(BaseModel):
    name: str
    address: str | None = None
    map_url: str | None = None
    lat: float | None = None
    lon: float | None = None


class LocationUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    map_url: str | None = None
    lat: float | None = None
    lon: float | None = None
