"""Pydantic-схемы модуля учёта времени."""
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models import PayType


class WorkEntryCreate(BaseModel):
    task_id: int
    work_date: date
    hours: Decimal = Field(gt=0, le=24, decimal_places=2)
    location_id: int | None = None
    # user_id указывает только руководитель, когда создаёт запись за другого.
    # Обычный работник это поле не передаёт — запись создаётся на него самого.
    user_id: int | None = None


class GroupEntryCreate(BaseModel):
    """Групповой ввод учётчика: одно действие -> N индивидуальных записей."""
    group_id: int
    work_date: date
    hours: Decimal = Field(gt=0, le=24, decimal_places=2)
    location_id: int | None = None
    # Кого из группы пропустить (человек не работал в этот день) —
    # SPEC п.5: нестандартные ситуации не должны ломать массовый ввод.
    exclude_user_ids: list[int] = []


class WorkEntryUpdate(BaseModel):
    """Правка часов. Только руководитель (SPEC п.9)."""
    hours: Decimal = Field(gt=0, le=24, decimal_places=2)
    # Причина по SPEC "желательна" — поле опциональное, но UI должен её просить.
    reason: str | None = None


class WorkEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    task_id: int
    location_id: int | None
    work_date: date
    hours: Decimal
    rate_snapshot: Decimal
    pay_type: PayType
    entered_by: int
    created_at: datetime


class SkippedMember(BaseModel):
    user_id: int
    reason: str  # "already_has_entry" | "excluded"


class GroupEntryResult(BaseModel):
    created: list[WorkEntryOut]
    skipped: list[SkippedMember]


class AuditRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_id: int
    field: str
    old_value: str | None
    new_value: str | None
    reason: str | None
    created_at: datetime


class UserHours(BaseModel):
    user_id: int
    user_name: str
    total_hours: Decimal
    total_amount: Decimal  # sum(hours * rate_snapshot)


class GroupHours(BaseModel):
    group_id: int | None  # None = одиночки вне групп
    reporter_id: int | None
    total_hours: Decimal


class TaskSummaryOut(BaseModel):
    """SPEC п.11: индивидуально + по группам ввода + итог по заданию."""
    task_id: int
    by_user: list[UserHours]
    by_group: list[GroupHours]
    total_hours: Decimal
