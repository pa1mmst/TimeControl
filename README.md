# TimeControl (AgroWork)

Учёт рабочих часов и выплат для сельхоз-бригад: сервер на FastAPI + SQLite,
Telegram-бот и Telegram Mini App.

Требования к системе: `SPEC.md`. Текущий план интерфейса: `TimeControl-Mini-App-v4-.md`.
Где мы сейчас и что дальше: **`STATUS.md`** (обновлять после каждого шага).

## Структура
- `app/` — сервер: `main.py` (точка входа), `models.py` (таблицы), `routers/` (API),
  `services/` (бизнес-логика: часы, выплаты, журнал), `bot/` (Telegram-бот), `i18n/` (ru/uk/es).
- `app/routers/aggregates.py` — сводные запросы для экранов Mini App v4.
- `webapp/` — Mini App (`index.html`, `app.js`, `styles.css`), отдаётся на `/` и `/app`.
- `tests/` — pytest-тесты: `test_e2e.py` (сквозной сценарий, 43), `test_bot_flow.py` (поток
  доступа бота, 18), `test_me_401.py` (коды /api/users/me, 4), `test_authz.py` (авторизация
  401/403, 14). Общие фикстуры — `tests/conftest.py`.
- `tools/` — служебные скрипты: `audit_probe_authz.py` (проба авторизации, запускается
  и напрямую, и из `test_authz.py` как subprocess).
- `files/ui/` — скриншоты интерфейса. `_prompts/` — задания исполнителю по UI v3.
- `migrations/` — пока пусто (таблицы создаются через `app.create_tables`).

## Запуск локально (Windows)
```
python -m venv venv
venv\Scripts\pip install -r requirements.txt
copy .env.example .env          (и заполнить переменные)
venv\Scripts\python -m app.create_tables
venv\Scripts\uvicorn app.main:app --reload
```
Проверка: http://127.0.0.1:8000/health → `{"status":"ok"}`, Mini App: http://127.0.0.1:8000/app

## Переменные окружения (.env)
| Переменная | Зачем |
|---|---|
| `BOT_TOKEN` | токен Telegram-бота; без него бот и проверка входа из Telegram не работают |
| `BOT_WEBHOOK_URL` | публичный адрес для вебхука бота (без него вебхук не ставится) |
| `BOT_WEBHOOK_SECRET` | секрет для проверки запросов от Telegram |
| `DATABASE_URL` / `DB_PATH` | база данных; по умолчанию `sqlite:///./agrowork.db` |

## Проверка
`check.bat` — запускает `pytest -q` (79 тестов на временной базе `_pytest_run.db`, сама
создаётся и игнорируется git), печатает `CHECK: OK` или `CHECK: FAILED`.
CI (GitHub Actions, `.github/workflows/ci.yml`) на каждый push: ruff → pytest → pip-audit.
**Ничего не коммитит и не пушит** — это делается вручную после просмотра изменений.

## Правила работы
- Один шаг плана = одно изменение = одна проверка = один коммит с понятным сообщением.
- После шага обновить `STATUS.md`.
- Базы (`*.db`), `.env`, вывод проверок и разовые скрипты в git не попадают (см. `.gitignore`).
