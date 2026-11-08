"""Конфигурация Alembic: метаданные приложения и URL базы из app.db."""
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

# Корень репозитория в sys.path — чтобы импортировать app.* при запуске
# alembic из любой папки.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import DATABASE_URL  # noqa: E402
from app.models import Base  # noqa: E402  (импорт регистрирует все таблицы)

config = context.config

# URL базы берём из app.db (DATABASE_URL/DB_PATH из окружения),
# а не из alembic.ini — единый источник правды.
config.set_main_option("sqlalchemy.url", DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Офлайн-режим: только генерация SQL без подключения к базе."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # SQLite: ALTER через копию таблицы
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Онлайн-режим: реальное применение миграций."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # SQLite: ALTER через копию таблицы
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
