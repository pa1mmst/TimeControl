"""
Авторизация Mini App (SPEC: вход сотрудника через Telegram).

Telegram передаёт initData — подписанную строку с данными пользователя.
Подпись проверяем HMAC-SHA256: ключ = HMAC(bot_token, "WebAppData").
Если подпись верна — initData пришёл от Telegram, подделать нельзя.

Проверка подписи и разбор user — единая функция tg_id_from_init_data
из app/auth.py (аудит, п.12): здесь дублей больше нет.
"""
import logging

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import tg_id_from_init_data
from app.db import get_db
from app.models import User, WorkEntry

logger = logging.getLogger("miniapp")  # причины отказа 401 — видно в journalctl

router = APIRouter(prefix="/api/users", tags=["miniapp"])


@router.get("/me")
def me(
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
    db: Session = Depends(get_db),
):
    """Кто я: данные пользователя по подписанному initData из Telegram."""
    tg_id = tg_id_from_init_data(x_telegram_init_data)

    user = db.query(User).filter(User.tg_id == tg_id).first()
    if not user:
        logger.warning("me: tg_id=%s не найден в базе", tg_id)
        raise HTTPException(
            401, {"code": "not_registered",
                  "detail": "Пользователь не зарегистрирован"})
    if not user.is_active:
        logger.warning("me: tg_id=%s деактивирован", tg_id)
        raise HTTPException(
            401, {"code": "deactivated",
                  "detail": "Пользователь деактивирован"})

    # Часы/заработок — один агрегатный запрос, без выгрузки всех записей
    # (аудит, п.26). Деньги — Decimal: coalesce держит тип Numeric суммы.
    total_hours, total_earned = db.query(
        func.coalesce(func.sum(WorkEntry.hours), 0),
        func.coalesce(
            func.sum(WorkEntry.hours * WorkEntry.rate_snapshot), 0
        ),
    ).filter(WorkEntry.user_id == user.id).one()

    return {
        "id": user.id,
        "tg_id": user.tg_id,
        "name": user.name,
        "lang": user.lang.value if user.lang else "ru",
        "is_manager": user.is_manager,
        "total_hours": total_hours,
        "total_earned": total_earned,
    }
