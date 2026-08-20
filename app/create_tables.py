"""
Создание всех таблиц. Запускать один раз из корня проекта:
    python -m app.create_tables
Скрипт безопасен: существующие таблицы и данные не трогает.
"""
from app.db import Base, engine
from app import models  # noqa: F401  — импорт регистрирует все модели

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Готово. Созданы таблицы:")
    for t in Base.metadata.sorted_tables:
        print(f"  - {t.name}")
