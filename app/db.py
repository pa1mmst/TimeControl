"""Подключение к базе данных SQLite."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# SQLite-файл лежит в корне проекта.
# check_same_thread=False обязателен для FastAPI:
# запросы обрабатываются в разных потоках, а SQLite по умолчанию
# разрешает доступ только из потока-создателя.
DATABASE_URL = "sqlite:///./agrowork.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Базовый класс для всех моделей."""
    pass


def get_db():
    """Зависимость FastAPI: выдаёт сессию БД и гарантированно закрывает её."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
