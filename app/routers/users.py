"""API сотрудников: создание, список, карточка, изменение, деактивация."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas import UserCreate, UserUpdate, UserOut

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("", response_model=UserOut)
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    user = User(**data.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("", response_model=list[UserOut])
def list_users(include_inactive: bool = False, db: Session = Depends(get_db)):
    """По умолчанию показываем только активных (SPEC п.14)."""
    q = db.query(User)
    if not include_inactive:
        q = q.filter(User.is_active == True)  # noqa: E712
    return q.order_by(User.name).all()


@router.get("/me", include_in_schema=False)
def me_reserved():
    """Резерв: /api/users/me обслуживает miniapp.py (проверка подписи initData).
    miniapp включён в main.py раньше, поэтому до сюда выполнение не доходит."""
    raise HTTPException(404, "Reserved for miniapp")


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    """
    Изменение сотрудника, в т.ч. ставки.
    Смена ставки безопасна для истории: старые work_entries хранят
    rate_snapshot и не пересчитываются (SPEC п.16).
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")
    # exclude_unset: трогаем только присланные поля
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", response_model=UserOut)
def deactivate_user(user_id: int, db: Session = Depends(get_db)):
    """
    НЕ удаляем: у сотрудника есть история часов и денег.
    Деактивация скрывает его из списков (SPEC п.14).
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user
