# Аудит приложения TimeControl (AgroWork)

_Дата аудита: 06.11.2026. Ветка `master`, базовый коммит `f706531`._
_Стек: FastAPI + SQLAlchemy 2 + SQLite, Telegram-бот (webhook), Mini App (`webapp/app.js`, ~3200 строк)._

## 1. Резюме

| Область | Оценка | Главное |
|---|---|---|
| Безопасность | **Критично** | Почти все API без `X-Telegram-Init-Data` работают **без авторизации** (fallback для «старых клиентов»). `X-Actor-Id` — подделываемый заголовок. Подтверждено пробой (раздел 6.6). |
| Качество кода | Средне | Бизнес-логика частично в сервисах, частично в роутерах; дублирование кода проверки подписи; 128 замечаний ruff; нет pytest-тестов (только скрипты `_e2e_check.py`). |
| Зависимости | Средне | `requirements.txt` без версий; в venv 26 известных уязвимостей (aiohttp, certifi, multidict, pip, setuptools); лишние пакеты (aiogram и др.) в окружении. |
| Производительность | Приемлемо для текущего объёма | N+1 в `reports.py` и `/api/users/me`; агрегаты считаются в Python; нет составных индексов; синхронные HTTP-вызовы Telegram внутри запросов. |

**Главный вывод:** функционально приложение рабочее (e2e 39/39), но модель авторизации держится на том, что клиент «сам присылает» initData. Любой, кто знает URL `https://timecontrol.duckdns.org`, может без Telegram создать руководителя, поменять ставки, закрыть период выплат и прочитать персональные данные. Это нужно закрыть **до** любых новых фич.

**Что сознательно откладываем:** переход на PostgreSQL, асинхронный стек, переписывание фронтенда на фреймворк — при текущем масштабе (одна ферма, десятки сотрудников) это не окупается.

## 2. Лист предлагаемых изменений

Приоритеты: **Высокий** — сделать в ближайший релиз (риск утечки/порчи данных); **Средний** — в течение 2–4 недель; **Низкий** — по мере работы с кодом.

