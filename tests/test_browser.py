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

    def execute(self, sql: str, *params) -> None:
        """Изменить данные перед сценарием (сервер читает базу на каждый запрос)."""
        with sqlite3.connect(self.db_path) as con:
            con.execute(sql, params)
            con.commit()


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
    start, _month_end = result["data"]["month"]
    rows = app.query("SELECT user_id, period_start, period_end, net FROM payouts ORDER BY user_id")
    assert len(rows) == 2, rows
    # «Этот месяц» закрывается по сегодня, не по конец месяца: будущие дни не закрываются.
    assert {(r[1], r[2]) for r in rows} == {(start, app.seed["today"])}, rows
    assert sum(float(r[3]) for r in rows) == 90.0, rows


def test_manager_reports_menu(app):
    app.run("manager_reports_menu")


# ---------- Этап 1 ТЗ: понятность (сценарии в tests/browser/stage1.js) ----------

@pytest.mark.parametrize("scenario", [
    "header_clean", "readability", "readability_dark", "first_run_hints",
    "worker_today_money", "worker_coworkers", "worker_history_format", "worker_quick_hours",
    "manager_dash_summary", "manager_tasks_list", "manager_tasks_empty",
    "nav_back_manager", "nav_back_worker", "login_steps",
])
def test_stage1(app, scenario):
    app.run(scenario)


def test_worker_today_negative(app):
    # Аванс 100 € сверху: заработано 50,00, авансы 120,00 → минус 70,00.
    app.execute(
        "INSERT INTO advances (user_id, amount, date, comment, created_by) VALUES (?, ?, ?, ?, ?)",
        app.seed["worker"]["id"], "100.00", app.seed["today"], "test", app.seed["manager"]["id"],
    )
    app.run("worker_today_negative")


def test_manager_enter_for(app):
    app.run("manager_enter_for")
    rows = app.query(
        "SELECT hours, entered_by FROM work_entries WHERE user_id=? AND task_id=? AND work_date=?",
        app.seed["worker3"]["id"], app.seed["task_harvest"], app.seed["today"],
    )
    assert [(float(r[0]), r[1]) for r in rows] == [(8.0, app.seed["manager"]["id"])], rows


def test_manager_new_task_no_reporter(app):
    app.run("manager_new_task_no_reporter")
    task = app.query("SELECT id FROM tasks WHERE title=?", "Обрезка винограда")
    assert len(task) == 1, task
    users = app.query("SELECT user_id FROM task_assignments WHERE task_id=?", task[0][0])
    assert [r[0] for r in users] == [app.seed["worker"]["id"]], users


def test_worker_lang_persist(app):
    app.run("worker_lang_persist")
    rows = app.query("SELECT lang FROM users WHERE id=?", app.seed["worker"]["id"])
    assert rows == [("es",)], rows


# ---------- Этап 2 ТЗ: сеть безопасности перед рефакторингом (tests/browser/sweep.js) ----------

@pytest.mark.parametrize("scenario", [
    "manager_team", "manager_clients", "manager_reports_tabs", "manager_task_matrix",
    "manager_money_periods", "worker_history", "worker_my_money",
    "lang_worker_uk", "lang_worker_es", "lang_manager_uk", "lang_manager_es",
])
def test_sweep(app, scenario):
    app.run(scenario)


def test_manager_inventory_handover(app):
    app.run("manager_inventory_handover")
    rows = app.query("SELECT holder_id FROM inventory_items WHERE name=?", "Секатор №3")
    assert rows == [(app.seed["worker2"]["id"],)], rows


def test_manager_inventory_return(app):
    app.run("manager_inventory_return")
    rows = app.query("SELECT holder_id FROM inventory_items WHERE name=?", "Секатор №3")
    assert rows == [(None,)], rows


def _water_entry(app):
    return app.query(
        "SELECT id, hours FROM work_entries WHERE user_id=? AND task_id=? AND work_date=?",
        app.seed["worker"]["id"], app.seed["task_water"], app.seed["today"],
    )


def test_manager_edit_hours(app):
    app.run("manager_edit_hours")
    rows = _water_entry(app)
    assert [float(r[1]) for r in rows] == [5.0], rows
    audit = app.query(
        "SELECT field, old_value, new_value, reason, actor_id FROM audit_log "
        "WHERE entity='work_entries' AND entity_id=?", rows[0][0],
    )
    assert len(audit) == 1, audit
    field, old, new, reason, actor = audit[0]
    assert (field, float(old), float(new), reason) == ("hours", 4.0, 5.0, "Ошибся при записи"), audit
    assert actor == app.seed["manager"]["id"], audit


def test_manager_edit_hours_no_reason(app):
    app.run("manager_edit_hours_no_reason")
    rows = _water_entry(app)
    assert [float(r[1]) for r in rows] == [4.0], rows
    assert app.query("SELECT count(*) FROM audit_log WHERE entity='work_entries'") == [(0,)]


def test_manager_finish_task(app):
    app.run("manager_finish_task")
    rows = app.query("SELECT status FROM tasks WHERE id=?", app.seed["task_water"])
    assert str(rows[0][0]).lower().endswith("done"), rows
    other = app.query("SELECT status FROM tasks WHERE id=?", app.seed["task_harvest"])
    assert str(other[0][0]).lower().endswith("active"), other


def test_manager_money_since_close(app):
    app.run("manager_money_since_close")
    assert app.query("SELECT count(*) FROM payouts") == [(2,)]


@pytest.mark.xfail(strict=True, reason=(
    "отчёты руководителя показывают деньги без «€» и с точкой вместо запятой "
    "(«50.00 − 20.00 = 30.00» во вкладке «Выплаты», «100.00» в «Отчётах»): "
    "refreshPayPreview/refreshManagerSummary не используют fmtMoney"))
def test_manager_reports_money_format(app):
    app.run("manager_reports_money_format")


@pytest.mark.xfail(strict=True, reason=(
    "в «Отчёты» → «По людям» вместо имён показаны «#2», «#3»: renderManagerSummary ищет "
    "пользователя по ключу-строке из Object.keys (x.id === '2'), строгое сравнение не находит"))
def test_manager_reports_names(app):
    app.run("manager_reports_names")


@pytest.mark.xfail(strict=True, reason=(
    "после сохранения правки часов лист задания с новыми итогами закрывается сразу: "
    "submitHoursEntry открывает его сразу после goBackHome(), а асинхронный "
    "renderManagerDash() вызывает showScreen() -> closeSheet()"))
def test_manager_edit_hours_sheet(app):
    app.run("manager_edit_hours_sheet")


def _harvest_hours(app):
    rows = app.query(
        "SELECT hours FROM work_entries WHERE user_id=? AND task_id=? AND work_date=?",
        app.seed["worker"]["id"], app.seed["task_harvest"], app.seed["today"],
    )
    return [float(r[0]) for r in rows]


def test_worker_offline_queue(app):
    app.run("worker_offline_queue")
    assert _harvest_hours(app) == [8.0]


def test_worker_offline_reload(app):
    app.run("worker_offline_reload")
    assert _harvest_hours(app) == [8.0]
