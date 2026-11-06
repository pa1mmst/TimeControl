"""
Зависимости FastAPI.

Единственный источник actor — подписанный initData из Telegram
(заголовок X-Telegram-Init-Data). Fallback на X-Actor-Id и actor в теле
УДАЛЕН (аудит, п.1–3): реальный клиент (webapp/app.js) шлёт initData
на каждый запрос.

Важно: заголовок объявлен как `str | None = Header(None, ...)` и
проверяется вручную — иначе при отсутствии заголовка FastAPI вернул бы
422 вместо 401.
"""
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.auth import tg_id_from_init_data
from app.db import get_db  # реэкспорт, чтобы импорт из app.deps работал везде
from app.models import User


def require_actor(
    x_telegram_init_data: str | None = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(get_db),
) -> User:
    """Любой аутентифицированный пользователь. Без валидного initData — 401."""
    if not x_telegram_init_data:
        raise HTTPException(401, "Требуется авторизация Telegram (initData)")
    tg_id = tg_id_from_init_data(x_telegram_init_data)
    user = db.query(User).filter(User.tg_id == tg_id).first()
    if not user or not user.is_active:
        raise HTTPException(401, "Пользователь не зарегистрирован или деактивирован")
    return user


def require_manager_dep(actor: User = Depends(require_actor)) -> User:
    """Эндпоинты руководителя: actor обязан быть is_manager, иначе 403."""
    if not actor.is_manager:
        raise HTTPException(403, "Доступно только руководителю")
    return actor
