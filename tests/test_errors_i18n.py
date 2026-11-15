"""Ошибки API и ответы бота — на языке пользователя (ТЗ 4.3)."""
from datetime import date

import pytest

from app.db import SessionLocal
from app.models import Payout, PayoutStatus, User
from tests.conftest import make_init_data

WORKER_TG = 410001
BOSS_UK_TG = 410002
BOSS_RU_TG = 410003


def _hdr(tg_id):
    return {"X-Telegram-Init-Data": make_init_data(tg_id)}


@pytest.fixture(scope="module")
def seeded(fresh_db):
    db = SessionLocal()
    worker = User(name="Хуан", is_active=True, tg_id=WORKER_TG, lang="es")
    boss_uk = User(name="Керівник", is_active=True, is_manager=True,
                   tg_id=BOSS_UK_TG, lang="uk")
    boss_ru = User(name="Босс", is_active=True, is_manager=True,
                   tg_id=BOSS_RU_TG, lang="ru")
    db.add_all([worker, boss_uk, boss_ru])
    db.commit()
    db.add(Payout(user_id=worker.id, period_start=date(2026, 1, 1),
                  period_end=date(2026, 1, 31), gross=0, advances_total=0,
                  net=0, status=PayoutStatus.accrued))
    db.commit()
    db.close()


def test_es_worker_cannot_edit_entry(client, seeded):
    r = client.patch("/work-entries/1", json={"hours": 5}, headers=_hdr(WORKER_TG))
    assert r.status_code == 403
    assert r.json()["detail"] == "Solo el responsable puede modificar las horas"


CLOSE = {"period_start": "2026-01-15", "period_end": "2026-02-15", "created_by": 1}


def test_uk_manager_overlap_has_worker_name(client, seeded):
    r = client.post("/api/payroll/close", json=CLOSE, headers=_hdr(BOSS_UK_TG))
    assert r.status_code == 400
    assert r.json()["detail"] == "Період перетинається із вже закритим розрахунком: Хуан"


def test_ru_manager_overlap_has_worker_name(client, seeded):
    r = client.post("/api/payroll/close", json=CLOSE, headers=_hdr(BOSS_RU_TG))
    assert r.status_code == 400
    assert r.json()["detail"] == "Период пересекается с уже закрытым расчётом: Хуан"


def test_es_bot_callback_by_non_manager(client, seeded, fake_telegram):
    fake_telegram.answered.clear()
    cbq = {"id": "i18n1", "from": {"id": WORKER_TG}, "data": "acc:approve:1"}
    r = client.post("/bot/webhook", json={"callback_query": cbq},
                    headers={"X-Telegram-Bot-Api-Secret-Token": "test"})
    assert r.status_code == 200
    assert fake_telegram.answered[-1][1] == "❌ Solo el responsable puede resolver las solicitudes"
