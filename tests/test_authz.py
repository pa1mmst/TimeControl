"""Проба авторизации (перенос tools/audit_probe_authz.py, этап 2 аудита).

Анонимные запросы отклоняются (401), работник на manager-эндпоинте — 403,
позитивный контроль — 200. Закрытие /docs при ENV=prod проверяется
отдельным subprocess-тестом (см. test_14_probe_subprocess).
"""
import os
import subprocess
import sys

import pytest

from app.db import SessionLocal
from app.models import User
from tests.conftest import make_init_data

BOSS_TG, WORKER_TG = 900001, 900002


@pytest.fixture(scope="module")
def scenario(fresh_db, client):
    db = SessionLocal()
    boss = User(name="Босс", is_manager=True, is_active=True, tg_id=BOSS_TG)
    worker = User(name="Работник", is_manager=False, is_active=True, tg_id=WORKER_TG)
    db.add_all([boss, worker])
    db.commit()
    state = {
        "boss_id": boss.id,
        "worker_id": worker.id,
        "boss_init": {"X-Telegram-Init-Data": make_init_data(BOSS_TG)},
        "worker_init": {"X-Telegram-Init-Data": make_init_data(WORKER_TG)},
    }
    db.close()
    return state


def test_01_post_users_anon_401(scenario, client):
    r = client.post("/api/users", json={"name": "Hacker", "hourly_rate": "1"})
    assert r.status_code == 401


def test_02_get_users_anon_401(scenario, client):
    assert client.get("/api/users").status_code == 401


def test_03_patch_user_anon_401(scenario, client):
    r = client.patch(f"/api/users/{scenario['boss_id']}",
                     json={"hourly_rate": "1000"})
    assert r.status_code == 401


def test_04_post_clients_anon_401(scenario, client):
    assert client.post("/api/clients", json={"name": "X"}).status_code == 401


def test_05_get_payouts_anon_401(scenario, client):
    assert client.get("/api/payroll/payouts").status_code == 401


def test_06_get_payroll_preview_anon_401(scenario, client):
    r = client.get("/api/payroll/preview?start=2026-01-01&end=2026-12-31")
    assert r.status_code == 401


def test_07_get_work_entries_anon_401(scenario, client):
    assert client.get("/work-entries").status_code == 401


def test_08_get_work_entries_fake_actor_401(scenario, client):
    r = client.get("/work-entries", headers={"X-Actor-Id": str(scenario["boss_id"])})
    assert r.status_code == 401


def test_09_get_dashboard_anon_401(scenario, client):
    assert client.get("/api/dashboard/today").status_code == 401


def test_10_get_dashboard_fake_actor_401(scenario, client):
    r = client.get("/api/dashboard/today",
                   headers={"X-Actor-Id": str(scenario["boss_id"])})
    assert r.status_code == 401


def test_11_delete_user_anon_401(scenario, client):
    r = client.delete(f"/api/users/{scenario['boss_id']}")
    assert r.status_code == 401


def test_12_worker_on_manager_endpoint_403(scenario, client):
    r = client.get("/api/users", headers=scenario["worker_init"])
    assert r.status_code == 403


def test_13_manager_me_200(scenario, client):
    r = client.get("/api/users/me", headers=scenario["boss_init"])
    assert r.status_code == 200


def test_14_probe_subprocess(scenario):
    """Проба запускается отдельным процессом, потому что ENV читается при
    импорте app, а app в процессе pytest уже создан с ENV тестового окружения;
    закрытие /docs при ENV=prod можно проверить только в чистом процессе."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    proc = subprocess.run(
        [sys.executable, "tools/audit_probe_authz.py"],
        cwd=root, timeout=180, check=False,
        capture_output=True, encoding="utf-8", errors="replace")
    assert proc.returncode == 0, proc.stdout[-2000:] + proc.stderr[-2000:]
