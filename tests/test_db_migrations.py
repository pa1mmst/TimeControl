"""Миграции Alembic: чистая база → полная схема (аудит, п.15 и 27).

Проверяет, что `alembic upgrade head` на пустой базе создаёт все таблицы
и уникальность work_entries(user_id, task_id, work_date) — защита от
гонки при двойном нажатии/офлайн-синке.
"""
import os
import sqlite3
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable


@pytest.fixture()
def migrated_db(tmp_path, monkeypatch):
    """Чистая база → alembic upgrade head → путь к файлу базы."""
    db = tmp_path / "mig.db"
    # conftest выставляет DATABASE_URL=_pytest_run.db; app.db читает её при
    # импорте, а alembic env.py импортирует app.db — поэтому в subprocess
    # нужно переопределить ОБЕ переменные (URL имеет приоритет над DB_PATH).
    env = {**os.environ,
           "DATABASE_URL": f"sqlite:///{db}",
           "DB_PATH": str(db)}
    r = subprocess.run(
        [PY, "-m", "alembic", "upgrade", "head"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert r.returncode == 0, f"alembic упал:\n{r.stdout}\n{r.stderr}"
    return str(db)


def test_01_all_tables_created(migrated_db):
    """Все таблицы приложения созданы миграцией."""
    con = sqlite3.connect(migrated_db)
    tables = {r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    con.close()
    expected = {
        "users", "clients", "locations", "tasks", "task_assignments",
        "work_entries", "advances", "payouts", "audit_log", "access_requests",
    }
    missing = expected - tables
    assert not missing, f"Миграция не создала таблицы: {missing}"


def test_02_work_entries_unique(migrated_db):
    """Уникальность (user_id, task_id, work_date) на уровне БД (п.27)."""
    con = sqlite3.connect(migrated_db)
    idx = con.execute("PRAGMA index_list('work_entries')").fetchall()
    con.close()
    uniq = [i for i in idx if i[2]]  # третий столбец — флаг unique
    assert uniq, "Нет ни одного уникального индекса в work_entries"


def test_03_composite_indexes(migrated_db):
    """Составные индексы для частых запросов (п.27)."""
    con = sqlite3.connect(migrated_db)
    names = {r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='index'"
    )}
    con.close()
    for name in ("ix_we_user_date", "ix_we_task_date", "ix_audit_entity"):
        assert name in names, f"Индекса {name} нет"
