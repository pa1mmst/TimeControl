"""Браузерные сценарии Mini App: настоящий бэкенд (uvicorn) + Chromium (Playwright).

Включаются переменной BROWSER_TESTS=1 (нужны Node.js и npm-пакет playwright):
    BROWSER_TESTS=1 pytest tests/test_browser.py -v
Без неё модуль пропускается, обычный `pytest` их не запускает.

Каждый тест поднимает свой сервер на свежей базе из tests/browser/seed.py,
поэтому тесты независимы и их порядок не важен.
"""
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
BROWSER_DIR = ROOT / "tests" / "browser"
BOT_TOKEN = "12345:browser-test-token"

pytestmark = pytest.mark.skipif(
    os.environ.get("BROWSER_TESTS") != "1" or shutil.which("node") is None,
    reason="браузерные тесты: BROWSER_TESTS=1 и Node.js",
)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class App:
    """Запущенный сервер + путь к его базе + данные сида."""

    def __init__(self, base_url: str, db_path: Path, seed: dict):
        self.base_url = base_url
        self.db_path = db_path
        self.seed = seed

    def run(self, scenario: str) -> dict:
        env = dict(os.environ, BASE_URL=self.base_url, BOT_TOKEN=BOT_TOKEN,
                   SEED=json.dumps(self.seed, ensure_ascii=False))
        proc = subprocess.run(
            ["node", str(BROWSER_DIR / "scenarios.js"), scenario],
            cwd=ROOT, env=env, capture_output=True, text=True, timeout=120, check=False,
        )
        lines = [ln for ln in proc.stdout.splitlines() if ln.startswith("{")]
        assert lines, f"сценарий {scenario} ничего не вывел:\n{proc.stdout}\n{proc.stderr}"
        result = json.loads(lines[-1])
        assert result.get("ok"), (
            f"сценарий {scenario}: {result.get('error')}\n"
            f"ошибки страницы: {result.get('errors')}\n"
            f"данные: {json.dumps(result.get('data'), ensure_ascii=False)[:1500]}"
        )
        return result

    def query(self, sql: str, *params):
        with sqlite3.connect(self.db_path) as con:
            return con.execute(sql, params).fetchall()


@pytest.fixture
def app(tmp_path):
    db_path = tmp_path / "browser.db"
    env = dict(os.environ, DATABASE_URL=f"sqlite:///{db_path.as_posix()}",
               BOT_TOKEN=BOT_TOKEN, BOT_WEBHOOK_SECRET="test", ENV="test")
    env.pop("BOT_WEBHOOK_URL", None)
    seed_out = subprocess.run(
        [sys.executable, str(BROWSER_DIR / "seed.py")],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=60, check=True,
    ).stdout
    seed = json.loads(seed_out.strip().splitlines()[-1])

    port = _free_port()
    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
         "--port", str(port), "--log-level", "warning"],
        cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    deadline = time.time() + 20
    while True:
        try:
            with urllib.request.urlopen(base + "/health", timeout=1) as r:
                if r.status == 200:
                    break
        except OSError:
            pass
        if server.poll() is not None or time.time() > deadline:
            out = server.stdout.read().decode("utf-8", "replace") if server.stdout else ""
            server.kill()
            pytest.fail(f"сервер не поднялся:\n{out}")
        time.sleep(0.2)
    try:
        yield App(base, db_path, seed)
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


def test_smoke_worker(app):
    app.run("smoke_worker")


def test_smoke_manager(app):
    app.run("smoke_manager")


def test_worker_record_hours(app):
    app.run("worker_record_hours")
    rows = app.query(
        "SELECT hours FROM work_entries WHERE user_id=? AND task_id=? AND work_date=?",
        app.seed["worker"]["id"], app.seed["task_harvest"], app.seed["today"],
    )
    assert [float(r[0]) for r in rows] == [8.0], rows


# ---------- Этап 0: мелкие поломки (ТЗ п. 1, 7, 8, 9) ----------

def test_worker_recorded_card(app):
    app.run("worker_recorded_card")


def test_worker_money_format(app):
    app.run("worker_money_format")


def test_worker_inventory(app):
    app.run("worker_inventory")


def test_network_error_retry(app):
    app.run("network_error_retry")


# ---------- Этап 0: «Деньги» руководителя (ТЗ п. 3, 4, 5, 6) ----------

def test_manager_money_table(app):
    app.run("manager_money_table")


def test_manager_advance(app):
    app.run("manager_advance")
    rows = app.query("SELECT amount FROM advances WHERE user_id=?", app.seed["worker"]["id"])
    assert sorted(float(r[0]) for r in rows) == [15.0, 20.0], rows


def test_manager_close(app):
    result = app.run("manager_close")
    start, end = result["data"]["month"]
    rows = app.query("SELECT user_id, period_start, period_end, net FROM payouts ORDER BY user_id")
    assert len(rows) == 2, rows
    assert {(r[1], r[2]) for r in rows} == {(start, end)}, rows
    assert sum(float(r[3]) for r in rows) == 90.0, rows


def test_manager_reports_menu(app):
    app.run("manager_reports_menu")