| № | Приоритет | Область | Файл / модуль | Проблема | Предлагаемое изменение |
|---|---|---|---|---|---|
| 1 | Высокий | Безопасность | `app/routers/users.py`, `clients.py`, `tasks.py`, `inventory.py`, `payroll.py` | Проверка `require_manager` выполняется только `if actor is not None`. Без заголовка initData — никаких проверок: можно создать/деактивировать пользователя, сделать себя руководителем, менять ставки, закрыть период (проба: все запросы → 200). | Сделать `get_actor` обязательным (`require_actor`), убрать ветку «старое поведение». Для e2e-скриптов — фикстура, подписывающая initData тестовым `BOT_TOKEN`, либо `dependency_overrides` в тестах. |
| 2 | Высокий | Безопасность | `app/deps.py` (`get_current_user`), `app/routers/aggregates.py` (`_resolve_actor`, `_manager_dep`), `app/routers/work_entries.py` | Fallback на заголовок `X-Actor-Id` — клиент сам указывает, кто он. Подставив `X-Actor-Id: <id руководителя>`, можно править часы, видеть дашборд и деньги всех. `work_entries` вообще **требует** `X-Actor-Id` и использует его для GET-эндпоинтов. | Удалить `get_current_user` и все обращения к `X-Actor-Id`; везде использовать actor из подписанного initData. В `webapp/app.js` (стр. 877) перестать отправлять `X-Actor-Id`. |
| 3 | Высокий | Безопасность | `app/routers/clients.py`, `reports.py`, `payroll.py` (`list_advances`, `preview`, `list_payouts`), `users.py` (`list_users`, `get_user`), `tasks.py` (`list_tasks`, `get_task`) | GET-эндпоинты вообще не имеют зависимостей авторизации: телефоны, ставки, выплаты и отчёты доступны анонимно. `clients.py` — и запись тоже (`create_client`, `update_client`, локации). | Подключить авторизацию на уровне роутера: `APIRouter(dependencies=[Depends(require_actor)])`, для управленческих — `Depends(require_manager_dep)`. Работнику отдавать только свои данные. |
| 4 | Высокий | Безопасность | `app/bot/telegram.py` стр. 18 | `BOT_WEBHOOK_SECRET` по умолчанию `"change-me"`: если переменная не задана, webhook защищён известной строкой — можно слать поддельные апдейты (в т.ч. `callback_query` одобрения заявок от имени руководителя по его tg_id). | Без заданного секрета не регистрировать webhook и отвечать 503; при старте логировать ошибку. Сравнение через `hmac.compare_digest`. |
| 5 | Высокий | Безопасность | `app/main.py` | Swagger `/docs`, `/redoc`, `/openapi.json` открыты в проде — готовая карта всех незащищённых эндпоинтов. | `FastAPI(docs_url=None, redoc_url=None, openapi_url=None)` при `ENV=prod`. |
| 6 | Высокий | Безопасность / данные | `app/routers/users.py` (`update_user`, `deactivate_user`), `clients.py`, `inventory.py` | Изменения пользователей (ставка, `is_manager`, `is_active`) не пишутся в `AuditLog`. Инцидент 05.11.2026 («Админ» деактивирован, кто — неизвестно) — прямое следствие. | Писать `log_change` (`app/services/audit.py`) на каждое изменение пользователя/клиента/инвентаря; запретить руководителю деактивировать последнего активного руководителя и самого себя. |
| 7 | Средний | Безопасность | `app/bot/notifications.py`, `app/bot/router.py`, `app/bot/telegram.py` (`parse_mode: HTML`) | Имена, названия заданий, адреса и причины правок подставляются в HTML-сообщения без экранирования. `<` в имени ломает отправку (Telegram 400 — уведомление молча теряется), возможна подмена ссылок. | Экранировать параметры через `html.escape` внутри `i18n.t()` (или в местах вызова). |
| 8 | Средний | Безопасность | `app/auth.py` | `auth_date` необязателен — initData без него принимается бессрочно; срок 24 ч велик для API, меняющего деньги. | Требовать `auth_date`, сократить окно (например, 1–6 ч), вынести в настройку. |
| 9 | Средний | Безопасность | `app/main.py` / инфраструктура (Caddy) | Нет ограничения частоты запросов и заголовков безопасности (CSP, `X-Content-Type-Options`). | Rate-limit на Caddy для `/api/*` и `/bot/webhook`; базовые security headers в Caddyfile. |
| 10 | Средний | Безопасность | Репозиторий: `agrowork.db`, `app.db`, `*_test.db` в корне | Рабочая база с персональными данными лежит в папке проекта рядом с кодом (в git не попадает — `.gitignore` корректный), бэкапы не описаны. | Вынести БД в `/var/lib/timecontrol`, настроить ежедневный бэкап (`sqlite3 .backup`) с ротацией. |

