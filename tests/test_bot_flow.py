"""Поток одобрения доступа (перенос _bot_flow_check.py, этап 2 аудита).

Незнакомец -> контакт -> заявка -> approve/reject руководителем.
Семантика и строки сообщений — точно как в эталонном скрипте.
"""
import pytest

from app.bot.telegram import WEBHOOK_SECRET
from app.db import SessionLocal
from app.models import AccessRequest, User

H = {"X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET}

UPD_777 = {"message": {"chat": {"id": 777},
                       "from": {"id": 777, "first_name": "Сезонный Рабочий",
                                "language_code": "ru"},
                       "contact": {"user_id": 777, "phone_number": "+380995554433",
                                   "first_name": "Сезонный Рабочий"}}}
UPD_888 = {"message": {"chat": {"id": 888},
                       "from": {"id": 888, "first_name": "Второй",
                                "language_code": "ru"},
                       "contact": {"user_id": 888, "phone_number": "+380996667755",
                                   "first_name": "Второй"}}}
UPD_999 = {"message": {"chat": {"id": 999},
                       "from": {"id": 999, "first_name": "Третий",
                                "language_code": "ru"},
                       "contact": {"user_id": 999, "phone_number": "+380997778866",
                                   "first_name": "Третий"}}}


@pytest.fixture(scope="module")
def scenario(fresh_db, client, fake_telegram):
    """Сеет руководителя и прогоняет всю последовательность скрипта (разделы 1–7)."""
    fake = fake_telegram
    db = SessionLocal()
    boss = User(name="Босс", is_manager=True, is_active=True, tg_id=100500, lang="ru")
    db.add(boss)
    db.commit()
    boss_id = boss.id

    state = {"boss_id": boss_id}

    # --- 1. незнакомец делится контактом ---
    r = client.post("/bot/webhook", json=UPD_777, headers=H)
    state["r_contact"] = r
    state["sent_after_contact"] = list(fake.sent)
    req = db.query(AccessRequest).filter(AccessRequest.tg_id == 777).one_or_none()
    state["req_id"] = req.id if req else None
    state["req_status"] = req.status.value if req else None

    # --- 2. повторный контакт: pending, без дубля ---
    client.post("/bot/webhook", json=UPD_777, headers=H)
    state["sent_after_repeat"] = list(fake.sent)
    state["req_count"] = db.query(AccessRequest).filter(
        AccessRequest.tg_id == 777).count()

    # --- 3. approve ---
    cbq = {"id": "cbq1", "from": {"id": 100500}, "data": f"acc:approve:{req.id}"}
    client.post("/bot/webhook", json={"callback_query": cbq}, headers=H)
    db.expire_all()
    req2 = db.query(AccessRequest).filter(AccessRequest.tg_id == 777).one()
    state["req2_id"] = req2.id
    state["req2_status"] = req2.status.value
    state["req2_decided_by"] = req2.decided_by
    user777 = db.query(User).filter(User.tg_id == 777).one_or_none()
    state["user777"] = (user777.id, user777.is_active, user777.is_manager) if user777 else None
    state["sent_after_approve"] = list(fake.sent)

    # --- 4. reject для второго незнакомца ---
    client.post("/bot/webhook", json=UPD_888, headers=H)
    req3 = db.query(AccessRequest).filter(AccessRequest.tg_id == 888).one()
    state["req3_id"] = req3.id
    client.post("/bot/webhook", json={"callback_query": {
        "id": "cbq2", "from": {"id": 100500},
        "data": f"acc:reject:{req3.id}"}}, headers=H)
    db.expire_all()
    state["req3_status"] = db.query(AccessRequest).filter(
        AccessRequest.tg_id == 888).one().status.value
    state["user888"] = db.query(User).filter(User.tg_id == 888).one_or_none()
    state["sent_after_reject"] = list(fake.sent)

    # --- 5. approve не-руководителем запрещён ---
    client.post("/bot/webhook", json=UPD_999, headers=H)
    req4 = db.query(AccessRequest).filter(AccessRequest.tg_id == 999).one()
    state["req4_id"] = req4.id
    client.post("/bot/webhook", json={"callback_query": {
        "id": "cbq3", "from": {"id": 777},
        "data": f"acc:approve:{req4.id}"}}, headers=H)
    db.expire_all()
    state["req4_status"] = db.query(AccessRequest).filter(
        AccessRequest.tg_id == 999).one().status.value
    state["answered_after_nonmanager"] = list(fake.answered)

    # --- 6. повторный approve той же заявки ---
    client.post("/bot/webhook", json={"callback_query": {
        "id": "cbq4", "from": {"id": 100500},
        "data": f"acc:approve:{req2.id}"}}, headers=H)
    db.expire_all()
    state["users777_count"] = db.query(User).filter(User.tg_id == 777).count()

    # --- 7. webhook с неверным секретом отклонён (аудит, п.4) ---
    state["r_wrong_secret"] = client.post(
        "/bot/webhook", json=UPD_777,
        headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"})

    db.close()
    return state


def _mgr_msgs(sent, chat_id=100500):
    return [m for m in sent if m[0] == chat_id]


# --- 1. незнакомец делится контактом ---

def test_01_webhook_200(scenario):
    assert scenario["r_contact"].status_code == 200


def test_02_request_sent_reply(scenario):
    sent = scenario["sent_after_contact"]
    assert "Заявка отправлена" in sent[-1][1]


def test_03_request_pending_in_db(scenario):
    assert scenario["req_id"] is not None and scenario["req_status"] == "pending"


def test_04_manager_notified_with_buttons(scenario):
    mgr_msgs = _mgr_msgs(scenario["sent_after_contact"])
    assert len(mgr_msgs) == 1 and "inline_keyboard" in (mgr_msgs[0][2] or {})


def test_05_callback_data_format(scenario):
    kb = _mgr_msgs(scenario["sent_after_contact"])[0][2]["inline_keyboard"][0]
    assert kb[0]["callback_data"] == f"acc:approve:{scenario['req_id']}"
    assert kb[1]["callback_data"] == f"acc:reject:{scenario['req_id']}"


# --- 2. повторный контакт ---

def test_06_repeat_contact_pending(scenario):
    assert "на рассмотрении" in scenario["sent_after_repeat"][-1][1]


def test_07_no_duplicate_requests(scenario):
    assert scenario["req_count"] == 1


# --- 3. approve ---

def test_08_request_approved(scenario):
    assert scenario["req2_status"] == "approved"


def test_09_user_created_active_not_manager(scenario):
    user = scenario["user777"]
    assert user is not None and user[1] and not user[2]


def test_10_decided_by_manager(scenario):
    assert scenario["req2_decided_by"] == scenario["boss_id"]


def test_11_user_told_access_granted(scenario):
    texts = " || ".join(m[1] for m in scenario["sent_after_approve"])
    assert "доступ" in texts.lower()


def test_12_manager_confirmation(scenario):
    texts = " || ".join(m[1] for m in scenario["sent_after_approve"])
    assert "Одобрено" in texts


# --- 4. reject ---

def test_13_request_rejected(scenario):
    assert scenario["req3_status"] == "rejected"


def test_14_user_not_created_on_reject(scenario):
    assert scenario["user888"] is None


def test_15_user_told_rejected(scenario):
    assert any("отклонена" in m[1].lower() for m in scenario["sent_after_reject"])


# --- 5. approve не-руководителем ---

def test_16_nonmanager_cannot_approve(scenario):
    answered = scenario["answered_after_nonmanager"]
    assert (scenario["req4_status"] == "pending" and answered
            and "руководитель" in answered[-1][1].lower())


# --- 6. повторный approve ---

def test_17_repeat_approve_no_duplicate_user(scenario):
    assert scenario["users777_count"] == 1


# --- 7. неверный секрет ---

def test_18_wrong_secret_403(scenario):
    assert scenario["r_wrong_secret"].status_code == 403
