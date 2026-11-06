# -*- coding: utf-8 -*-
"""Проверка 401-кодов /api/users/me (ТЗ access_v1, п.7).

registered — 200; not_registered — пользователя нет в базе -> 401;
deactivated — есть, но is_active=0 -> 401.
Запуск: venv\\Scripts\\python.exe _me_401_check.py
"""
import hashlib
import hmac
import io
import json
import os
import sys
import time
from urllib.parse import urlencode

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

os.environ["DATABASE_URL"] = "sqlite:///./_me_test.db"
os.environ["BOT_TOKEN"] = "12345:me-401-token"
os.environ["BOT_WEBHOOK_SECRET"] = "test"
try:
    os.remove("_me_test.db")
except OSError:
    pass

from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal, engine, Base
from app.models import User

Base.metadata.create_all(bind=engine)
client = TestClient(app)

results = []


def check(name, ok, info=""):
    results.append((name, ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  | {info}" if info else ""))


# --- подписанный initData: алгоритм строго как в app/auth.py ---
BOT_TOKEN = "12345:me-401-token"


def make_init_data(tg_id: int) -> str:
    user = json.dumps({"id": tg_id, "first_name": "Тест", "language_code": "ru"},
                      ensure_ascii=False)
    pairs = {"user": user, "auth_date": str(int(time.time()))}
    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    pairs["hash"] = hmac.new(secret_key, data_check_string.encode(),
                             hashlib.sha256).hexdigest()
    return urlencode(pairs)


# --- сеем пользователей напрямую в БД ---
db = SessionLocal()
u_ok = User(name="Зарегистрирован", is_active=True, tg_id=200001)
u_off = User(name="Деактивирован", is_active=False, tg_id=200002)
db.add_all([u_ok, u_off])
db.commit()
db.close()

r = client.get("/api/users/me",
               headers={"X-Telegram-Init-Data": make_init_data(200001)})
check("registered: /api/users/me -> 200", r.status_code == 200, r.text[:100])

r = client.get("/api/users/me",
               headers={"X-Telegram-Init-Data": make_init_data(299999)})
check("not_registered: /api/users/me -> 401", r.status_code == 401, r.text[:100])

r = client.get("/api/users/me",
               headers={"X-Telegram-Init-Data": make_init_data(200002)})
check("deactivated: /api/users/me -> 401", r.status_code == 401, r.text[:100])

# без заголовка — отклоняется. miniapp.py объявляет Header(...) (обязательный),
# поэтому FastAPI отдаёт 422, а не 401; логику miniapp по ТЗ не меняем.
r = client.get("/api/users/me")
check("no header: /api/users/me -> 401/422", r.status_code in (401, 422), r.text[:100])

print()
print(f"ИТОГ: {sum(1 for _, ok in results if ok)}/{len(results)} пройдено")
sys.exit(0 if all(ok for _, ok in results) else 1)
