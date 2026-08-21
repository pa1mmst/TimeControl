"""API учёта времени. Вся бизнес-логика — в services/work_entries.py."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

# Если зависимости в вашем каркасе лежат не в app.deps — поправьте импорт.
from app.deps import get_db, get_current_user
from app.models import User
from app.schemas.work_entries import (
    AuditRecordOut, GroupEntryCreate, GroupEntryResult, TaskSummaryOut,
    WorkEntryCreate, WorkEntryOut, WorkEntryUpdate,
)
from app.services import work_entries as svc
from app.services.work_entries import WorkEntryError

router = APIRouter(prefix="/work-entries", tags=["work-entries"])


def _handle(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except WorkEntryError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post("", response_model=WorkEntryOut, status_code=201)
def create_entry(
    payload: WorkEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Индивидуальная запись: работник за себя, руководитель — за любого."""
    return _handle(
        svc.create_entry, db, actor=current_user,
        task_id=payload.task_id, work_date=payload.work_date,
        hours=payload.hours, location_id=payload.location_id,
        user_id=payload.user_id,
    )


@router.post("/group", response_model=GroupEntryResult, status_code=201)
def create_group_entries(
    payload: GroupEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Групповой ввод учётчика: одно действие -> запись каждому участнику."""
    created, skipped = _handle(
        svc.create_group_entries, db, actor=current_user,
        group_id=payload.group_id, work_date=payload.work_date,
        hours=payload.hours, location_id=payload.location_id,
        exclude_user_ids=payload.exclude_user_ids,
    )
    return {"created": created, "skipped": skipped}


@router.patch("/{entry_id}", response_model=WorkEntryOut)
def update_hours(
    entry_id: int,
    payload: WorkEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Правка часов: только руководитель, изменение фиксируется в AuditLog."""
    return _handle(
        svc.update_hours, db, actor=current_user,
        entry_id=entry_id, new_hours=payload.hours, reason=payload.reason,
    )


@router.get("", response_model=list[WorkEntryOut])
def list_entries(
    user_id: int | None = Query(None),
    task_id: int | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Работник получает только свои записи; руководитель — с любыми фильтрами."""
    return _handle(
        svc.list_entries, db, actor=current_user,
        user_id=user_id, task_id=task_id,
        date_from=date_from, date_to=date_to,
    )


@router.get("/task/{task_id}/summary", response_model=TaskSummaryOut)
def task_summary(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Сводка по заданию: по людям, по группам ввода, итог (SPEC п.11)."""
    return _handle(svc.task_summary, db, actor=current_user, task_id=task_id)


@router.get("/{entry_id}", response_model=WorkEntryOut)
def get_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _handle(svc.get_entry, db, actor=current_user, entry_id=entry_id)


@router.get("/{entry_id}/history", response_model=list[AuditRecordOut])
def entry_history(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """История изменений записи: видна владельцу и руководителю (SPEC п.9)."""
    return _handle(svc.get_entry_history, db, actor=current_user, entry_id=entry_id)
