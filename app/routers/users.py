"""API сотрудников: создание, список, карточка, изменение, деактивация.

Все эндпоинты — только для руководителя (аудит, п.1–3, п.6):
router-level dependency require_manager_dep; actor берётся из подписанного
initData, fallback на X-Actor-Id удалён.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_manager_dep
from app.models import User
from app.schemas import UserCreate, UserOut, UserUpdate
from app.services.audit import log_change

router = APIRouter(
    prefix="/api/users",
    tags=["users"],
    dependencies=[Depends(require_manager_dep)],
)


@router.post("", response_model=UserOut)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    user = User(**data.model_dump())
    db.add(user)
    db.flush()  # получаем user.id до коммита, чтобы записать аудит
    log_change(
        db, actor_id=actor.id, entity="users", entity_id=user.id,
        field="created", old_value=None, new_value=user.name,
    )
    db.commit()
    db.refresh(user)
    return user


@router.get("", response_model=list[UserOut])
def list_users(include_inactive: bool = False, db: Session = Depends(get_db)):
    """По умолчанию показываем только активных (SPEC п.14)."""
    q = db.query(User)
    if not include_inactive:
        q = q.filter(User.is_active == True)
    return q.order_by(User.name).all()


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    """
    Изменение сотрудника, в т.ч. ставки.
    Смена ставки безопасна для истории: старые work_entries хранят
    rate_snapshot и не пересчитываются (SPEC п.16).
    Каждое изменённое поле фиксируется в журнале (аудит, п.6).
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")
    # exclude_unset: трогаем только присланные поля
    for field, value in data.model_dump(exclude_unset=True).items():
        old = getattr(user, field)
        if str(old) != str(value):
            log_change(
                db, actor_id=actor.id, entity="users", entity_id=user.id,
                field=field, old_value=old, new_value=value,
            )
            setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", response_model=UserOut)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager_dep),
):
    """
    НЕ удаляем: у сотрудника есть история часов и денег.
    Деактивация скрывает его из списков (SPEC п.14).
    Защита (аудит, п.6): нельзя деактивировать самого себя и
    последнего активного руководителя.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")
    if actor.id == user_id:
        raise HTTPException(400, "Нельзя деактивировать самого себя")
    if user.is_manager and user.is_active:
        active_managers = (
            db.query(User)
            .filter(User.is_manager == True, User.is_active == True)
            .count()
        )
        if active_managers <= 1:
            raise HTTPException(
                400, "Нельзя деактивировать последнего активного руководителя"
            )
    old_active = user.is_active
    user.is_active = False
    log_change(
        db, actor_id=actor.id, entity="users", entity_id=user.id,
        field="is_active", old_value=old_active, new_value=False,
    )
    db.commit()
    db.refresh(user)
    return user
