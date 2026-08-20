from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Numeric,
    Boolean,
    DateTime,
    Date,
    ForeignKey,
    Table,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .db import Base


# Many-to-many association table: Task <-> Location
task_locations = Table(
    "task_locations",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id"), primary_key=True),
    Column("location_id", Integer, ForeignKey("locations.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    tg_id = Column(Integer, unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    lang = Column(String(10), nullable=False, default="ru")  # ru / uk / es
    hourly_rate = Column(Numeric(10, 2), nullable=False, default=0)
    is_manager = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # relationships
    created_tasks = relationship("Task", foreign_keys="Task.created_by", back_populates="creator")
    entered_work_entries = relationship("WorkEntry", foreign_keys="WorkEntry.entered_by", back_populates="entered_by_user")
    work_entries = relationship("WorkEntry", foreign_keys="WorkEntry.user_id", back_populates="user")
    advances = relationship("Advance", back_populates="user")
    payouts = relationship("Payout", back_populates="user")
    inventory_items = relationship("InventoryItem", foreign_keys="InventoryItem.holder_id", back_populates="holder")
    assignments = relationship("TaskAssignment", back_populates="user")
    reported_groups = relationship("TaskGroup", foreign_keys="TaskGroup.reporter_id", back_populates="reporter")


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    locations = relationship("Location", back_populates="client")
    tasks = relationship("Task", back_populates="client")


class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    address = Column(String(255), nullable=True)
    lat = Column(Numeric(10, 7), nullable=True)  # future GPS support
    lon = Column(Numeric(10, 7), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    client = relationship("Client", back_populates="locations")
    tasks = relationship("Task", secondary=task_locations, back_populates="locations")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    status = Column(String(50), nullable=False, default="draft")  # draft/active/done/cancelled
    date_start = Column(Date, nullable=True)
    date_end = Column(Date, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    client = relationship("Client", back_populates="tasks")
    creator = relationship("User", foreign_keys=[created_by], back_populates="created_tasks")
    locations = relationship("Location", secondary=task_locations, back_populates="tasks")
    groups = relationship("TaskGroup", back_populates="task", cascade="all, delete-orphan")
    assignments = relationship("TaskAssignment", back_populates="task", cascade="all, delete-orphan")
    work_entries = relationship("WorkEntry", back_populates="task")


class TaskGroup(Base):
    """A group of workers inside one task. The reporter is the contact person
    who enters hours on behalf of the group."""

    __tablename__ = "task_groups"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=True)  # optional group label
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    task = relationship("Task", back_populates="groups")
    reporter = relationship("User", foreign_keys=[reporter_id], back_populates="reported_groups")
    assignments = relationship("TaskAssignment", back_populates="group")


class TaskAssignment(Base):
    """A user assigned to a task. If group_id is null, the user works alone."""

    __tablename__ = "task_assignments"
    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_task_assignment"),
    )

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("task_groups.id"), nullable=True)
    is_reporter = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    task = relationship("Task", back_populates="assignments")
    user = relationship("User", back_populates="assignments")
    group = relationship("TaskGroup", back_populates="assignments")


class WorkEntry(Base):
    """Individual work record: one user + one day. Hours are individual even
    when entered by a reporter for a whole group."""

    __tablename__ = "work_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    work_date = Column(Date, nullable=False, index=True)
    hours = Column(Numeric(10, 2), nullable=False)
    rate_snapshot = Column(Numeric(10, 2), nullable=False)  # copy of user's rate at entry time
    pay_type = Column(String(50), nullable=False, default="hourly")  # hourly / piecework (future)
    entered_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", foreign_keys=[user_id], back_populates="work_entries")
    task = relationship("Task", back_populates="work_entries")
    location = relationship("Location")
    entered_by_user = relationship("User", foreign_keys=[entered_by], back_populates="entered_work_entries")


class Advance(Base):
    """An advance payment made to a user."""

    __tablename__ = "advances"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    date = Column(Date, nullable=False)
    comment = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="advances")


class Payout(Base):
    """Calculated payout for a period."""

    __tablename__ = "payouts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    gross = Column(Numeric(10, 2), nullable=False, default=0)
    advances_total = Column(Numeric(10, 2), nullable=False, default=0)
    net = Column(Numeric(10, 2), nullable=False, default=0)
    status = Column(String(50), nullable=False, default="accrued")  # accrued/pending/paid
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="payouts")


class InventoryItem(Base):
    """A simple register of which worker currently holds an item."""

    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    holder_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # null = in storage
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    holder = relationship("User", foreign_keys=[holder_id], back_populates="inventory_items")


class AuditLog(Base):
    """Immutable audit trail for changes to important fields."""

    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    entity = Column(String(100), nullable=False)   # e.g. "work_entries"
    entity_id = Column(Integer, nullable=False)
    field = Column(String(100), nullable=False)    # e.g. "hours"
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    actor = relationship("User")