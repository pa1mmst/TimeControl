"""
Зависимости FastAPI.

get_current_user — ВРЕМЕННАЯ заглушка до модуля авторизации:
клиент передаёт свой id в заголовке X-Actor-Id.
При внедрении auth меняется только эта функция, роутеры не трогаем.

get_actor (шаг 1) — основной источник actor: проверяет подпись
X-Telegram-Init-Data (общая функция app/auth.py) и возвращает User.
Если заголовка нет — None, и роутер использует fallback (actor в теле /
X-Actor-Id), чтобы старые клиенты и _e2e_check.py работали как раньше.
"""
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.auth import tg_id_from_init_data
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


def get_actor(
    x_telegram_init_data: str | None = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(get_db),
) -> User | None:
    """
    Actor из подписанного initData. Заголовка нет -> None (fallback на
    старые механизмы: actor в теле запроса / X-Actor-Id).
    Подпись неверна или пользователь не найден/деактивирован -> 401.
    """
    if not x_telegram_init_data:
        return None
    tg_id = tg_id_from_init_data(x_telegram_init_data)
    user = db.query(User).filter(User.tg_id == tg_id).first()
    if not user or not user.is_active:
        raise HTTPException(401, "Пользователь не зарегистрирован или деактивирован")
    return user


def require_manager(actor: User | None) -> User:
    """Эндпоинты руководителя: actor обязан быть определён и is_manager."""
    if actor is None:
        raise HTTPException(401, "Требуется авторизация Telegram (initData)")
    if not actor.is_manager:
        raise HTTPException(403, "Доступно только руководителю")
    return actor


def fallback_actor_is_manager(user_id: int, db: Session) -> None:
    """
    Fallback-проверка для старых клиентов (actor в теле / X-Actor-Id):
    пользователь из тела должен существовать и быть руководителем.
    Нужна только там, где initData нет (e2e-скрипт, старые клиенты).
    """
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(404, "Пользователь не найден или деактивирован")
    if not user.is_manager:
        raise HTTPException(403, "Доступно только руководителю")

