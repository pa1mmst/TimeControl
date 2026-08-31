"""
Авторизация Mini App (SPEC: вход сотрудника через Telegram).

Telegram передаёт initData — подписанную строку с данными пользователя.
Подпись проверяем HMAC-SHA256: ключ = HMAC(bot_token, "WebAppData").
Если подпись верна — initData пришёл от Telegram, подделать нельзя.
"""
import hashlib
import hmac
import os
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User

router = APIRouter(prefix="/api/users", tags=["miniapp"])


def _check_signature(init_data: str) -> dict:
    """Проверяет подпись initData. Возвращает поля как словарь или бросает 401."""
    bot_token = os.getenv("BOT_TOKEN", "")
    if not bot_token:
        raise HTTPException(401, "Сервер не настроен: нет BOT_TOKEN")

    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    except ValueError:
        raise HTTPException(401, "Некорректный initData")

    received_hash = pairs.pop("hash", "")
    if not received_hash:
        raise HTTPException(401, "Нет подписи в initData")

    # Строка для проверки: все поля кроме hash, отсортированные, через \n
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(pairs.items())
    )
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(calculated, received_hash):
        raise HTTPException(401, "Подпись initData не совпадает")

    # Защита от повторов: initData старше суток не принимаем
    auth_date = pairs.get("auth_date")
    if auth_date:
        import time
        try:
            if time.time() - int(auth_date) > 86400:
                raise HTTPException(401, "initData устарел")
        except ValueError:
            raise HTTPException(401, "Некорректный auth_date")

    return pairs


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
