"""Проба авторизации для аудита: что доступно без initData (временная БД)."""
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sys.path.insert(0, ROOT)
db = os.path.join(ROOT, "_audit_probe.db")
if os.path.exists(db):
    os.remove(db)
os.environ["DB_PATH"] = db
os.environ["BOT_TOKEN"] = ""

from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

Base.metadata.create_all(engine)
c = TestClient(app)


def show(label, r):
    print(f"{r.status_code}  {label}  | {r.text[:110]}")


show("POST /api/users без авторизации (создать руководителя)",
     c.post("/api/users", json={"name": "Hacker", "tg_id": 999, "rate": 1, "is_manager": True}))
show("GET /api/users без авторизации", c.get("/api/users"))
show("PATCH /api/users/1 без авторизации (ставка)", c.patch("/api/users/1", json={"rate": 1000}))
show("POST /api/clients без авторизации", c.post("/api/clients", json={"name": "X"}))
show("GET /api/payroll/payouts без авторизации", c.get("/api/payroll/payouts"))
show("GET /api/payroll/preview без авторизации",
     c.get("/api/payroll/preview?start=2026-01-01&end=2026-12-31"))
show("GET /work-entries с поддельным X-Actor-Id: 1", c.get("/work-entries", headers={"X-Actor-Id": "1"}))
show("GET /api/dashboard/today с поддельным X-Actor-Id: 1",
     c.get("/api/dashboard/today", headers={"X-Actor-Id": "1"}))
show("DELETE /api/users/1 без авторизации", c.delete("/api/users/1"))
show("GET /docs (Swagger открыт)", c.get("/docs"))
engine.dispose()
os.remove(db)
