# -*- coding: utf-8 -*-
"""Сквозная проверка главного сценария SPEC через реальный API."""
import io
import sys
from datetime import date
from decimal import Decimal

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from fastapi.testclient import TestClient
from app.main import app
import app.bot.notifications as notif_mod
from app.db import SessionLocal
from app.models import TaskLocation

client = TestClient(app)
SENT = []  # перехват "отправки в Telegram"

def fake_send(chat_id, text, reply_markup=None):
    SENT.append((chat_id, text))
    return True

notif_mod.send_message = fake_send

results = []
def check(name, ok, info=""):
    results.append((name, ok, info))
    print(("PASS " if ok else "FAIL ") + name + (f"  | {info}" if info else ""))

D1, D2 = date(2026, 8, 24), date(2026, 8, 25)

# ---------- 1. Работники ----------
boss = client.post("/api/users", json={
    "name": "Босс", "is_manager": True, "hourly_rate": "0"}).json()
w1 = client.post("/api/users", json={
    "name": "Иван", "hourly_rate": "10.00", "phone": "+380991111111"}).json()
w2 = client.post("/api/users", json={
    "name": "Петро", "hourly_rate": "12.50", "phone": "+380992222222"}).json()
w3 = client.post("/api/users", json={
    "name": "Оксана", "hourly_rate": "15.00", "phone": "+380993333333"}).json()
check("1. созданы руководитель + 3 работника",
      all(u.get("id") for u in (boss, w1, w2, w3)),
      f"ids: boss={boss['id']}, {w1['id']}/{w2['id']}/{w3['id']}")

# tg_id, чтобы уведомления "доходили"
db = SessionLocal()
from app.models import User
for uid in (boss["id"], w1["id"], w2["id"], w3["id"]):
    db.get(User, uid).tg_id = 100000 + uid
db.commit(); db.close()

# ---------- 2. Заказчик с 2 локациями ----------
cl = client.post("/api/clients", json={"name": "Агро-Ферма Тест"}).json()
loc1 = client.post(f"/api/clients/{cl['id']}/locations", json={
    "name": "Поле №1", "address": "с. Тестовое 1", "map_url": "https://maps.example/1"}).json()
loc2 = client.post(f"/api/clients/{cl['id']}/locations", json={
    "name": "Теплица", "address": "с. Тестовое 2"}).json()
check("2. заказчик + 2 локации", cl.get("id") and loc1.get("id") and loc2.get("id"),
      f"client={cl['id']}, locs={loc1['id']},{loc2['id']}")

# ---------- 3. Задание + назначения + группа с учётчиком ----------
task = client.post("/api/tasks", json={
    "title": "Сбор урожая", "description": "Помидоры", "client_id": cl["id"],
    "location_ids": [loc1["id"], loc2["id"]],
    "date_start": D1.isoformat(), "date_end": D2.isoformat(),
    "created_by": boss["id"]}).json()
tid = task["id"]
for uid in (w1["id"], w2["id"], w3["id"]):
    r = client.post(f"/api/tasks/{tid}/assignments", json={"user_id": uid})
    assert r.status_code in (200, 201), r.text
group = client.post(f"/api/tasks/{tid}/groups", json={
    "reporter_id": w1["id"], "member_ids": [w2["id"], w3["id"]]}).json()
check("3. задание + 3 назначения + группа (учётчик Иван)", bool(group.get("id")),
      f"task={tid}, group={group['id']}, reporter={group['reporter']['name']}")

# send_to_reporter для локации 1 (адрес учётчику)
db = SessionLocal()
db.query(TaskLocation).filter_by(task_id=tid, location_id=loc1["id"]).update(
    {"send_to_reporter": True})
db.commit(); db.close()

# ---------- 4. Уведомления при переводе в active ----------
SENT.clear()
r = client.patch(f"/api/tasks/{tid}", json={"status": "active"})
assert r.status_code == 200, r.text
recipients = sorted(c for c, _ in SENT)
check("4a. уведомление получили все 3 назначенных (не босс)",
      recipients == sorted([100000 + w1["id"], 100000 + w2["id"], 100000 + w3["id"]]),
      f"получателей: {len(SENT)}")
msg_reporter = next(t for c, t in SENT if c == 100000 + w1["id"])
msg_member = next(t for c, t in SENT if c == 100000 + w2["id"])
check("4b. учётчику пришёл адрес локации",
      "Поле №1" in msg_reporter and "с. Тестовое 1" in msg_reporter,
      "адрес в сообщении учётчика" if "Поле №1" in msg_reporter else msg_reporter[:120])
check("4c. учётчику сообщено, что он учётчик", "учётчик" in msg_reporter.lower())
check("4d. рядовому участнику адрес НЕ приходит (доносит учётчик)",
      "с. Тестовое 1" not in msg_member)
print("--- сообщение учётчику ---\n" + msg_reporter + "\n------------------------")

