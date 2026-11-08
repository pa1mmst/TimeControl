"""Сквозной сценарий SPEC — перенос _e2e_check.py в pytest (этап 2 аудита, п.11).

Семантика каждой проверки сохранена один-к-одному (43 теста).
Сценарий выполняется один раз в модульной фикстуре scenario; тесты
проверяют сохранённые ответы и снимки уведомлений.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.db import SessionLocal
from app.models import TaskLocation, User
from tests.conftest import init_for, seed_manager

D1, D2 = date(2026, 8, 24), date(2026, 8, 25)


@pytest.fixture(scope="module")
def scenario(fresh_db, client, fake_telegram):
    """Весь сценарий _e2e_check.py по порядку (разделы 1–11)."""
    st = {}

    # ---------- 1. Работники ----------
    boss = seed_manager()
    st["boss"] = boss
    boss_h = init_for(boss)
    st["boss_h"] = boss_h

    w1 = client.post("/api/users", json={
        "name": "Иван", "hourly_rate": "10.00", "phone": "+380991111111"},
        headers=boss_h).json()
    w2 = client.post("/api/users", json={
        "name": "Петро", "hourly_rate": "12.50", "phone": "+380992222222"},
        headers=boss_h).json()
    w3 = client.post("/api/users", json={
        "name": "Оксана", "hourly_rate": "15.00", "phone": "+380993333333"},
        headers=boss_h).json()
    st["w1"], st["w2"], st["w3"] = w1, w2, w3

    # tg_id, чтобы уведомления "доходили"
    db = SessionLocal()
    for uid in (w1["id"], w2["id"], w3["id"]):
        db.get(User, uid).tg_id = 100000 + uid
    db.commit()
    db.close()

    # ---------- 2. Заказчик с 2 локациями ----------
    cl = client.post("/api/clients", json={"name": "Агро-Ферма Тест"},
                     headers=boss_h).json()
    loc1 = client.post(f"/api/clients/{cl['id']}/locations", json={
        "name": "Поле №1", "address": "с. Тестовое 1",
        "map_url": "https://maps.example/1"}, headers=boss_h).json()
    loc2 = client.post(f"/api/clients/{cl['id']}/locations", json={
        "name": "Теплица", "address": "с. Тестовое 2"}, headers=boss_h).json()
    st["cl"], st["loc1"], st["loc2"] = cl, loc1, loc2

    # ---------- 3. Задание + назначения + группа с учётчиком ----------
    task = client.post("/api/tasks", json={
        "title": "Сбор урожая", "description": "Помидоры", "client_id": cl["id"],
        "location_ids": [loc1["id"], loc2["id"]],
        "date_start": D1.isoformat(), "date_end": D2.isoformat(),
        "created_by": boss["id"]}, headers=boss_h).json()
    tid = task["id"]
    st["tid"] = tid
    for uid in (w1["id"], w2["id"], w3["id"]):
        r = client.post(f"/api/tasks/{tid}/assignments", json={"user_id": uid},
                        headers=boss_h)
        assert r.status_code in (200, 201), r.text
    group = client.post(f"/api/tasks/{tid}/groups", json={
        "reporter_id": w1["id"], "member_ids": [w2["id"], w3["id"]]},
        headers=boss_h).json()
    st["group"] = group

    # send_to_reporter для локации 1 (адрес учётчику)
    db = SessionLocal()
    db.query(TaskLocation).filter_by(task_id=tid, location_id=loc1["id"]).update(
        {"send_to_reporter": True})
    db.commit()
    db.close()

    # ---------- 4. Уведомления при переводе в active ----------
    # Снимок ПЕРЕД переводом (в скрипте здесь SENT.clear()).
    sent_before_active = list(fake_telegram.sent)
    r = client.patch(f"/api/tasks/{tid}", json={"status": "active"},
                     headers=boss_h)
    assert r.status_code == 200, r.text
    st["sent_after_active"] = list(fake_telegram.sent)[len(sent_before_active):]

    # ---------- 5. Групповой ввод часов ----------
    H = client.post("/work-entries/group", json={
        "group_id": group["id"], "work_date": D1.isoformat(), "hours": "8",
        "location_id": loc1["id"]}, headers=init_for(w1))
    assert H.status_code == 201, H.text
    st["group_entry"] = H.json()
    entries = client.get("/work-entries", params={"task_id": tid},
                         headers=boss_h).json()
    per_user = {}
    for e in entries:
        if e["work_date"] == D1.isoformat():
            per_user.setdefault(e["user_id"], []).append(e)
    st["per_user"] = per_user

    # ---------- 6. Правка часов + история ----------
    target = per_user[w2["id"]][0]
    st["target"] = target
    sent_before_patch = list(fake_telegram.sent)
    r = client.patch(f"/work-entries/{target['id']}",
                     json={"hours": "6", "reason": "ушёл на 2 ч раньше"},
                     headers=boss_h)
    assert r.status_code == 200, r.text
    st["patch_resp"] = r
    st["sent_after_patch"] = list(fake_telegram.sent)[len(sent_before_patch):]
    st["history"] = client.get(f"/work-entries/{target['id']}/history",
                               headers=boss_h).json()

    # ---------- 7. Расчёт периода ----------
    H2 = client.post("/work-entries/group", json={
        "group_id": group["id"], "work_date": D2.isoformat(), "hours": "8",
        "location_id": loc1["id"]}, headers=init_for(w1))
    assert H2.status_code == 201, H2.text
    adv = client.post("/api/payroll/advances", json={
        "user_id": w2["id"], "amount": "50", "date": D1.isoformat(),
        "comment": "на дорогу", "created_by": boss["id"]}, headers=boss_h)
    assert adv.status_code in (200, 201), adv.text
    st["adv"] = adv.json()

    prev = client.get("/api/payroll/preview",
                      params={"start": D1.isoformat(), "end": D2.isoformat()},
                      headers=boss_h).json()
    st["preview"] = prev

    closed = client.post("/api/payroll/close", json={
        "period_start": D1.isoformat(), "period_end": D2.isoformat(),
        "created_by": boss["id"]}, headers=boss_h)
    assert closed.status_code == 200, closed.text
    st["closed"] = closed.json()
    payouts = {p["user_id"]: p for p in closed.json()}
    st["payouts"] = payouts
    pid = payouts[w1["id"]]["id"]
    st["paid_resp"] = client.patch(f"/api/payroll/payouts/{pid}",
                                   json={"status": "paid",
                                         "actor_id": boss["id"]},
                                   headers=boss_h)

    # ---------- 8. Дополнительные сценарии ----------
    st["dup"] = client.post("/work-entries/group", json={
        "group_id": group["id"], "work_date": D1.isoformat(), "hours": "8"},
        headers=init_for(w1))
    st["r82"] = client.post("/work-entries/group", json={
        "group_id": group["id"], "work_date": D2.isoformat(), "hours": "4"},
        headers=init_for(w3))
    st["r83"] = client.patch(f"/work-entries/{target['id']}", json={"hours": "1"},
                             headers=init_for(w2))
    st["r84"] = client.get("/work-entries", headers=init_for(w3))
    st["r85"] = client.post("/api/payroll/close", json={
        "period_start": D1.isoformat(), "period_end": D2.isoformat(),
        "created_by": boss["id"]}, headers=boss_h)
    st["r86"] = client.patch(f"/api/payroll/advances/{adv.json()['id']}",
                             json={"amount": "10", "actor_id": boss["id"],
                                   "reason": "test"}, headers=boss_h)
    st["r87"] = client.get(f"/work-entries/task/{tid}/summary", headers=boss_h)
    st["r88"] = client.get(f"/api/reports/user/{w2['id']}",
                           params={"start": D1.isoformat(), "end": D2.isoformat()},
                           headers=boss_h)
    st["r89"] = client.delete(f"/api/tasks/{tid}/assignments/{w2['id']}",
                              headers=boss_h)
    other = client.post("/api/clients", json={"name": "Чужой"},
                        headers=boss_h).json()
    oloc = client.post(f"/api/clients/{other['id']}/locations",
                       json={"name": "Чужая"}, headers=boss_h).json()
    st["r810"] = client.patch(f"/api/tasks/{tid}",
                              json={"location_ids": [oloc["id"]]},
                              headers=boss_h)
    # 8.11: снимок ПЕРЕД изменением (в скрипте здесь SENT.clear()).
    sent_before_change = list(fake_telegram.sent)
    st["r811"] = client.patch(f"/api/tasks/{tid}",
                              json={"description": "Помидоры черри"},
                              headers=boss_h)
    st["sent_after_change"] = list(fake_telegram.sent)[len(sent_before_change):]
    # 8.12: запись за D2 уже есть -> 409; деактивируем и пробуем другую дату.
    st["r812a"] = client.post("/work-entries", json={
        "task_id": tid, "work_date": D2.isoformat(), "hours": "2"},
        headers=init_for(w1))
    client.patch(f"/api/tasks/{tid}", json={"status": "done"}, headers=boss_h)
    st["r812"] = client.post("/work-entries", json={
        "task_id": tid, "work_date": "2026-08-26", "hours": "2"},
        headers=init_for(w1))

    # ---------- 9. Дашборд руководителя ----------
    TODAY = date.today().isoformat()
    st["TODAY"] = TODAY
    task2 = client.post("/api/tasks", json={
        "title": "Дашборд-тест", "client_id": cl["id"],
        "location_ids": [loc1["id"]],
        "date_start": TODAY, "date_end": TODAY,
        "created_by": boss["id"]}, headers=boss_h).json()
    t2 = task2["id"]
    st["t2"] = t2
    client.post(f"/api/tasks/{t2}/assignments", json={"user_id": w1["id"]},
                headers=boss_h)
    client.post(f"/api/tasks/{t2}/groups", json={
        "reporter_id": w1["id"], "member_ids": [w1["id"]]}, headers=boss_h)
    client.patch(f"/api/tasks/{t2}", json={"status": "active"}, headers=boss_h)
    H3 = client.post("/work-entries", json={
        "task_id": t2, "work_date": TODAY, "hours": "5",
        "location_id": loc1["id"]}, headers=init_for(w1))
    assert H3.status_code == 201, H3.text

    lst = client.get("/api/tasks", params={"status": "active"},
                     headers=boss_h).json()
    st["dash_task"] = next(t for t in lst if t["id"] == t2)

    # ---------- 10. Агрегатные эндпоинты Mini App v4 ----------
    st["me_today"] = client.get("/api/me/today", headers=init_for(w1)).json()
    st["me_history"] = client.get("/api/me/history", headers=init_for(w2)).json()
    st["me_money"] = client.get("/api/me/money", headers=init_for(w2)).json()
    st["dash_today"] = client.get("/api/dashboard/today", headers=boss_h).json()
    st["matrix"] = client.get(f"/api/tasks/{tid}/matrix", headers=boss_h).json()
    st["user_summary"] = client.get(f"/api/users/{w2['id']}/summary",
                                    headers=boss_h).json()
    st["r10g"] = (
        client.get("/api/dashboard/today", headers=init_for(w2)),
        client.get(f"/api/tasks/{tid}/matrix", headers=init_for(w2)),
        client.get(f"/api/users/{w1['id']}/summary", headers=init_for(w2)),
    )

    # ---------- 11. Анонимный доступ закрыт ----------
    st["r11a"] = client.get("/api/users")
    st["r11b"] = client.get("/api/users", headers={"X-Actor-Id": "1"})
    st["r11c"] = client.post("/api/users",
                             json={"name": "Hacker", "hourly_rate": "1"})
    st["r11d"] = client.get("/api/payroll/payouts")
    return st


# ---------- 1. Работники ----------

def test_01_users_created(scenario):
    boss, w1, w2, w3 = (scenario["boss"], scenario["w1"], scenario["w2"],
                        scenario["w3"])
    assert all(u.get("id") for u in (boss, w1, w2, w3)), (
        f"ids: boss={boss['id']}, {w1['id']}/{w2['id']}/{w3['id']}")


# ---------- 2. Заказчик ----------

def test_02_client_and_locations(scenario):
    cl, loc1, loc2 = (scenario["cl"], scenario["loc1"], scenario["loc2"])
    assert cl.get("id") and loc1.get("id") and loc2.get("id"), (
        f"client={cl['id']}, locs={loc1['id']},{loc2['id']}")


# ---------- 3. Задание ----------

def test_03_task_assignments_group(scenario):
    group = scenario["group"]
    assert group.get("id"), (
        f"task={scenario['tid']}, group={group.get('id')}, "
        f"reporter={group.get('reporter', {}).get('name')}")


# ---------- 4. Уведомления при переводе в active ----------

def test_04a_notifications_on_active(scenario):
    w1, w2, w3 = scenario["w1"], scenario["w2"], scenario["w3"]
    sent = scenario["sent_after_active"]
    recipients = sorted(c for c, _, _ in sent)
    assert recipients == sorted([100000 + w1["id"], 100000 + w2["id"],
                                 100000 + w3["id"]]), (
        f"получателей: {len(sent)}, {recipients}")


def test_04b_reporter_gets_location(scenario):
    w1 = scenario["w1"]
    sent = scenario["sent_after_active"]
    msg_reporter = next(t for c, t, _ in sent if c == 100000 + w1["id"])
    assert "Поле №1" in msg_reporter and "с. Тестовое 1" in msg_reporter, (
        msg_reporter[:120])


def test_04c_reporter_told_is_reporter(scenario):
    w1 = scenario["w1"]
    sent = scenario["sent_after_active"]
    msg_reporter = next(t for c, t, _ in sent if c == 100000 + w1["id"])
    assert "учётчик" in msg_reporter.lower()


def test_04d_member_no_location(scenario):
    w2 = scenario["w2"]
    sent = scenario["sent_after_active"]
    msg_member = next(t for c, t, _ in sent if c == 100000 + w2["id"])
    assert "с. Тестовое 1" not in msg_member


# ---------- 5. Групповой ввод часов ----------

def test_05a_group_entry_created(scenario):
    body = scenario["group_entry"]
    assert len(body["created"]) == 3, (
        f"created={len(body['created'])}, skipped={body['skipped']}")


def test_05b_per_user_entry_with_rate(scenario):
    w1, w2, w3 = scenario["w1"], scenario["w2"], scenario["w3"]
    per_user = scenario["per_user"]
    ok = all(len(per_user.get(u, [])) == 1
             and Decimal(per_user[u][0]["hours"]) == 8
             for u in (w1["id"], w2["id"], w3["id"]))
    assert ok, str({u: [e["hours"] for e in per_user.get(u, [])]
                    for u in (w1["id"], w2["id"], w3["id"])})


def test_05c_entered_by_reporter(scenario):
    w1 = scenario["w1"]
    per_user = scenario["per_user"]
    assert all(e["entered_by"] == w1["id"]
               for lst in per_user.values() for e in lst)


# ---------- 6. Правка часов + история ----------

def test_06a_manager_corrected_hours(scenario):
    r = scenario["patch_resp"]
    assert Decimal(r.json()["hours"]) == 6


def test_06b_history_visible(scenario):
    hist = scenario["history"]
    assert len(hist) == 1 and Decimal(hist[0]["old_value"]) == 8 \
        and Decimal(hist[0]["new_value"]) == 6 \
        and hist[0]["reason"] == "ушёл на 2 ч раньше", (
        f"записей аудита: {len(hist)}")


def test_06c_worker_notified_of_correction(scenario):
    w2 = scenario["w2"]
    sent = scenario["sent_after_patch"]
    assert any(100000 + w2["id"] == c for c, _, _ in sent) and \
        any("6" in t and "8" in t for c, t, _ in sent if c == 100000 + w2["id"]), (
        sent[0][1][:100] if sent else "нет сообщений")


# ---------- 7. Расчёт периода ----------

def test_07a_preview_totals(scenario):
    w1, w2, w3 = scenario["w1"], scenario["w2"], scenario["w3"]
    rows = {r["user_id"]: r for r in scenario["preview"]}
    exp = {
        w1["id"]: (16, 160, 0, 160),      # 10.00 * 16
        w2["id"]: (14, 175, 50, 125),     # 12.50 * (8+6) = 175, аванс 50
        w3["id"]: (16, 240, 0, 240),      # 15.00 * 16
    }
    ok = True
    detail = []
    for uid, (h, g, a, n) in exp.items():
        r = rows.get(uid)
        if not r or (Decimal(r["hours"]), Decimal(r["gross"]),
                     Decimal(r["advances_total"]), Decimal(r["net"])) != (
                Decimal(h), Decimal(g), Decimal(a), Decimal(n)):
            ok = False
            detail.append(str((uid, r)))
    assert ok, "; ".join(detail) or "нет строк preview"


def test_07b_period_closed_payouts(scenario):
    w1, w2, w3 = scenario["w1"], scenario["w2"], scenario["w3"]
    payouts = scenario["payouts"]
    exp_net = {w1["id"]: 160, w2["id"]: 125, w3["id"]: 240}
    ok = all(Decimal(payouts[u]["net"]) == Decimal(n)
             for u, n in exp_net.items())
    assert ok, "; ".join(f"{p['user_id']}:{p['net']}"
                         for p in scenario["closed"])


def test_07c_payout_marked_paid(scenario):
    r = scenario["paid_resp"]
    assert r.status_code == 200 and r.json()["status"] == "paid"


# ---------- 8. Дополнительные сценарии ----------

def test_08_1_duplicate_group_entry_skipped(scenario):
    dup = scenario["dup"]
    assert dup.status_code == 201 and len(dup.json()["created"]) == 0 \
        and len(dup.json()["skipped"]) == 3, dup.text[:100]


def test_08_2_non_reporter_cannot_enter_group(scenario):
    r = scenario["r82"]
    assert r.status_code == 403, r.text[:80]


def test_08_3_worker_cannot_edit_hours(scenario):
    r = scenario["r83"]
    assert r.status_code == 403, r.text[:80]


def test_08_4_worker_sees_only_own_entries(scenario):
    w3 = scenario["w3"]
    r = scenario["r84"]
    assert r.status_code == 200 and all(e["user_id"] == w3["id"]
                                        for e in r.json())


def test_08_5_overlapping_period_rejected(scenario):
    r = scenario["r85"]
    assert r.status_code == 400, r.text[:80]


def test_08_6_advance_in_closed_period_protected(scenario):
    r = scenario["r86"]
    assert r.status_code == 400, r.text[:80]


def test_08_7_task_summary_total_hours(scenario):
    r = scenario["r87"]
    s = r.json()
    assert r.status_code == 200 and Decimal(s["total_hours"]) == 46, (
        f"total={s.get('total_hours')}")


def test_08_8_user_report(scenario):
    r = scenario["r88"]
    assert r.status_code == 200, str(r.json())[:120]


def test_08_9_cannot_unassign_with_hours(scenario):
    r = scenario["r89"]
    assert r.status_code == 400, r.text[:80]


def test_08_10_foreign_location_rejected(scenario):
    r = scenario["r810"]
    assert r.status_code == 400, r.text[:80]


def test_08_11_active_task_change_notifies_all(scenario):
    r = scenario["r811"]
    sent = scenario["sent_after_change"]
    assert r.status_code == 200 and len(sent) == 3, f"отправлено: {len(sent)}"


def test_08_12_hours_on_done_task_forbidden(scenario):
    r = scenario["r812"]
    assert r.status_code == 409, r.text[:80]


# ---------- 9. Дашборд руководителя ----------

def test_09a_dashboard_client_name(scenario):
    dash = scenario["dash_task"]
    assert dash["client_name"] == "Агро-Ферма Тест", str(dash["client_name"])


def test_09b_dashboard_location_names(scenario):
    dash = scenario["dash_task"]
    assert dash["location_names"] == ["Поле №1"], str(dash["location_names"])


def test_09c_dashboard_workers_reporter_flag(scenario):
    w1 = scenario["w1"]
    dash = scenario["dash_task"]
    wk = {w["user_id"]: w for w in dash["workers"]}
    assert w1["id"] in wk and wk[w1["id"]]["is_reporter"] is True, (
        str(dash["workers"]))


def test_09d_dashboard_hours_today(scenario):
    dash = scenario["dash_task"]
    assert Decimal(str(dash["hours_today"])) == 5, str(dash["hours_today"])


# ---------- 10. Агрегатные эндпоинты Mini App v4 ----------

def test_10a_me_today(scenario):
    w1 = scenario["w1"]
    t2 = scenario["t2"]
    mt = scenario["me_today"]
    mt_task = next((t for t in mt["tasks"] if t["id"] == t2), None)
    assert mt_task is not None \
        and Decimal(str(mt_task["my_hours_today"])) == 5 \
        and mt_task["is_reporter"] is True \
        and any(w["user_id"] == w1["id"] and w["hours_today"]
                for w in mt_task["workers"]), str(mt)[:150]


def test_10b_me_history_correction(scenario):
    h = scenario["me_history"]
    corrected = [e for e in h if e["corrected"]]
    assert len(corrected) == 1 \
        and corrected[0]["corrected_reason"] == "ушёл на 2 ч раньше" \
        and Decimal(str(corrected[0]["hours"])) == 6, str(corrected[:1])[:150]


def test_10c_me_money_open_period(scenario):
    m = scenario["me_money"]
    assert m["period_start"] == date(2026, 8, 26).isoformat() \
        and Decimal(str(m["earned"])) == 0 and Decimal(str(m["to_pay"])) == 0 \
        and m["last_payout"] is not None \
        and Decimal(str(m["last_payout"]["amount"])) == 125, str(m)[:200]


def test_10d_dashboard_today(scenario):
    t2 = scenario["t2"]
    d = scenario["dash_today"]
    assert d["workers_count"] == 1 \
        and Decimal(str(d["hours_today"])) == 5 \
        and t2 not in d["tasks_no_hours"] \
        and any(t["id"] == t2 for t in d["tasks"]), str(
        {k: d[k] for k in ("workers_count", "hours_today", "tasks_no_hours")})


def test_10e_task_matrix(scenario):
    w2 = scenario["w2"]
    mx = scenario["matrix"]
    row_w2 = next((row for row in mx["rows"] if row["user_id"] == w2["id"]),
                  None)
    assert mx["dates"] == [D1.isoformat(), D2.isoformat()] \
        and row_w2 is not None \
        and Decimal(str(row_w2["cells"][D1.isoformat()])) == Decimal(6) \
        and Decimal(str(row_w2["cells"][D2.isoformat()])) == Decimal(8), (
        str(mx)[:200])


def test_10f_user_summary(scenario):
    s = scenario["user_summary"]
    assert Decimal(str(s["rate"])) == Decimal("12.50") \
        and s["period_start"] == date(2026, 8, 26).isoformat() \
        and Decimal(str(s["hours_period"])) == 0 \
        and len(s["last_entries"]) >= 1 \
        and any(e["task_title"] == "Сбор урожая" for e in s["last_entries"]), (
        str(s)[:200])


def test_10g_manager_only_endpoints_403(scenario):
    r1, r2, r3 = scenario["r10g"]
    assert r1.status_code == 403 and r2.status_code == 403 \
        and r3.status_code == 403, (
        f"{r1.status_code}/{r2.status_code}/{r3.status_code}")


# ---------- 11. Анонимный доступ закрыт ----------

def test_11a_users_anon_401(scenario):
    r = scenario["r11a"]
    assert r.status_code == 401, r.text[:80]


def test_11b_users_fake_actor_401(scenario):
    r = scenario["r11b"]
    assert r.status_code == 401, r.text[:80]


def test_11c_users_post_anon_401(scenario):
    r = scenario["r11c"]
    assert r.status_code == 401, r.text[:80]


def test_11d_payouts_anon_401(scenario):
    r = scenario["r11d"]
    assert r.status_code == 401, r.text[:80]
