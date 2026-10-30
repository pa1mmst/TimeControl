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
- `_e2e_check.py` — сквозная проверка API (сейчас это единственная проверка; переезд в `tests/` запланирован).
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
`check.bat` — запускает `_e2e_check.py` на отдельной тестовой базе `_e2e_test.db`,
пишет результат в `_last_check.txt`, печатает `CHECK: OK` или `CHECK: FAILED`.
**Ничего не коммитит и не пушит** — это делается вручную после просмотра изменений.

## Правила работы
- Один шаг плана = одно изменение = одна проверка = один коммит с понятным сообщением.
- После шага обновить `STATUS.md`.
- Базы (`*.db`), `.env`, вывод проверок и разовые скрипты в git не попадают (см. `.gitignore`).
