"""401-коды /api/users/me (перенос _me_401_check.py, этап 2 аудита).

registered — 200; not_registered — пользователя нет в базе -> 401;
deactivated — есть, но is_active=0 -> 401.
Подпись — make_init_data из conftest (тот же BOT_TOKEN, что у приложения).
"""
import pytest

from app.db import SessionLocal
from app.models import User
from tests.conftest import make_init_data


@pytest.fixture(scope="module")
def scenario(fresh_db, client):
    db = SessionLocal()
    db.add_all([
        User(name="Зарегистрирован", is_active=True, tg_id=200001),
        User(name="Деактивирован", is_active=False, tg_id=200002),
    ])
    db.commit()
    db.close()
    return client


def test_registered_200(scenario):
    r = scenario.get("/api/users/me",
                     headers={"X-Telegram-Init-Data": make_init_data(200001)})
    assert r.status_code == 200


def test_not_registered_401(scenario):
    r = scenario.get("/api/users/me",
                     headers={"X-Telegram-Init-Data": make_init_data(299999)})
    assert r.status_code == 401


def test_deactivated_401(scenario):
    r = scenario.get("/api/users/me",
                     headers={"X-Telegram-Init-Data": make_init_data(200002)})
    assert r.status_code == 401


def test_no_header_401_or_422(scenario):
    # miniapp.py объявляет Header(...) (обязательный), поэтому FastAPI
    # отдаёт 422, а не 401; логику miniapp по ТЗ не меняем.
    r = scenario.get("/api/users/me")
    assert r.status_code in (401, 422)
