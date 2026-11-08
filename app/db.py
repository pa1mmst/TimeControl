"""Подключение к базе данных SQLite."""
import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Путь к SQLite задаётся переменными окружения DATABASE_URL или DB_PATH.
# По умолчанию — как раньше: файл agrowork.db в корне проекта.
# Это позволяет тестам (_e2e_check.py) работать с отдельной временной базой,
# не трогая рабочую.
DATABASE_URL = os.environ.get("DATABASE_URL") or (
    "sqlite:///" + os.environ["DB_PATH"] if os.environ.get("DB_PATH") else "sqlite:///./agrowork.db"
)

# SQLite-файл лежит в корне проекта.
# check_same_thread=False обязателен для FastAPI:
# запросы обрабатываются в разных потоках, а SQLite по умолчанию
# разрешает доступ только из потока-создателя.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record):
    """Прагмы SQLite на каждое новое соединение (аудит, п.29).

    - WAL: чтения не блокируют запись и наоборот (групповой ввод + офлайн-синк);
    - busy_timeout: вместо мгновенного 'database is locked' — ожидание до 5 с;
    - foreign_keys: SQLite по умолчанию игнорирует внешние ключи.
    """
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


class Base(DeclarativeBase):
    """Базовый класс для всех моделей."""


def get_db():
    """Зависимость FastAPI: выдаёт сессию БД и гарантированно закрывает её."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