| 11 | Высокий | Качество кода | `tests/` (пусто), `_e2e_check.py`, `_bot_flow_check.py`, `_me_401_check.py`, `check.bat` | `pytest` собирает 0 тестов (код выхода 5): проверки живут в самописных скриптах с `PASS/FAIL` и разбором вывода через `findstr`. CI нет. | Перенести сценарии в `tests/test_*.py` (pytest + `TestClient`, временная БД через фикстуру); добавить GitHub Actions: ruff + pytest + pip-audit на каждый push. |
| 12 | Средний | Качество кода | `app/routers/miniapp.py` | Мёртвые импорты (`hashlib`, `hmac`, `os`, `time`, `parse_qsl`), обёртка `_check_signature`, своя копия разбора `user` вместо `tg_id_from_init_data`; `import json` внутри `try` — при отсутствии поля `user` `except json.JSONDecodeError` ссылается на ещё не импортированное имя. | Использовать `app.auth.tg_id_from_init_data`, удалить дубли и неиспользуемые импорты. |
| 13 | Средний | Качество кода | `app/routers/users.py` (`me_reserved`) | Маршрут `/api/users/me` объявлен дважды (в `miniapp.py` и заглушкой в `users.py`); корректность зависит от порядка `include_router`. | Удалить заглушку, перенести `/me` в `users.py` или отдельный префикс. |
| 14 | Средний | Качество кода | `app/routers/payroll.py`, `users.py`, `clients.py`, `reports.py` | Бизнес-логика (проверка блокировки аванса, аудит полей, расчёты отчётов) прямо в роутерах, хотя для work_entries и payroll уже есть слой `services/`. | Вынести логику в `app/services/` (advances, users, reports); роутеры — только HTTP. |
| 15 | Средний | Качество кода | `app/main.py`, `app/create_tables.py`, `migrations/` (только `.gitkeep`) | Схема создаётся `create_all`, миграций нет; изменения схемы на проде (например, `access_requests`) накатываются вручную. Также `@app.on_event("startup")` устарел. | Подключить Alembic, снять baseline с текущей схемы; заменить `on_event` на `lifespan`. |
| 16 | Средний | Качество кода | `app/models.py`, `app/bot/router.py` стр. 235, 246 | `datetime.utcnow()` (устарело, naive) и `server_default=func.now()` — смешение часовых поясов; `date.today()` в `tasks.py`/`aggregates.py` зависит от TZ сервера. | Хранить UTC aware (`datetime.now(timezone.utc)`), «сегодня» считать в `Europe/Madrid`/настраиваемой TZ хозяйства. |
| 17 | Средний | Качество кода | `app/models.py` (`hours: Mapped[float]`, `rate_snapshot: Mapped[float]` при `Numeric`) | Аннотации `float` при колонках `Numeric` → фактически приходит `Decimal`; в `miniapp.py` итог приводится к `float` (потеря точности денег). | Аннотировать `Mapped[Decimal]`, в API отдавать строки/Decimal для денег. |
| 18 | Низкий | Качество кода | весь `app/` | ruff: 128 замечаний (92 × B008 — норма для FastAPI, 18 × I001, 8 × F401, 5 × FURB157, 2 × DTZ003, 2 × RUF100). | Добавить `pyproject.toml` с конфигом ruff (игнор B008), выполнить `ruff check --fix`, `ruff format`. |
| 19 | Низкий | Качество кода | корень репозитория: `_browser_e2e.js`, `_ui_sweep.js`, `_light_theme_shots.js`, `_offline_test.js`, `_seed_browser_test.py`, `index.html`, `files/ui/*.png`, `_pw_tmp/`, `_manager_crash_test.js` | Разовые скрипты, скриншоты и старый `index.html` в корне засоряют репозиторий; `_pw_tmp/` и `_manager_crash_test.js` не отслеживаются и не игнорируются. | Перенести в `tools/` и `docs/screenshots/`, удалить устаревшее, дописать `.gitignore`. |
| 20 | Низкий | Качество кода | `webapp/app.js` (3180 строк, один файл) | Монолитный IIFE; HTML собирается строками через `innerHTML` — экранирование (`escapeHtml`) применяется вручную и легко забыть. | Разбить на ES-модули (api, i18n, screens/*), для шаблонов — хелпер с автоматическим экранированием. |
| 21 | Высокий | Зависимости | `requirements.txt` | Версии не закреплены (`fastapi`, `sqlalchemy` …): новая установка на сервере подтянет непроверенные мажорные версии (например, SQLAlchemy 2.1, starlette 1.10). | Закрепить версии (`pip-compile` → `requirements.lock` или `==` в `requirements.txt`), обновлять осознанно. |
| 22 | Средний | Зависимости | `venv/` (окружение сервера и разработки) | `pip-audit` окружения: 26 известных уязвимостей в 5 пакетах — `aiohttp 3.14.3` (8 CVE, исправлено в 3.14.4), `certifi 2026.7.22`, `multidict 6.7.1`, `pip 24.0`, `setuptools 79.0.1`. | `pip install -U pip setuptools certifi`; удалить неиспользуемые `aiogram`/`aiohttp`/`aiofiles` (в коде не импортируются) — это снимает и `multidict`/`aiohttp`. Пересобрать venv на сервере с нуля из lock-файла. |
| 23 | Средний | Зависимости | `requirements.txt`, `requirements-dev.txt` (нет) | Инструменты разработки (pytest, ruff, pip-audit, playwright) нигде не описаны; `fastapi.testclient` предупреждает о переходе на `httpx2`. | Завести `requirements-dev.txt`; отслеживать предупреждение starlette и обновить клиент тестов при обновлении FastAPI. |
| 24 | Низкий | Зависимости | `venv/` | `pip list --outdated`: 23 пакета отстают (fastapi 0.141 → 0.162, starlette 1.6 → 1.10, uvicorn 0.52 → 0.54, pydantic 2.13 → 2.14). | Ежемесячное плановое обновление с прогоном тестов; Dependabot для GitHub. |
| 25 | Средний | Производительность | `app/routers/reports.py` (`report_user`, `report_location`, `report_client`) | N+1: для каждой записи ленивая загрузка `e.task`, `e.location`, `e.user`; суммы считаются в Python по всем записям. При годовой истории — сотни/тысячи запросов на один отчёт. | `options(selectinload(WorkEntry.task), selectinload(WorkEntry.location), selectinload(WorkEntry.user))`, итоги — `func.sum(...).group_by(...)` в SQL. |
| 26 | Средний | Производительность | `app/routers/miniapp.py` (`/api/users/me`) | На каждый запуск Mini App выгружаются **все** записи пользователя за всё время, чтобы посчитать два итога в Python. | Один агрегатный запрос `SELECT sum(hours), sum(hours*rate_snapshot)`; или вообще убрать итоги из `/me` (есть `/me/money`). |
| 27 | Средний | Производительность | `app/models.py` (`WorkEntry`, `Advance`, `Payout`, `AuditLog`) | Индексы только одиночные; типичные запросы фильтруют по `(user_id, work_date)`, `(task_id, work_date)`, `(entity, entity_id)`; нет уникальности «одна запись на человека/задание/день» на уровне БД (проверка только в коде — гонка при двойном нажатии/офлайн-синке). | Составные индексы `ix_we_user_date`, `ix_we_task_date`, `ix_audit_entity`; `UniqueConstraint(user_id, task_id, work_date)` (через миграцию после проверки дублей). |
| 28 | Средний | Производительность | `app/bot/telegram.py`, `app/bot/notifications.py`, `app/bot/router.py` (`_answer_callback`) | Отправка уведомлений — синхронный `httpx.post` с таймаутом 10 с внутри HTTP-запроса: при медленном Telegram изменение задания на 10 человек может ждать до 100 с; webhook может получить повтор от Telegram. | Отправлять через `BackgroundTasks` FastAPI (или очередь), переиспользовать один `httpx.Client`. |
| 29 | Низкий | Производительность | `app/db.py` | SQLite без WAL и `busy_timeout`: при одновременной записи (групповой ввод + офлайн-синк) возможны `database is locked`. | На `connect` выполнять `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON`. |
| 30 | Низкий | Производительность | `app/main.py` (статика `/app/static`), `webapp/app.js` | Кэширование статики по ручному `?v=12`, без сжатия; `app.js` ~3200 строк отдаётся целиком. | Хэш в имени файла при сборке или автоматическая версия из git; gzip/zstd на Caddy (`encode zstd gzip`), долгий `Cache-Control` для версионированных файлов. |

## 3. Безопасность (подробно)

**Модель угроз.** Сервер доступен из интернета (`timecontrol.duckdns.org`). Данные: ФИО, телефоны, почасовые ставки, начисления и выплаты сотрудников — персональные и финансовые данные (GDPR, т.к. хозяйство в ЕС).

**Сильные стороны:**
- Проверка подписи initData реализована правильно: HMAC-SHA256 с ключом `HMAC("WebAppData", token)`, `hmac.compare_digest`, проверка срока (`app/auth.py`).
- Webhook бота проверяет `X-Telegram-Bot-Api-Secret-Token`.
- Записи часов не удаляются, правки идут через `AuditLog`; закрытые периоды защищены от изменения авансов.
- `bandit -r app`: проблем не найдено; SQL строится через ORM — инъекций нет.
- Во фронтенде используется `escapeHtml` при сборке HTML.
- `.env` и `*.db` в `.gitignore`, в git-истории файлов БД нет.

**Слабые стороны (по убыванию риска):**
1. Авторизация «по желанию клиента» — пункты 1–3. Это не теоретический риск: проба `tools/audit_probe_authz.py` (раздел 6.6) без каких-либо заголовков создала пользователя с `is_manager=true`, изменила и деактивировала его, создала клиента и получила список выплат.
2. Webhook-секрет по умолчанию — п. 4.
3. Открытая OpenAPI-схема — п. 5.
4. Отсутствие аудита изменений пользователей — п. 6.
5. HTML-инъекция в сообщения бота — п. 7.

**Почему fallback стал дырой.** Fallback был введён как временная мера, чтобы не сломать `_e2e_check.py` при переходе на initData. Реальный клиент (Mini App) уже всегда шлёт initData (`webapp/app.js` стр. 876), значит fallback нужен только тестам — и тесты надо перевести на подписанный initData, а не держать открытую дверь в проде.

## 4. Качество кода (подробно)

- **Структура:** `routers/` → `services/` → `models/` — правильное направление, но доведено до конца только для work_entries и payroll (п. 14).
- **Дублирование:** проверка initData и разбор пользователя — в `auth.py` и `miniapp.py` (п. 12); `_open_period_start` и `_money_for` в `aggregates.py` повторяют логику `services/payroll.preview_period`.
- **Тесты:** покрытие функционально хорошее (39 e2e-сценариев, 17 сценариев бота), но они не являются pytest-тестами, не изолированы и не запускаются автоматически (п. 11). `check.bat` ищет слово `FAIL` в тексте — хрупко.
- **Схема БД:** без миграций (п. 15); типы денег (п. 17); время (п. 16).
- **Линтер:** 128 замечаний ruff, из них по существу — ~20 (неиспользуемые импорты, устаревший `utcnow`); 92 × B008 — ложные срабатывания для стиля FastAPI `Depends(...)`.
- **Фронтенд:** один файл на 3180 строк (п. 20), `node --check` проходит.

## 5. Зависимости (подробно)

- `requirements.txt` содержит 5 пакетов **без версий** (п. 21).
- `pip-audit -r requirements.txt` — **уязвимостей нет** (разрешаются последние версии).
- `pip-audit` по установленному окружению — **26 уязвимостей в 5 пакетах** (п. 22). Самое важное — `aiohttp` (8 CVE), но он тянется только `aiogram`, который в коде **не используется** (`grep aiogram app/` — пусто): правильное исправление — удалить, а не обновлять.
- 23 устаревших пакета (п. 24).
- Фронтенд не использует npm-зависимостей (чистый JS + `telegram-web-app.js`), поэтому `npm audit` неприменим; Playwright для скриптов скриншотов ставится вне репозитория.

## 6. Результаты выполненных проверок

Все команды выполнены 06.11.2026 в `D:\TimeControl` интерпретатором `venv\Scripts\python.exe` (Python 3.11.15). Полные выводы сохранялись в локальную папку `_audit_out/` (в git не добавлена).

### 6.1. pytest

```
> venv\Scripts\python.exe -m pytest -q
(pytest до аудита не был установлен в venv: "No module named pytest" — установлен для проверки)
1 warning in 0.65s
Код завершения: 5  (no tests collected — в tests/ только __init__.py)
```

### 6.2. Сквозная проверка проекта `_e2e_check.py` (на временной БД `DB_PATH=_audit_e2e.db`)

```
> venv\Scripts\python.exe _e2e_check.py
PASS 5a. групповой ввод: создано 3 записи
...
PASS 10g. не-руководитель получает 403 на dashboard/matrix/summary  | 403/403/403
ИТОГ: 39/39 пройдено
Код завершения: 0
```

### 6.3. Линтер ruff 0.17.4

```
> venv\Scripts\python.exe -m ruff check app --statistics
92  B008     function-call-in-default-argument
18  I001     [*] unsorted-imports
 8  F401     [*] unused-import
 5  FURB157  [*] verbose-decimal-constructor
 2  DTZ003   call-datetime-utcnow
 2  RUF100   [*] unused-noqa
 1  PIE790   [*] unnecessary-placeholder
Found 128 errors. [*] 34 fixable with `--fix`.
Код завершения: 1
```
Примеры: `app\routers\miniapp.py:8:8: F401 hashlib imported but unused`; `app\bot\router.py:235:26: DTZ003 datetime.datetime.utcnow() used`; `app\routers\reports.py:14:35: F401 app.models.TaskAssignment imported but unused`.

### 6.4. Статический анализ безопасности bandit 1.9.4

```
> venv\Scripts\python.exe -m bandit -r app
Test results:  No issues identified.
Total lines of code: 2904
Код завершения: 0
```

### 6.5. Аудит зависимостей pip-audit 2.10.1

```
> venv\Scripts\python.exe -m pip_audit -r requirements.txt
No known vulnerabilities found
Код завершения: 0

> venv\Scripts\python.exe -m pip_audit
Found 26 known vulnerabilities in 5 packages
Name       Version   ID                  Fix Versions
aiohttp    3.14.3    CVE-2026-111064     3.14.4   (+7 других CVE/GHSA aiohttp)
certifi    2026.7.22 PYSEC-2026-4320     2026.10.18
multidict  6.7.1     PYSEC-2026-4244     6.9.1
pip        24.0      PYSEC-2026-1795     25.3     (+ PYSEC-2026-1796/2875/2876/196/3721)
setuptools 79.0.1    PYSEC-2026-3447     83.0.0   (+ GHSA-xmj3-9gf7-h52w → 84.1.0)
Код завершения: 1
```

### 6.6. Проба авторизации `tools/audit_probe_authz.py` (временная БД, запросы без initData)

Скрипт в репозитории — повторить можно после исправлений.

```
> venv\Scripts\python.exe tools\audit_probe_authz.py
200  POST /api/users без авторизации (создать руководителя)  | {"id":1,...,"is_manager":true,...}
200  GET /api/users без авторизации
200  PATCH /api/users/1 без авторизации (ставка)
200  POST /api/clients без авторизации
200  GET /api/payroll/payouts без авторизации
200  GET /api/payroll/preview без авторизации
200  GET /work-entries с поддельным X-Actor-Id: 1
200  GET /api/dashboard/today с поддельным X-Actor-Id: 1
200  DELETE /api/users/1 без авторизации
200  GET /docs (Swagger открыт)
Код завершения: 0
```
Ожидаемый результат после исправления пунктов 1–3 и 5: 401/403/404 во всех строках.

### 6.7. Прочее

```
> node --check webapp\app.js          → код завершения 0 (синтаксических ошибок нет)
> venv\Scripts\python.exe -m pip list --outdated → 23 устаревших пакета, код завершения 0
```

## 7. План внедрения

| Этап | Срок | Пункты | Критерий готовности |
|---|---|---|---|
| 1. Закрыть доступ | 1–3 дня | 1, 2, 3, 4, 5, 6, 21 | Проба 6.6 возвращает 401/403 во всех строках; e2e переведён на подписанный initData и проходит 39/39. |
| 2. Тесты и CI | 1 неделя | 11, 18, 22, 23 | `pytest` собирает ≥ 56 тестов (39 e2e + 17 бота) и зелёный; GitHub Actions: ruff + pytest + pip-audit. |
| 3. Надёжность данных | 2 недели | 7, 8, 10, 15, 16, 17, 27, 29 | Alembic baseline; бэкап БД ежедневно; уникальный индекс записей часов. |
| 4. Производительность и чистота | по ходу работ | 9, 12–14, 19, 20, 24–26, 28, 30 | Отчёт по сотруднику — ≤ 5 SQL-запросов; уведомления не блокируют API. |

**Риск бездействия:** при текущем состоянии любой человек, узнавший адрес сервера (он есть в настройках бота и в ссылках Mini App), может за минуту назначить себя руководителем и закрыть период выплат. Стоимость исправления этапа 1 — 1–3 дня разработки; стоимость инцидента — пересчёт зарплат вручную и возможное уведомление о нарушении персональных данных.
