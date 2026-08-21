"""
Pydantic-схемы: формат данных, которые API принимает и отдаёт.
Отделены от models.py: модели — это база данных, схемы — это "анкеты"
для входящих и исходящих запросов.
"""
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, ConfigDict

from app.models import Lang, TaskStatus, PayoutStatus


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


# ---------- Задания (модуль 4) ----------

class UserShort(BaseModel):
    """Короткая карточка человека для вложенных списков."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    client_id: int
    # Список id локаций этого заказчика. Может быть пустым:
    # локация не всегда важна (SPEC п.2).
    location_ids: list[int] = []
    date_start: date | None = None
    date_end: date | None = None
    created_by: int  # временно вручную; после авторизации возьмётся из Telegram


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    date_start: date | None = None
    date_end: date | None = None
    # Если прислать список — состав локаций полностью заменится на него
    location_ids: list[int] | None = None


class AssignmentCreate(BaseModel):
    user_id: int


class AssignmentUpdate(BaseModel):
    """Перемещение человека: в группу (id) или в одиночки (null)."""
    group_id: int | None = None


class GroupCreate(BaseModel):
    reporter_id: int          # учётчик — должен быть назначен на задание
    member_ids: list[int] = []  # участники; учётчик добавится сам


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user: UserShort
    group_id: int | None


class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reporter: UserShort


class TaskShortOut(BaseModel):
    """Для списка заданий."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: TaskStatus
    client_id: int
    date_start: date | None
    date_end: date | None


class TaskOut(BaseModel):
    """Полная карточка задания."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    status: TaskStatus
    client_id: int
    date_start: date | None
    date_end: date | None
    created_by: int
    locations: list[LocationOut] = []
    groups: list[GroupOut] = []
    assignments: list[AssignmentOut] = []


# ---------- Модуль 8: авансы, выплаты, инвентарь ----------

class AdvanceCreate(BaseModel):
    user_id: int
    amount: Decimal
    date: date
    comment: str | None = None
    created_by: int


class AdvanceUpdate(BaseModel):
    """Исправление аванса. Деньги не удаляются — только правка с аудитом."""
    amount: Decimal | None = None
    comment: str | None = None
    actor_id: int
    reason: str | None = None


class AdvanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    amount: Decimal
    date: date
    comment: str | None
    created_by: int


class PayrollRow(BaseModel):
    """Строка таблицы из SPEC п.17: Сотрудник | Часы | Начислено | Аванс | К выплате."""
    user_id: int
    name: str
    hours: Decimal
    gross: Decimal
    advances_total: Decimal
    net: Decimal


class PayrollClose(BaseModel):
    period_start: date
    period_end: date
    created_by: int


class PayoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    period_start: date
    period_end: date
    gross: Decimal
    advances_total: Decimal
    net: Decimal
    status: PayoutStatus
    paid_at: datetime | None


class PayoutStatusUpdate(BaseModel):
    status: PayoutStatus
    actor_id: int


class InventoryCreate(BaseModel):
    name: str
    holder_id: int | None = None   # null = на складе
    notes: str | None = None


class InventoryUpdate(BaseModel):
    name: str | None = None
    holder_id: int | None = None   # прислать null = вернуть на склад
    notes: str | None = None


class InventoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    holder_id: int | None
    holder: UserShort | None
    notes: str | None
