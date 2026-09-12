# -*- coding: utf-8 -*-
"""Репрод: payload формы Mini App против реального API."""
import io, os, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
os.environ["DATABASE_URL"] = "sqlite:///./_scratch_front.db"
try:
    os.remove("_scratch_front.db")
except OSError:
    pass

from fastapi.testclient import TestClient
from app.main import app
from app.db import engine, Base
import app.bot.notifications as notif_mod

Base.metadata.create_all(bind=engine)
notif_mod.send_message = lambda *a, **k: True
c = TestClient(app)

boss = c.post("/api/users", json={"name": "Boss", "is_manager": True, "hourly_rate": "0"}).json()
w1 = c.post("/api/users", json={"name": "Ivan", "hourly_rate": "10"}).json()
w2 = c.post("/api/users", json={"name": "Petro", "hourly_rate": "10"}).json()
cl = c.post("/api/clients", json={"name": "Farm"}).json()
loc = c.post("/api/clients/%s/locations" % cl["id"], json={"name": "Field 1"}).json()

H = {"X-Actor-Id": str(boss["id"])}
print("me:", c.get("/api/users/me", headers=H).status_code, c.get("/api/users/me", headers=H).text[:200])

payload = {"title": "Test task", "description": None, "client_id": cl["id"],
           "location_ids": [loc["id"]], "date_start": None, "date_end": None,
           "created_by": boss["id"]}
r = c.post("/api/tasks", json=payload, headers=H)
print("POST /tasks:", r.status_code, r.text[:400])

if r.status_code < 300:
    tid = r.json()["id"]
    a1 = c.post("/api/tasks/%s/assignments" % tid, json={"user_id": w1["id"]}, headers=H)
    a2 = c.post("/api/tasks/%s/assignments" % tid, json={"user_id": w2["id"]}, headers=H)
    print("assign:", a1.status_code, a1.text[:200], "|", a2.status_code, a2.text[:200])
    g = c.post("/api/tasks/%s/groups" % tid, json={"reporter_id": w1["id"], "member_ids": [w2["id"]]}, headers=H)
    print("group:", g.status_code, g.text[:300])
    print("get task:", c.get("/api/tasks/%s" % tid, headers=H).text[:400])
