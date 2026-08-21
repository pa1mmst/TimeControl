"""
Зависимости FastAPI.

get_current_user — ВРЕМЕННАЯ заглушка до модуля авторизации:
клиент передаёт свой id в заголовке X-Actor-Id.
При внедрении auth меняется только эта функция, роутеры не трогаем.
"""
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db  # реэкспорт, чтобы импорт из app.deps работал везде
from app.models import User


def get_current_user(
    x_actor_id: int = Header(..., alias="X-Actor-Id"),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_actor_id)
    if user is None or not user.is_active:
        raise HTTPException(401, "Неизвестный или деактивированный пользователь")
    return user