# ---------- 5. Групповой ввод часов ----------
H = client.post("/work-entries/group", json={
    "group_id": group["id"], "work_date": D1.isoformat(), "hours": "8",
    "location_id": loc1["id"]}, headers={"X-Actor-Id": str(w1["id"])})
assert H.status_code == 201, H.text
body = H.json()
check("5a. групповой ввод: создано 3 записи", len(body["created"]) == 3,
      f"created={len(body['created'])}, skipped={body['skipped']}")
entries = client.get("/work-entries", params={"task_id": tid},
                     headers={"X-Actor-Id": str(boss["id"])}).json()
per_user = {}
for e in entries:
    if e["work_date"] == D1.isoformat():
        per_user.setdefault(e["user_id"], []).append(e)
check("5b. у каждого из 3 участников своя запись с 8 ч и ставкой-снимком",
      all(len(per_user.get(u, [])) == 1 and
          Decimal(per_user[u][0]["hours"]) == 8 for u in (w1["id"], w2["id"], w3["id"])),
      str({u: [e["hours"] for e in per_user.get(u, [])] for u in (w1['id'], w2['id'], w3['id'])}))
check("5c. entered_by = учётчик",
      all(e["entered_by"] == w1["id"] for e in per_user.values() for e in [e[0]] if e["work_date"] == D1.isoformat()) if False else
      all(e["entered_by"] == w1["id"] for lst in per_user.values() for e in lst))

# ---------- 6. Правка часов + история ----------
target = per_user[w2["id"]][0]
SENT.clear()
r = client.patch(f"/work-entries/{target['id']}",
                 json={"hours": "6", "reason": "ушёл на 2 ч раньше"},
                 headers={"X-Actor-Id": str(boss["id"])})
assert r.status_code == 200, r.text
check("6a. руководитель исправил часы 8 -> 6", Decimal(r.json()["hours"]) == 6)
hist = client.get(f"/work-entries/{target['id']}/history",
                  headers={"X-Actor-Id": str(boss["id"])}).json()
check("6b. история изменений видна", len(hist) == 1
      and Decimal(hist[0]["old_value"]) == 8 and Decimal(hist[0]["new_value"]) == 6
      and hist[0]["reason"] == "ушёл на 2 ч раньше",
      f"записей аудита: {len(hist)}")
check("6c. работнику пришло уведомление о правке",
      any(100000 + w2["id"] == c for c, _ in SENT) and
      any("6" in t and "8" in t for c, t in SENT if c == 100000 + w2["id"]),
      SENT[0][1][:100] if SENT else "нет сообщений")

# ---------- 7. Расчёт периода ----------
# второй день: 8 ч каждому
H2 = client.post("/work-entries/group", json={
    "group_id": group["id"], "work_date": D2.isoformat(), "hours": "8",
    "location_id": loc1["id"]}, headers={"X-Actor-Id": str(w1["id"])})
assert H2.status_code == 201, H2.text
adv = client.post("/api/payroll/advances", json={
    "user_id": w2["id"], "amount": "50", "date": D1.isoformat(),
    "comment": "на дорогу", "created_by": boss["id"]})
assert adv.status_code in (200, 201), adv.text

prev = client.get("/api/payroll/preview",
                  params={"start": D1.isoformat(), "end": D2.isoformat()}).json()
rows = {r["user_id"]: r for r in prev}
exp = {
    w1["id"]: (16, 160, 0, 160),      # 10.00 * 16
    w2["id"]: (14, 175, 50, 125),    # 12.50 * (8+6) = 175, аванс 50
    w3["id"]: (16, 240, 0, 240),     # 15.00 * 16
}
ok = True
for uid, (h, g, a, n) in exp.items():
    r = rows.get(uid)
    if not r or (Decimal(r["hours"]), Decimal(r["gross"]),
                 Decimal(r["advances_total"]), Decimal(r["net"])) != (
                 Decimal(h), Decimal(g), Decimal(a), Decimal(n)):
        ok = False
        print("   расхождение:", uid, r)
check("7a. preview: часы/начислено/аванс/к выплате сходятся", ok,
      "; ".join(f"{r['name']}: {r['hours']}ч {r['gross']}€ -{r['advances_total']} = {r['net']}" for r in prev))

closed = client.post("/api/payroll/close", json={
    "period_start": D1.isoformat(), "period_end": D2.isoformat(),
    "created_by": boss["id"]})
assert closed.status_code == 200, closed.text
payouts = {p["user_id"]: p for p in closed.json()}
check("7b. период закрыт: payout каждому с верным net",
      all(Decimal(payouts[u]["net"]) == Decimal(n) for u, (_, _, _, n) in exp.items()),
      "; ".join(f"{p['user_id']}:{p['net']}" for p in closed.json()))
