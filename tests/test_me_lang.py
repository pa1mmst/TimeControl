"""PATCH /api/me/lang: язык интерфейса хранится на сервере."""
import pytest

from app.db import SessionLocal
from app.models import User
from tests.conftest import make_init_data

TG_ID = 310001


@pytest.fixture(scope="module")
def scenario(fresh_db, client):
    db = SessionLocal()
    db.add(User(name="Работник языка", is_active=True, tg_id=TG_ID))
    db.commit()
    db.close()
    return client


def _hdr():
    return {"X-Telegram-Init-Data": make_init_data(TG_ID)}


def test_set_lang_es(scenario):
    r = scenario.patch("/api/me/lang", json={"lang": "es"}, headers=_hdr())
    assert r.status_code == 200
    assert r.json() == {"lang": "es"}
    me = scenario.get("/api/users/me", headers=_hdr())
    assert me.json()["lang"] == "es"


def test_invalid_lang_422(scenario):
    r = scenario.patch("/api/me/lang", json={"lang": "de"}, headers=_hdr())
    assert r.status_code == 422


def test_no_init_data_401(scenario):
    r = scenario.patch("/api/me/lang", json={"lang": "ru"})
    assert r.status_code == 401
