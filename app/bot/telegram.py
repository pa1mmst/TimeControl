"""
Тонкая обёртка над Telegram Bot API. Никакой бизнес-логики.
Переменные окружения:
  BOT_TOKEN          — токен бота от @BotFather
  BOT_WEBHOOK_URL    — публичный URL, например https://example.com/bot/webhook
  BOT_WEBHOOK_SECRET — произвольная строка; Telegram будет присылать её
                       в заголовке, чтобы никто чужой не дёргал webhook
"""
import logging
import os

import httpx

log = logging.getLogger("bot")

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
WEBHOOK_URL = os.getenv("BOT_WEBHOOK_URL", "")
WEBHOOK_SECRET = os.getenv("BOT_WEBHOOK_SECRET", "change-me")

_API = f"https://api.telegram.org/bot{BOT_TOKEN}"


def send_message(chat_id: int, text: str, reply_markup: dict | None = None) -> bool:
    """
    Отправка сообщения. Ошибки НЕ поднимаются наверх: недоставленное
    уведомление не должно ломать бизнес-операцию (создание задания,
    правку часов и т.д.). Возвращает True/False.
    """
    if not BOT_TOKEN:
        log.warning("BOT_TOKEN не задан, сообщение не отправлено")
        return False
    payload: dict = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    try:
        r = httpx.post(f"{_API}/sendMessage", json=payload, timeout=10)
        if r.status_code != 200:
            log.warning("sendMessage %s: %s", r.status_code, r.text[:300])
            return False
        return True
    except httpx.HTTPError as e:
        log.warning("sendMessage failed: %s", e)
        return False


def setup_webhook() -> None:
    """Регистрирует webhook. Вызвать один раз (или на старте приложения)."""
    if not (BOT_TOKEN and WEBHOOK_URL):
        log.warning("BOT_TOKEN/BOT_WEBHOOK_URL не заданы, webhook не установлен")
        return
    r = httpx.post(
        f"{_API}/setWebhook",
        json={
            "url": WEBHOOK_URL,
            "secret_token": WEBHOOK_SECRET,
            "allowed_updates": ["message"],
        },
        timeout=10,
    )
    log.info("setWebhook: %s %s", r.status_code, r.text[:200])