# отметить выплаченным
pid = payouts[w1["id"]]["id"]
r = client.patch(f"/api/payroll/payouts/{pid}",
                 json={"status": "paid", "actor_id": boss["id"]})
check("7c. выплата отмечена paid", r.status_code == 200 and r.json()["status"] == "paid")

# ---------- 8. Дополнительные сценарии ----------
# 8.1 дубликат группового ввода за тот же день — пропуск, не ошибка
dup = client.post("/work-entries/group", json={
    "group_id": group["id"], "work_date": D1.isoformat(), "hours": "8"},
    headers={"X-Actor-Id": str(w1["id"])})
check("8.1 повторный групповой ввод: дубль пропущен, ошибок нет",
      dup.status_code == 201 and len(dup.json()["created"]) == 0
      and len(dup.json()["skipped"]) == 3, dup.text[:100])

# 8.2 права: работник не может вводить за группу, где он не учётчик
r = client.post("/work-entries/group", json={
    "group_id": group["id"], "work_date": D2.isoformat(), "hours": "4"},
    headers={"X-Actor-Id": str(w3["id"])})
check("8.2 не-учётчик не может вводить за группу (403)",
      r.status_code == 403, r.text[:80])

# 8.3 права: работник не может править часы
r = client.patch(f"/work-entries/{target['id']}", json={"hours": "1"},
                 headers={"X-Actor-Id": str(w2["id"])})
check("8.3 работник не может править часы (403)", r.status_code == 403, r.text[:80])

# 8.4 права: работник видит только свои записи
r = client.get("/work-entries", headers={"X-Actor-Id": str(w3["id"])})
check("8.4 работник видит только свои записи",
      r.status_code == 200 and all(e["user_id"] == w3["id"] for e in r.json()))

# 8.5 пересечение периодов
r = client.post("/api/payroll/close", json={
    "period_start": D1.isoformat(), "period_end": D2.isoformat(),
    "created_by": boss["id"]})
check("8.5 пересекающийся период отклонён (400)", r.status_code == 400, r.text[:80])

# 8.6 аванс из закрытого периода нельзя менять
r = client.patch(f"/api/payroll/advances/{adv.json()['id']}",
                 json={"amount": "10", "actor_id": boss["id"], "reason": "test"})
check("8.6 аванс закрытого периода защищён (400)", r.status_code == 400, r.text[:80])

# 8.7 сводка по заданию
r = client.get(f"/work-entries/task/{tid}/summary",
               headers={"X-Actor-Id": str(boss["id"])})
s = r.json()
check("8.7 сводка по заданию: итог 46 ч (16+14+16)",
      r.status_code == 200 and Decimal(s["total_hours"]) == 46,
      f"total={s.get('total_hours')}")

# 8.8 отчёты
r = client.get(f"/api/reports/user/{w2['id']}",
              params={"start": D1.isoformat(), "end": D2.isoformat()})
check("8.8 отчёт по работнику отдаёт часы", r.status_code == 200, str(r.json())[:120])

# 8.9 нельзя снять с задания человека с часами
r = client.delete(f"/api/tasks/{tid}/assignments/{w2['id']}")
check("8.9 снятие с задания при наличии часов запрещено (400)",
      r.status_code == 400, r.text[:80])

# 8.10 локация чужого заказчика не привязывается
other = client.post("/api/clients", json={"name": "Чужой"}).json()
oloc = client.post(f"/api/clients/{other['id']}/locations", json={"name": "Чужая"}).json()
r = client.patch(f"/api/tasks/{tid}", json={"location_ids": [oloc["id"]]})
check("8.10 локация чужого заказчика отклонена (400)", r.status_code == 400, r.text[:80])

# 8.11 изменение активного задания -> уведомление "изменено"
SENT.clear()
r = client.patch(f"/api/tasks/{tid}", json={"description": "Помидоры черри"})
check("8.11 изменение активного задания шлёт уведомления всем (3 шт)",
      r.status_code == 200 and len(SENT) == 3, f"отправлено: {len(SENT)}")

# 8.12 часы по неактивному заданию запрещены
r = client.post("/work-entries", json={
    "task_id": tid, "work_date": D2.isoformat(), "hours": "2"},
    headers={"X-Actor-Id": str(w1["id"])})
# запись уже есть за D2 -> 409; создадим на др. дату нельзя — задание active.
# деактивируем задание и попробуем
client.patch(f"/api/tasks/{tid}", json={"status": "done"})
r = client.post("/work-entries", json={
    "task_id": tid, "work_date": "2026-08-26", "hours": "2"},
    headers={"X-Actor-Id": str(w1["id"])})
check("8.12 часы по завершённому заданию запрещены (409)",
      r.status_code == 409, r.text[:80])

print()
fails = [n for n, ok, _ in results if not ok]
print(f"ИТОГ: {len(results) - len(fails)}/{len(results)} пройдено")
if fails:
    print("Провалены:", *fails, sep="\n  - ")
