# -*- coding: utf-8 -*-
"""Проба авторизации для аудита (этап 1): анонимные запросы должны
отклоняться (401), /docs в проде — 404, позитивный контроль — 200.

Запуск: venv\\Scripts\\python.exe tools\\audit_probe_authz.py
Код выхода 0 — только если всё сошлось.
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
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sys.path.insert(0, ROOT)

# --- env ДО импорта app ---
db = os.path.join(ROOT, "_audit_probe.db")
if os.path.exists(db):
    os.remove(db)
os.environ["DATABASE_URL"] = "sqlite:///./_audit_probe.db"
os.environ["BOT_TOKEN"] = "12345:probe-token"
os.environ["BOT_WEBHOOK_SECRET"] = "probe-secret"
os.environ["ENV"] = "prod"

from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

Base.metadata.create_all(engine)

# --- сеем пользователей напрямую в БД (API теперь manager-only) ---
BOSS_TG, WORKER_TG = 900001, 900002
s = SessionLocal()
boss = User(name="Босс", is_manager=True, is_active=True, tg_id=BOSS_TG)
worker = User(name="Работник", is_manager=False, is_active=True, tg_id=WORKER_TG)
s.add_all([boss, worker])
s.commit()
boss_id, worker_id = boss.id, worker.id
s.close()

BOT_TOKEN = "12345:probe-token"


def make_init_data(tg_id: int) -> str:
    """Подпись initData строго как в app/auth.py."""
    user = json.dumps({"id": tg_id, "first_name": "Т", "language_code": "ru"},
                      ensure_ascii=False)
    pairs = {"user": user, "auth_date": str(int(time.time()))}
    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    pairs["hash"] = hmac.new(secret_key, data_check_string.encode(),
                             hashlib.sha256).hexdigest()
    return urlencode(pairs)


boss_init = make_init_data(BOSS_TG)
worker_init = make_init_data(WORKER_TG)

c = TestClient(app)
results = []


def expect(label, r, want):
    ok = r.status_code == want
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {label}: {r.status_code} (ожидалось {want})  | {r.text[:80]}")


# --- анонимные запросы: все должны быть 401 ---
expect("POST /api/users без заголовков",
       c.post("/api/users", json={"name": "Hacker", "hourly_rate": "1"}), 401)
expect("GET /api/users без заголовков", c.get("/api/users"), 401)
expect("PATCH /api/users/1 без заголовков",
       c.patch(f"/api/users/{boss_id}", json={"hourly_rate": "1000"}), 401)
expect("POST /api/clients без заголовков", c.post("/api/clients", json={"name": "X"}), 401)
expect("GET /api/payroll/payouts без заголовков", c.get("/api/payroll/payouts"), 401)
expect("GET /api/payroll/preview без заголовков",
       c.get("/api/payroll/preview?start=2026-01-01&end=2026-12-31"), 401)
expect("GET /work-entries без заголовков", c.get("/work-entries"), 401)
expect("GET /work-entries с поддельным X-Actor-Id",
       c.get("/work-entries", headers={"X-Actor-Id": str(boss_id)}), 401)
expect("GET /api/dashboard/today без заголовков", c.get("/api/dashboard/today"), 401)
expect("GET /api/dashboard/today с поддельным X-Actor-Id",
       c.get("/api/dashboard/today", headers={"X-Actor-Id": str(boss_id)}), 401)
expect("DELETE /api/users/1 без заголовков",
       c.delete(f"/api/users/{boss_id}"), 401)

# --- работник (не руководитель) на manager-эндпоинте: 403 ---
expect("GET /api/users с initData работника (не руководитель)",
       c.get("/api/users", headers={"X-Telegram-Init-Data": worker_init}), 403)

# --- позитивный контроль ---
expect("GET /api/users/me с валидным initData руководителя",
       c.get("/api/users/me", headers={"X-Telegram-Init-Data": boss_init}), 200)

# --- /docs закрыт в проде ---
expect("GET /docs в проде (ENV=prod)", c.get("/docs"), 404)

engine.dispose()
os.remove(db)

print()
total, passed = len(results), sum(results)
print(f"ИТОГ: {passed}/{total}")
sys.exit(0 if passed == total else 1)
