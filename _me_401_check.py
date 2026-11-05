# -*- coding: utf-8 -*-
"""Разовая проверка 401-кодов /api/me (ТЗ access_v1, п.7).

not_registered — пользователя нет в базе; deactivated — есть, но is_active=0.
Запуск: venv\\Scripts\\python.exe _me_401_check.py
"""
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

os.environ["DATABASE_URL"] = "sqlite:///./_me_test.db"
os.environ["BOT_WEBHOOK_SECRET"] = "test"
try:
    os.remove("_me_test.db")
except OSError:
    pass

from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal, engine, Base
from app.auth import check_init_data

Base.metadata.create_all(bind=engine)
client = TestClient(app)
db = SessionLocal()

results = []


def check(name, ok, info=""):
    results.append((name, ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  | {info}" if info else ""))


# --- подписанный initData (как это делает Telegram Mini App) ---
import hashlib
import hmac as hmac_mod
import json
from urllib.parse import urlencode

BOT_TOKEN = "000:test"


def make_init_data(tg_id: int) -> str:
    user = json.dumps({"id": tg_id, "first_name": "Тест", "language_code": "ru"})
    pairs = {"user": user, "auth_date": "1730000000"}
    secret = hashlib.sha256(BOT_TOKEN.encode()).digest()
    # check_init_data проверяет: hash = HMAC(secret, "web_app_data"?) — смотрим app/auth.py
    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    pairs["hash"] = hmac_mod.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(pairs)


# auth.py может проверять иначе — посмотрим фактическую функцию
import inspect
src = inspect.getsource(check_init_data)
print("--- app/auth.py check_init_data (для сверки формата) ---")
print(src)
