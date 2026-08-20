"""
Модели данных (SQLAlchemy 2.0).

Ключевые принципы из SPEC.md:
- бригада НЕ бизнес-сущность: task_groups — только механизм группового ввода;
- учёт всегда индивидуальный: групповой ввод = N строк в work_entries;
- work_entries никогда не удаляются; изменение = UPDATE + запись в audit_log;
- rate_snapshot фиксирует ставку в момент записи (смена ставки не трогает историю);
- Task <-> Location = many-to-many через task_locations;
- pay_type — задел под сдельную оплату (сейчас всегда 'hourly').
"""
import enum
from datetime import datetime, date

from sqlalchemy import (
    ForeignKey, String, Text, Numeric, Enum, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


# ---------- Перечисления (Enum) ----------

class TaskStatus(str, enum.Enum):
    draft = "draft"          # черновик — работники ещё не видят
    active = "active"        # выполняется
    done = "done"            # завершено
    cancelled = "cancelled"  # отменено


class PayType(str, enum.Enum):
    hourly = "hourly"        # почасовая (единственный тип в v1)
    # piecework = "piecework"  # задел под сдельную — раскомментировать позже


class PayoutStatus(str, enum.Enum):
    accrued = "accrued"      # начислено
    pending = "pending"      # ожидает выплаты
    paid = "paid"            # выплачено


class Lang(str, enum.Enum):
    ru = "ru"
    uk = "uk"
    es = "es"


# ---------- Пользователи ----------

class User(Base):
    """
    Один пользователь = один человек. Роли — флаги, не отдельные типы:
    руководитель может одновременно быть работником (SPEC п.1).
    Учётчик (бывш. "бригадир") — НЕ здесь: это флаг в TaskGroup.reporter_id,
    роль привязана к конкретному заданию, а не к человеку.
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # tg_id nullable: сотрудника можно завести до того, как он зашёл в бота
    tg_id: Mapped[int | None] = mapped_column(unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(32))
    lang: Mapped[Lang] = mapped_column(Enum(Lang), default=Lang.ru)
    # Numeric, не Float: деньги нельзя хранить во float (ошибки округления)
    hourly_rate: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    is_manager: Mapped[bool] = mapped_column(default=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    work_entries: Mapped[list["WorkEntry"]] = relationship(
        back_populates="user", foreign_keys="WorkEntry.user_id"
    )
    inventory: Mapped[list["InventoryItem"]] = relationship(
        back_populates="holder"
    )


# ---------- Заказчики и локации ----------

class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(default=True)

    locations: Mapped[list["Location"]] = relationship(back_populates="client")


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    name: Mapped[str] = mapped_column(String(160))
    address: Mapped[str | None] = mapped_column(Text)
    # Ссылка на Google Maps (руководитель вставляет из "Поделиться").
    # На телефоне откроется в приложении карт автоматически.
    map_url: Mapped[str | None] = mapped_column(Text)
    # lat/lon nullable — задел под GPS (SPEC п.23), сейчас не используются
    lat: Mapped[float | None]
    lon: Mapped[float | None]

    client: Mapped["Client"] = relationship(back_populates="locations")


# ---------- Задания ----------

class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus), default=TaskStatus.draft
    )
    date_start: Mapped[date | None]
    date_end: Mapped[date | None]
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    client: Mapped["Client"] = relationship()
    # many-to-many: одно задание — несколько локаций (SPEC п.2, п.18)
    locations: Mapped[list["Location"]] = relationship(
        secondary="task_locations"
    )
    groups: Mapped[list["TaskGroup"]] = relationship(back_populates="task")
    assignments: Mapped[list["TaskAssignment"]] = relationship(
        back_populates="task"
    )


class TaskLocation(Base):
    """Связка задание <-> локация. Отдельная таблица — чтобы не зашивать 1:1."""
    __tablename__ = "task_locations"

    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id"), primary_key=True
    )
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id"), primary_key=True
    )
    # Флаг из SPEC п.4: отправлять ли локацию учётчику в уведомлении
    send_to_reporter: Mapped[bool] = mapped_column(default=True)


class TaskGroup(Base):
    """
    Группа внутри задания — механизм массового ввода часов, НЕ бизнес-сущность.
    reporter_id — учётчик группы (контактное лицо, вводит часы за всех).
    Несколько групп на одном задании — норма (SPEC п.11).
    """
    __tablename__ = "task_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    task: Mapped["Task"] = relationship(back_populates="groups")
    reporter: Mapped["User"] = relationship()
    members: Mapped[list["TaskAssignment"]] = relationship(
        back_populates="group"
    )


class TaskAssignment(Base):
    """
    Назначение человека на задание.
    group_id = NULL означает "работает сам по себе" (одиночка при бригаде —
    SPEC п.3, п.11). Один человек не может быть назначен на задание дважды.
    """
    __tablename__ = "task_assignments"
    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_task_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    group_id: Mapped[int | None] = mapped_column(ForeignKey("task_groups.id"))

    task: Mapped["Task"] = relationship(back_populates="assignments")
    user: Mapped["User"] = relationship()
    group: Mapped["TaskGroup"] = relationship(back_populates="members")


# ---------- Учёт времени ----------

class WorkEntry(Base):
    """
    Одна запись = один человек + один день + одно задание (SPEC п.7).
    Если человек в один день работал на двух заданиях — будет две записи;
    сумма по дню собирается запросом.
    Групповой ввод учётчика создаёт N таких строк с одинаковым entered_by.
    Записи НИКОГДА не удаляются: правки только через UPDATE + AuditLog.
    """
    __tablename__ = "work_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"))
    work_date: Mapped[date] = mapped_column(index=True)
    hours: Mapped[float] = mapped_column(Numeric(4, 2))  # напр. 7.50
    # Снимок ставки на момент записи — смена ставки не меняет историю (SPEC п.16)
    rate_snapshot: Mapped[float] = mapped_column(Numeric(8, 2))
    pay_type: Mapped[PayType] = mapped_column(
        Enum(PayType), default=PayType.hourly
    )
    # Кто фактически создал запись: сам работник или учётчик за группу (SPEC п.8)
    entered_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped["User"] = relationship(
        back_populates="work_entries", foreign_keys=[user_id]
    )
    task: Mapped["Task"] = relationship()
    location: Mapped["Location"] = relationship()


# ---------- Деньги ----------

class Advance(Base):
    """Аванс — вычитается при расчёте периода (SPEC п.17)."""
    __tablename__ = "advances"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    date: Mapped[date]
    comment: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))


class Payout(Base):
    """
    Расчёт за период для одного сотрудника.
    gross/advances_total/net сохраняются как числа на момент расчёта,
    чтобы выплата не "поплыла", если потом исправят часы задним числом.
    """
    __tablename__ = "payouts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    period_start: Mapped[date]
    period_end: Mapped[date]
    gross: Mapped[float] = mapped_column(Numeric(10, 2))          # начислено
    advances_total: Mapped[float] = mapped_column(Numeric(10, 2)) # авансы
    net: Mapped[float] = mapped_column(Numeric(10, 2))            # к выплате
    status: Mapped[PayoutStatus] = mapped_column(
        Enum(PayoutStatus), default=PayoutStatus.accrued
    )
    paid_at: Mapped[datetime | None]


# ---------- Инвентарь ----------

class InventoryItem(Base):
    """Простейший учёт: предмет + у кого. holder_id = NULL значит "на складе"."""
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    holder_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    notes: Mapped[str | None] = mapped_column(Text)

    holder: Mapped["User"] = relationship(back_populates="inventory")


# ---------- Аудит ----------

class AuditLog(Base):
    """
    Журнал изменений (SPEC п.9, п.25). Каждое исправление часов/денег
    обязано создавать запись здесь — это делает сервисный слой, не модель.
    entity + entity_id — универсальная ссылка: "work_entries", 17.
    old/new_value хранятся строками, чтобы одна таблица покрывала любые поля.
    """
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    entity: Mapped[str] = mapped_column(String(60), index=True)
    entity_id: Mapped[int] = mapped_column(index=True)
    field: Mapped[str] = mapped_column(String(60))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
