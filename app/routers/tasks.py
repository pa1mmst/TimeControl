"""
API заданий: создание, назначение людей, группы с учётчиком.
Ключевые правила из SPEC:
- задание <-> локации many-to-many (п.2, п.18);
- группа — механизм ввода, не бизнес-сущность (п.1, п.26);
- одиночки на задании = assignment с group_id = NULL (п.3, п.11);
- учётчик — назначаемая роль внутри задания, не тип сотрудника (п.13).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Task, TaskLocation, TaskGroup, TaskAssignment,
    Client, Location, User, WorkEntry,
)
from app.schemas import (
    TaskCreate, TaskUpdate, TaskOut, TaskShortOut,
    AssignmentCreate, AssignmentUpdate, AssignmentOut,
    GroupCreate, GroupOut,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# ---------- Вспомогательные ----------

def _get_task(task_id: int, db: Session) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Задание не найдено")
    return task


def _set_locations(task: Task, location_ids: list[int], db: Session):
    """Полностью заменяет набор локаций задания.
    Проверяем, что локации принадлежат заказчику задания."""
    for loc_id in location_ids:
        loc = db.get(Location, loc_id)
        if not loc or loc.client_id != task.client_id:
            raise HTTPException(
                400, f"Локация {loc_id} не найдена или принадлежит другому заказчику"
            )
    db.query(TaskLocation).filter(TaskLocation.task_id == task.id).delete()
    for loc_id in location_ids:
        db.add(TaskLocation(task_id=task.id, location_id=loc_id))


# ---------- Задания ----------

@router.post("", response_model=TaskOut)
def create_task(data: TaskCreate, db: Session = Depends(get_db)):
    if not db.get(Client, data.client_id):
        raise HTTPException(404, "Заказчик не найден")
    if not db.get(User, data.created_by):
        raise HTTPException(404, "Автор (created_by) не найден")

    task = Task(
        title=data.title,
        description=data.description,
        client_id=data.client_id,
        date_start=data.date_start,
        date_end=data.date_end,
        created_by=data.created_by,
    )
    db.add(task)
    db.flush()  # получаем task.id до коммита, чтобы привязать локации
    _set_locations(task, data.location_ids, db)
    db.commit()
    db.refresh(task)
    return task


@router.get("", response_model=list[TaskShortOut])
def list_tasks(status: str | None = None, db: Session = Depends(get_db)):
    """Список заданий, можно фильтровать: ?status=active"""
    q = db.query(Task)
    if status:
        q = q.filter(Task.status == status)
    return q.order_by(Task.id.desc()).all()


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    return _get_task(task_id, db)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db)):
    task = _get_task(task_id, db)
    payload = data.model_dump(exclude_unset=True)
    location_ids = payload.pop("location_ids", None)
    for field, value in payload.items():
        setattr(task, field, value)
    if location_ids is not None:
        _set_locations(task, location_ids, db)
    db.commit()
    db.refresh(task)
    return task


# ---------- Назначения людей ----------

@router.post("/{task_id}/assignments", response_model=AssignmentOut)
def assign_user(task_id: int, data: AssignmentCreate, db: Session = Depends(get_db)):
    task = _get_task(task_id, db)
    user = db.get(User, data.user_id)
    if not user or not user.is_active:
        raise HTTPException(404, "Сотрудник не найден или деактивирован")
    exists = (
        db.query(TaskAssignment)
        .filter_by(task_id=task.id, user_id=user.id)
        .first()
    )
    if exists:
        raise HTTPException(400, "Сотрудник уже назначен на это задание")
    a = TaskAssignment(task_id=task.id, user_id=user.id)  # group_id=NULL = одиночка
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


@router.patch("/{task_id}/assignments/{user_id}", response_model=AssignmentOut)
def move_assignment(
    task_id: int, user_id: int, data: AssignmentUpdate,
    db: Session = Depends(get_db),
):
    """Переместить человека в группу (group_id) или сделать одиночкой (null)."""
    a = (
        db.query(TaskAssignment)
        .filter_by(task_id=task_id, user_id=user_id)
        .first()
    )
    if not a:
        raise HTTPException(404, "Назначение не найдено")
    if data.group_id is not None:
        group = db.get(TaskGroup, data.group_id)
        if not group or group.task_id != task_id:
            raise HTTPException(400, "Группа не найдена на этом задании")
    a.group_id = data.group_id
    db.commit()
    db.refresh(a)
    return a


@router.delete("/{task_id}/assignments/{user_id}")
def unassign_user(task_id: int, user_id: int, db: Session = Depends(get_db)):
    a = (
        db.query(TaskAssignment)
        .filter_by(task_id=task_id, user_id=user_id)
        .first()
    )
    if not a:
        raise HTTPException(404, "Назначение не найдено")
    # Нельзя снять человека, если у него уже есть часы по заданию:
    # иначе отчёты покажут часы "ничьего" участника
    has_hours = (
        db.query(WorkEntry)
        .filter_by(task_id=task_id, user_id=user_id)
        .first()
    )
    if has_hours:
        raise HTTPException(400, "У сотрудника уже есть часы по заданию — снять нельзя")
    # Учётчика сначала нужно заменить или распустить его группу
    is_reporter = (
        db.query(TaskGroup)
        .filter_by(task_id=task_id, reporter_id=user_id)
        .first()
    )
    if is_reporter:
        raise HTTPException(400, "Сотрудник — учётчик группы. Сначала распустите группу")
    db.delete(a)
    db.commit()
    return {"ok": True}


# ---------- Группы ----------

@router.post("/{task_id}/groups", response_model=GroupOut)
def create_group(task_id: int, data: GroupCreate, db: Session = Depends(get_db)):
    task = _get_task(task_id, db)
    # Учётчик автоматически считается участником группы
    member_ids = set(data.member_ids) | {data.reporter_id}
    # Все участники должны быть уже назначены на задание
    assignments = (
        db.query(TaskAssignment)
        .filter(
            TaskAssignment.task_id == task.id,
            TaskAssignment.user_id.in_(member_ids),
        )
        .all()
    )
    found_ids = {a.user_id for a in assignments}
    missing = member_ids - found_ids
    if missing:
        raise HTTPException(
            400, f"Сначала назначьте на задание сотрудников: {sorted(missing)}"
        )
    group = TaskGroup(task_id=task.id, reporter_id=data.reporter_id)
    db.add(group)
    db.flush()
    for a in assignments:
        a.group_id = group.id
    db.commit()
    db.refresh(group)
    return group


@router.delete("/{task_id}/groups/{group_id}")
def delete_group(task_id: int, group_id: int, db: Session = Depends(get_db)):
    """Распустить группу: участники остаются на задании как одиночки."""
    group = db.get(TaskGroup, group_id)
    if not group or group.task_id != task_id:
        raise HTTPException(404, "Группа не найдена")
    for a in group.members:
        a.group_id = None
    db.delete(group)
    db.commit()
    return {"ok": True}
