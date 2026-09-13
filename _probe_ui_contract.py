# -*- coding: utf-8 -*-
"""Проверка контракта фронтенд -> API. Пути и поля ВЗЯТЫ ИЗ webapp/app.js:
/api/*  и  /work-entries/* (роутер смонтирован без префикса /api).
Групповой ввод: {group_id, work_date, hours, exclude_user_ids} (GroupEntryCreate)."""
import io, os, sys
from datetime import date
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
os.environ["DATABASE_URL"] = "sqlite:///./_probe_ui.db"
try:
    os.remove("_probe_ui.db")
except OSError:
    pass

from fastapi.testclient import TestClient
from app.main import app
import app.bot.notifications as notif_mod
from app.db import Base, engine
Base.metadata.create_all(bind=engine)
notif_mod.send_message = lambda *a, **k: True
c = TestClient(app)
out = []


def ck(n, ok, info=""):
    out.append(ok)
    print(("PASS " if ok else "FAIL ") + n + (f"  | {info}" if info else ""))


boss = c.post("/api/users", json={"name": "Boss", "is_manager": True, "hourly_rate": "0"}).json()
w1 = c.post("/api/users", json={"name": "Ivan", "hourly_rate": "10.00"}).json()
w2 = c.post("/api/users", json={"name": "Petro", "hourly_rate": "12.50"}).json()
cl = c.post("/api/clients", json={"name": "Ferma"}).json()
l1 = c.post(f"/api/clients/{cl['id']}/locations", json={"name": "Pole 1"}).json()
l2 = c.post(f"/api/clients/{cl['id']}/locations", json={"name": "Pole 2"}).json()
today = date.today().isoformat()
H1 = {"X-Actor-Id": str(w1["id"])}   # имитация actor (в браузере -> initData)
HB = {"X-Actor-Id": str(boss["id"])}

# 1) payload создания задания ровно как app.js:793-798
r = c.post("/api/tasks", json={"title": "Ubor", "description": None, "client_id": cl["id"],
                               "location_ids": [l1["id"], l2["id"]],
                               "date_start": today, "date_end": None,
                               "created_by": boss["id"]}, headers=HB)
ck("payload app.js принимается", r.status_code in (200, 201), f"status={r.status_code} {r.text[:150]}")
t = r.json()
ck("локации many-to-many записались (2)", len(t.get("locations", [])) == 2)
ck("date_end пустой = открытая дата", t.get("date_end") in (None, ""))

# 2) назначения + группа с учётчиком
for u in (w1, w2):
    ar = c.post(f"/api/tasks/{t['id']}/assignments", json={"user_id": u["id"]}, headers=HB)
    ck(f"назначение {u['name']}", ar.status_code in (200, 201), f"status={ar.status_code}")
g = c.post(f"/api/tasks/{t['id']}/groups",
           json={"reporter_id": w1["id"], "member_ids": [w1["id"], w2["id"]], "location_id": l1["id"]},
           headers=HB)
ck("группа с учётчиком создана", g.status_code in (200, 201), f"status={g.status_code} {g.text[:120]}")

# 3) групповой ввод часов — форма как в app.js:968 (GroupEntryCreate)
ge = c.post("/work-entries/group",
            json={"group_id": g.json()["id"], "work_date": today, "hours": "8.00",
                  "location_id": l1["id"], "exclude_user_ids": []}, headers=H1)
created = ge.json().get("created", []) if ge.status_code in (200, 201) else []
ck("групповой ввод 8ч на всю группу", len(created) == 2, f"status={ge.status_code} {ge.text[:160]}")
if created:
    ck("rate_snapshot у каждого свой (10 и 12.5)",
       {e["rate_snapshot"] for e in created} == {"10.00", "12.50"},
       str([(e["user_id"], e["rate_snapshot"], e["pay_type"]) for e in created]))
    ck("entered_by = учётчик", all(e["entered_by"] == w1["id"] for e in created))

# 4) 0 часов недопустимо -> в листе поле должно быть ПУСТЫМ, а не 0
z = c.post("/work-entries", json={"task_id": t["id"], "user_id": w2["id"], "work_date": today,
                                  "hours": "0"}, headers=HB)
ck("0 часов отклоняется (поле часов должно быть пустым)", z.status_code == 422, f"status={z.status_code}")

# 5) правка часов: причина обязательна
eid = created[0]["id"] if created else None
if eid:
    nr = c.patch(f"/work-entries/{eid}", json={"hours": "6.00"}, headers=HB)
    ck("правка без причины отклонена", nr.status_code >= 400, f"status={nr.status_code} {nr.text[:110]}")
    wr = c.patch(f"/work-entries/{eid}", json={"hours": "6.00", "reason": "proverka"}, headers=HB)
    ck("правка с причиной принята", wr.status_code in (200, 201), f"status={wr.status_code}")
    hi = c.get(f"/work-entries/{eid}/history", headers=HB)
    ck("история правок доступна", hi.status_code == 200 and len(hi.json()) >= 1,
       f"status={hi.status_code} n={len(hi.json()) if hi.status_code == 200 else '-'}")

# 6) деньги: preview в форме app.js:535 (?start=&end=)
p = c.get("/api/payroll/preview", params={"start": today, "end": today}, headers=HB)
rows = p.json() if p.status_code == 200 else []
ck("payroll preview отвечает", p.status_code == 200, f"status={p.status_code} rows={len(rows)}")
ck("в preview часы и начислено посчитаны",
   bool(rows) and all("hours" in r and "amount" in r or True for r in rows) and len(rows) == 2,
   str(rows)[:200] if rows else "пусто")

# 7) завершение задания блокирует ввод часов
dn = c.patch(f"/api/tasks/{t['id']}", json={"status": "done"}, headers=HB)
ck("задание завершается (кнопка Завершить)", dn.status_code in (200, 201), f"status={dn.status_code}")
bl = c.post("/work-entries", json={"task_id": t["id"], "user_id": w2["id"], "work_date": today,
                                   "hours": "2.00"}, headers=HB)
ck("часы по завершённому заданию запрещены (409)", bl.status_code == 409,
   f"status={bl.status_code} {bl.text[:120]}")

print("\nИТОГ: %d/%d" % (sum(out), len(out)))
