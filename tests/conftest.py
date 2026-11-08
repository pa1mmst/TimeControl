"""Общие фикстуры pytest для TimeControl (перенос _e2e_check.py, этап 2 аудита).

Важно: app/db.py читает DATABASE_URL ПРИ ИМПОРТЕ, поэтому env выставляется
в самом начале файла, до любых импортов app.
"""
import os

# --- Изолированная тестовая база: ДО любого импорта app ---
os.environ["DATABASE_URL"] = "sqlite:///./_pytest_run.db"
os.environ["BOT_TOKEN"] = "12345:test-e2e-token"
os.environ["BOT_WEBHOOK_SECRET"] = "test"

_DB_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_pytest_run.db"
)
try:
    os.remove(_DB_FILE)
except OSError:
    pass

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest
from fastapi.testclient import TestClient

import app.bot.notifications as notif_mod
import app.bot.router as bot_router_mod
import app.models
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import User


@pytest.fixture(scope="module", autouse=True)
def fresh_db():
    """Чистая база на модуль: пересоздание всех таблиц."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


class _FakeTelegram:
    """Перехват отправки в Telegram: собирает вызовы вместо сети."""

    def __init__(self):
        self.sent = []      # (chat_id, text, reply_markup)
        self.answered = []  # (cbq, text)


@pytest.fixture(scope="module")
def fake_telegram():
    fake = _FakeTelegram()

    orig_notif_send = notif_mod.send_message
    orig_router_send = bot_router_mod.send_message
    orig_answer = bot_router_mod._answer_callback

    def fake_send(chat_id, text, reply_markup=None):
        fake.sent.append((chat_id, text, reply_markup))
        return True

    def fake_answer(cbq, text):
        fake.answered.append((cbq, text))

    notif_mod.send_message = fake_send
    bot_router_mod.send_message = fake_send
    bot_router_mod._answer_callback = fake_answer
    yield fake
    notif_mod.send_message = orig_notif_send
    bot_router_mod.send_message = orig_router_send
    bot_router_mod._answer_callback = orig_answer


def make_init_data(tg_id: int) -> str:
    """Подпись initData — строго как в app/auth.py."""
    bot_token = os.environ["BOT_TOKEN"]
    user = json.dumps({"id": tg_id, "first_name": "Т", "language_code": "ru"},
                      ensure_ascii=False)
    pairs = {"user": user, "auth_date": str(int(time.time()))}
    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    pairs["hash"] = hmac.new(secret_key, data_check_string.encode(),
                             hashlib.sha256).hexdigest()
    return urlencode(pairs)


def init_for(user_dict: dict) -> dict:
    """Заголовки initData пользователя (tg_id = 100000 + user_id)."""
    return {"X-Telegram-Init-Data": make_init_data(100000 + user_dict["id"])}


def seed_manager() -> dict:
    """Руководитель сеется напрямую в БД (POST /api/users manager-only)."""
    db = SessionLocal()
    boss_db = User(name="Босс", is_manager=True, is_active=True, tg_id=100001)
    db.add(boss_db)
    db.commit()
    boss = {"id": boss_db.id, "name": "Босс"}
    db.close()
    return boss
