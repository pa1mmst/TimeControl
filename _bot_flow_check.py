# -*- coding: utf-8 -*-
"""Разовая проверка потока одобрения доступа (ТЗ access_v1, задача 1).

Незнакомец -> контакт -> заявка -> approve/reject руководителем.
Запуск: venv\\Scripts\\python.exe _bot_flow_check.py
"""
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

os.environ["DATABASE_URL"] = "sqlite:///./_bot_test.db"
os.environ["BOT_WEBHOOK_SECRET"] = "test"
try:
    os.remove("_bot_test.db")
except OSError:
    pass

from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal, engine, Base
import app.bot.router as bot_router_mod
from app.bot.telegram import WEBHOOK_SECRET
import app.bot.notifications as notif_mod

Base.metadata.create_all(bind=engine)
client = TestClient(app)

SENT = []


def fake_send(chat_id, text, reply_markup=None):
    SENT.append({"chat_id": chat_id, "text": text, "markup": reply_markup})
    return True


bot_router_mod.send_message = fake_send
notif_mod.send_message = fake_send

ANSWERED = []


def fake_answer(cbq, text):
    ANSWERED.append((cbq, text))


bot_router_mod._answer_callback = fake_answer

results = []


def check(name, ok, info=""):
    results.append((name, ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  | {info}" if info else ""))


H = {"X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET}

db = SessionLocal()
from app.models import User, AccessRequest

boss = User(name="Босс", is_manager=True, is_active=True, tg_id=100500, lang="ru")
db.add(boss)
db.commit()

# --- 1. незнакомец делится контактом ---
upd = {"message": {"chat": {"id": 777}, "from": {"id": 777, "first_name": "Сезонный Рабочий", "language_code": "ru"},
                   "contact": {"user_id": 777, "phone_number": "+380995554433", "first_name": "Сезонный Рабочий"}}}
r = client.post("/bot/webhook", json=upd, headers=H)
check("1. webhook 200", r.status_code == 200, str(r.json()))
check("2. человеку ответили request_sent", "Заявка отправлена" in SENT[-1]["text"], SENT[-1]["text"][:60])
req = db.query(AccessRequest).filter(AccessRequest.tg_id == 777).one_or_none()
check("3. заявка pending в базе", req is not None and req.status.value == "pending", f"req_id={req.id if req else None}")
mgr_msgs = [m for m in SENT if m["chat_id"] == 100500]
check("4. руководителю уведомление с кнопками", len(mgr_msgs) == 1 and "inline_keyboard" in (mgr_msgs[0]["markup"] or {}),
      (mgr_msgs[0]["text"][:60] if mgr_msgs else "нет"))
kb = mgr_msgs[0]["markup"]["inline_keyboard"][0]
check("5. callback_data acc:approve/reject:<id>",
      kb[0]["callback_data"] == f"acc:approve:{req.id}" and kb[1]["callback_data"] == f"acc:reject:{req.id}", str(kb))

# --- 2. повторный контакт: pending, без дубля ---
SENT.clear()
client.post("/bot/webhook", json=upd, headers=H)
cnt = db.query(AccessRequest).filter(AccessRequest.tg_id == 777).count()
check("6. повторный контакт -> request_pending", "на рассмотрении" in SENT[-1]["text"], SENT[-1]["text"][:60])
check("7. дублей заявок нет", cnt == 1, f"count={cnt}")

# --- 3. approve ---
SENT.clear()
cbq = {"id": "cbq1", "from": {"id": 100500}, "data": f"acc:approve:{req.id}"}
client.post("/bot/webhook", json={"callback_query": cbq}, headers=H)
db.expire_all()
req2 = db.query(AccessRequest).filter(AccessRequest.tg_id == 777).one()
user = db.query(User).filter(User.tg_id == 777).one_or_none()
check("8. заявка approved", req2.status.value == "approved", req2.status.value)
check("9. User создан, is_active=1, is_manager=0",
      user is not None and user.is_active and not user.is_manager, f"user_id={user.id if user else None}")
check("10. decided_by = руководитель", req2.decided_by == boss.id, str(req2.decided_by))
texts = " || ".join(m["text"] for m in SENT)
check("11. человеку: доступ выдан", "доступ" in texts.lower(), texts[:120])
check("12. руководителю: подтверждение", "Одобрено" in texts, texts[:120])

# --- 4. reject для второго незнакомца ---
upd2 = {"message": {"chat": {"id": 888}, "from": {"id": 888, "first_name": "Второй", "language_code": "ru"},
                    "contact": {"user_id": 888, "phone_number": "+380996667755", "first_name": "Второй"}}}
SENT.clear()
client.post("/bot/webhook", json=upd2, headers=H)
req3 = db.query(AccessRequest).filter(AccessRequest.tg_id == 888).one()
SENT.clear()
client.post("/bot/webhook", json={"callback_query": {"id": "cbq2", "from": {"id": 100500}, "data": f"acc:reject:{req3.id}"}}, headers=H)
db.expire_all()
req3 = db.query(AccessRequest).filter(AccessRequest.tg_id == 888).one()
user2 = db.query(User).filter(User.tg_id == 888).one_or_none()
check("13. заявка rejected", req3.status.value == "rejected", req3.status.value)
check("14. User НЕ создан", user2 is None, str(user2))
check("15. человеку: отклонено", any("отклонена" in m["text"].lower() for m in SENT),
      " || ".join(m["text"][:40] for m in SENT))

# --- 5. approve не-руководителем запрещён ---
upd3 = {"message": {"chat": {"id": 999}, "from": {"id": 999, "first_name": "Третий", "language_code": "ru"},
                    "contact": {"user_id": 999, "phone_number": "+380997778866", "first_name": "Третий"}}}
client.post("/bot/webhook", json=upd3, headers=H)
req4 = db.query(AccessRequest).filter(AccessRequest.tg_id == 999).one()
SENT.clear()
client.post("/bot/webhook", json={"callback_query": {"id": "cbq3", "from": {"id": 777}, "data": f"acc:approve:{req4.id}"}}, headers=H)
db.expire_all()
req4 = db.query(AccessRequest).filter(AccessRequest.tg_id == 999).one()
check("16. не-руководитель не может одобрить",
      req4.status.value == "pending" and ANSWERED and "руководитель" in ANSWERED[-1][1].lower(),
      f"status={req4.status.value}, answer={ANSWERED[-1][1] if ANSWERED else None}")

# --- 6. повторный approve той же заявки ---
SENT.clear()
client.post("/bot/webhook", json={"callback_query": {"id": "cbq4", "from": {"id": 100500}, "data": f"acc:approve:{req2.id}"}}, headers=H)
db.expire_all()
users777 = db.query(User).filter(User.tg_id == 777).count()
check("17. повторный approve: дублей User нет", users777 == 1, f"users={users777}")

# --- 7. webhook с неверным секретом отклонён (аудит, п.4) ---
r = client.post("/bot/webhook", json=upd, headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"})
check("18. webhook с неверным секретом -> 403", r.status_code == 403, r.text[:60])

print()
print(f"ИТОГ: {sum(1 for _, ok in results if ok)}/{len(results)} пройдено")
db.close()
