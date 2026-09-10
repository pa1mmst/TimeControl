"""
Общая проверка подписи Telegram initData (шаг 1).

Логика проверки вынесена из app/routers/miniapp.py БЕЗ изменений:
- parse_qsl возвращает ДЕКОДИРОВАННЫЕ пары — data_check_string собирается
  из них (фикс 4a4219f, не менять на сырые URL-encoded значения);
- hash исключается, ключ = HMAC(bot_token, "WebAppData");
- initData старше суток отклоняется.

miniapp.py и deps.get_actor используют одну и ту же функцию.
"""
import hashlib
import hmac
import json
import logging
import os
import time
from urllib.parse import parse_qsl

from fastapi import HTTPException

logger = logging.getLogger("auth")


def check_init_data(init_data: str) -> dict:
    """
    Проверяет подпись initData. Возвращает декодированные пары как словарь
    (без hash) или бросает HTTPException 401. Код идентичен
    miniapp._check_signature — единая точка правды.
    """
    bot_token = os.getenv("BOT_TOKEN", "")
    if not bot_token:
        raise HTTPException(401, "Сервер не настроен: нет BOT_TOKEN")

    try:
        pairs_list = parse_qsl(init_data, keep_blank_values=True)
    except ValueError:
        raise HTTPException(401, "Некорректный initData")

    pairs = dict(pairs_list)
    received_hash = pairs.pop("hash", "")
    if not received_hash:
        raise HTTPException(401, "Нет подписи в initData")

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(pairs_list) if k != "hash"
    )
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(calculated, received_hash):
        logger.warning("initData: подпись не совпала (user_raw=%s)", pairs.get("user", "")[:80])
        raise HTTPException(401, "Подпись initData не совпадает")

    auth_date = pairs.get("auth_date")
    if auth_date:
        try:
            if time.time() - int(auth_date) > 86400:
                logger.warning("initData: устарел (auth_date=%s)", auth_date)
                raise HTTPException(401, "initData устарел")
        except ValueError:
            raise HTTPException(401, "Некорректный auth_date")

    return pairs


def tg_id_from_init_data(init_data: str) -> int:
    """Проверяет подпись и извлекает tg_id пользователя Telegram."""
    pairs = check_init_data(init_data)
    tg_user = pairs.get("user")
    if not tg_user:
        raise HTTPException(401, "Нет данных пользователя в initData")
    try:
        tg_user = json.loads(tg_user)
    except json.JSONDecodeError:
        raise HTTPException(401, "Некорректные данные пользователя")
    tg_id = tg_user.get("id")
    if not tg_id:
        raise HTTPException(401, "Нет id пользователя в initData")
    return tg_id
