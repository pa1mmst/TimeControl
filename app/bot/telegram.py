"""
Тонкая обёртка над Telegram Bot API. Никакой бизнес-логики.
Переменные окружения:
  BOT_TOKEN          — токен бота от @BotFather
  BOT_WEBHOOK_URL    — публичный URL, например https://example.com/bot/webhook
  BOT_WEBHOOK_SECRET — произвольная строка; Telegram будет присылать её
                       в заголовке, чтобы никто чужой не дёргал webhook

Уведомления уходят асинхронно через пул потоков (аудит, п.28):
10 получателей больше не держат HTTP-запрос до 100 с. Отправка
fire-and-forget: при остановке сервера неотправленные уведомления
теряются — для уведомлений это осознанное решение.
"""
import logging
import os
from concurrent.futures import ThreadPoolExecutor

import httpx

log = logging.getLogger("bot")

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
WEBHOOK_URL = os.getenv("BOT_WEBHOOK_URL", "")
# Без дефолта (аудит, п.4): секрет по умолчанию "change-me" — известная строка.
WEBHOOK_SECRET = os.getenv("BOT_WEBHOOK_SECRET", "")

_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

# Один клиент на модуль: reuse соединений вместо нового TLS на каждое
# сообщение. Пул потоков: send_message только ставит задачу в очередь
# и сразу возвращается — HTTP-запрос бота не ждёт Telegram.
_client = httpx.Client(timeout=10)
_executor = ThreadPoolExecutor(
    max_workers=4, thread_name_prefix="tg-send"
)


def _post_send_message(chat_id: int, text: str, reply_markup: dict | None) -> None:
    """Фактический POST в воркере. Ошибки только в лог, не наверх."""
    payload: dict = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    try:
        r = _client.post(f"{_API}/sendMessage", json=payload)
        if r.status_code != 200:
            log.warning("sendMessage %s: %s", r.status_code, r.text[:300])
    except httpx.HTTPError as e:
        log.warning("sendMessage failed: %s", e)


def send_message(chat_id: int, text: str, reply_markup: dict | None = None) -> bool:
    """
    Отправка сообщения — fire-and-forget через пул потоков (аудит, п.28):
    ставит задачу в очередь и сразу возвращает True. Ошибки доставки
    логируются в воркере и НЕ поднимаются наверх: недоставленное
    уведомление не должно ломать бизнес-операцию (создание задания,
    правку часов и т.д.).
    """
    if not BOT_TOKEN:
        log.warning("BOT_TOKEN не задан, сообщение не отправлено")
        return False
    _executor.submit(_post_send_message, chat_id, text, reply_markup)
    return True


def setup_webhook() -> None:
    """Регистрирует webhook. Вызвать один раз (или на старте приложения)."""
    if not (BOT_TOKEN and WEBHOOK_URL and WEBHOOK_SECRET):
        log.error(
            "BOT_TOKEN/BOT_WEBHOOK_URL/BOT_WEBHOOK_SECRET не заданы — "
            "webhook НЕ установлен"
        )
        return
    r = _client.post(
        f"{_API}/setWebhook",
        json={
            "url": WEBHOOK_URL,
            "secret_token": WEBHOOK_SECRET,
            "allowed_updates": ["message", "callback_query"],
        },
    )
    log.info("setWebhook: %s %s", r.status_code, r.text[:200])
