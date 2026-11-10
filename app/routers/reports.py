"""
Отчёты (SPEC п.19, п.27). Роутер тонкий (аудит, п.14): вся бизнес-логика —
в app/services/reports.py; здесь только HTTP: пути, парсеры и коды ошибок.
Ответы — словари: структуры разные, плодить схемы на каждый отчёт нет смысла.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_manager_dep
from app.services.reports import (
    client_report,
    location_report,
    task_report,
    user_report,
)

# Все отчёты — только для руководителя (аудит, п.1–3).
router = APIRouter(
    prefix="/api/reports",
    tags=["reports"],
    dependencies=[Depends(require_manager_dep)],
)


@router.get("/user/{user_id}")
def report_user(
    user_id: int,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
):
    """Сколько часов, за какие дни, где, сколько заработал, статус выплат."""
    data = user_report(db, user_id, start, end)
    if data is None:
        raise HTTPException(404, "Сотрудник не найден")
    return data


@router.get("/task/{task_id}")
def report_task(task_id: int, db: Session = Depends(get_db)):
    """Кто назначен, группы/учётчики, часы по людям и всего (SPEC п.11)."""
    data = task_report(db, task_id)
    if data is None:
        raise HTTPException(404, "Задание не найдено")
    return data


@router.get("/location/{location_id}")
def report_location(
    location_id: int,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
):
    """Какие задания, какие люди, сколько часов на этом месте."""
    data = location_report(db, location_id, start, end)
    if data is None:
        raise HTTPException(404, "Локация не найдена")
    return data


@router.get("/client/{client_id}")
def report_client(
    client_id: int,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
):
    """Все локации, задания, люди и общее число часов заказчика (SPEC п.18)."""
    data = client_report(db, client_id, start, end)
    if data is None:
        raise HTTPException(404, "Заказчик не найден")
    return data
