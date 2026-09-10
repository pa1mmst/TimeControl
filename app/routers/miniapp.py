"""
Авторизация Mini App (SPEC: вход сотрудника через Telegram).

Telegram передаёт initData — подписанную строку с данными пользователя.
Подпись проверяем HMAC-SHA256: ключ = HMAC(bot_token, "WebAppData").
Если подпись верна — initData пришёл от Telegram, подделать нельзя.
"""
import hashlib
import hmac
import logging
import os
import time
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.auth import check_init_data  # единая проверка подписи (см. app/auth.py)
from app.db import get_db
from app.models import User

logger = logging.getLogger("miniapp")  # причины отказа 401 — видно в journalctl

router = APIRouter(prefix="/api/users", tags=["miniapp"])


def _check_signature(init_data: str) -> dict:
    """Проверяет подпись initData. Делегирует общей функции в app/auth.py
    (код проверки вынесен туда без изменений — фикс 4a4219f сохранён)."""
    return check_init_data(init_data)


@router.get("/me")
def me(
    x_telegram_init_data: str = Header(..., alias="X-Telegram-Init-Data"),
    db: Session = Depends(get_db),
):
    """Кто я: данные пользователя по подписанному initData из Telegram."""
    pairs = _check_signature(x_telegram_init_data)

    try:
        tg_user = pairs.get("user")
        if not tg_user:
            raise HTTPException(401, "Нет данных пользователя в initData")
        import json
        tg_user = json.loads(tg_user)
        tg_id = tg_user.get("id")
        if not tg_id:
            raise HTTPException(401, "Нет id пользователя в initData")
    except json.JSONDecodeError:
        raise HTTPException(401, "Некорректные данные пользователя")
    user = db.query(User).filter(User.tg_id == tg_id).first()
    if not user or not user.is_active:
        logger.warning("me: tg_id=%s не найден в базе или деактивирован", tg_id)
        raise HTTPException(401, "Пользователь не зарегистрирован или деактивирован")

    # Часы/заработок — из отчёта по пользователю (та же логика, что /api/reports/user)
    from app.models import WorkEntry
    entries = db.query(WorkEntry).filter(WorkEntry.user_id == user.id).all()
    total_hours = sum((e.hours for e in entries), 0)
    total_earned = sum((e.hours * e.rate_snapshot for e in entries), 0)

    return {
        "id": user.id,
        "tg_id": user.tg_id,
        "name": user.name,
        "lang": user.lang.value if user.lang else "ru",
        "is_manager": user.is_manager,
        "total_hours": float(total_hours),
        "total_earned": float(total_earned),
    }
