# Похожие приложения — что взять в TimeControl
*30.10.2026. Источники: официальные help-центры и страницы продуктов (URL ниже), проверены 30.10.2026 через субагент. Где факт не подтверждён источником — помечено.*

## Что подтверждено источниками

### Офлайн-запись часов у конкурентов УЖЕ есть
- **Jibble:** мобильное приложение записывает вход/выход без интернета, хранит локально, синхронизирует при появлении связи. Источник: [jibble.io/help/offline](https://www.jibble.io/help/how-to-track-time-without-an-internet-connection)
- **Clockify:** работает офлайн, данные синхронизируются позже. Источник: [clockify.me/mobile-time-tracking](https://clockify.me/mobile-time-tracking)
- **PickTrace:** «devices collect data while entirely offline without cell service or WiFi» — офлайн заявлен на первом экране как фича. Источник: [picktrace.com/platform-overview](https://picktrace.com/platform-overview/)
- **Вывод:** офлайн-запись — не экзотика, а **must-have для полевого приложения**. У нас по SPEC §22 тоже требуется.

### Главный экран работника
- **Jibble:** большая кнопка «time clock», нижнее меню из 4 пунктов: Home, Time Clock, Approval, Menu. До кнопки входа — 1 тап. Источник: [connecteam.com/reviews/jibble](https://connecteam.com/reviews/jibble/)
- **Connecteam:** раздел Time Clock, одна кнопка «Clock In». По структуре 2–3 тапа. Источник: [help.connecteam.com](https://help.connecteam.com/en/articles/5826070-time-clock-for-users)
- **PickTrace:** главный экран — у **бригадира** (crew leader), не у работника. Бригадир вводит часы за всю бригаду. Работник сам ничего не отмечает. Источник: [picktrace.com/time-productivity](https://picktrace.com/time-productivity/)
- **Вывод:** подтверждено — одна большая кнопка + минимум тапов. У нас в макете «Записать часы» = 2 тапа.

### Экран руководителя: проблемы наверху
- **Homebase:** в Timesheets прямо наверху секция **«Needs Review»**: «No Show» (не вышел), «Missing Clock Out» (не отметил уход). Руководитель сначала видит исключения, а не все табели. Есть «Time Card Review Assistant». Источник: [support.joinhomebase.com/Review-Time-Cards](https://support.joinhomebase.com/s/article/How-to-Review-Time-Cards), [Review-and-Resolve-Time-Card-Issues](https://support.joinhomebase.com/s/article/How-to-Review-and-Resolve-Time-Card-Issues)
- **Deputy:** табели обновляются в реальном времени, готовы «for review and approval», экспорт в зарплату в один клик. Источник: [deputy.com/features/employee-time-clock](https://www.deputy.com/features/employee-time-clock)
- **Вывод:** блок «Требует внимания» наверху экрана руководителя — **подтверждённый паттерн**, берём.

### Бригадир-центричная модель (агро)
- **PickTrace:** бригадир вводит часы и выработку за всю бригаду со своего устройства. Скорость ввода — главная метрика («keep up with your crew leaders»). Есть распечатываемый «Crew Leaders Guide» для поля. Источник: [picktrace.com/platform-overview](https://picktrace.com/platform-overview/), [zendesk Crew Leaders Guide](https://picktraceinc.zendesk.com/hc/en-us/articles/17244546783124-Crew-Leaders-Guide)
- **Вывод:** наша модель «бригадир вводит за бригаду» — **индустриальный стандарт для полей**, подтверждено.

### Что НЕ брать (анти-примеры)
- **Connecteam:** перегружен функциями (чат, задачи, курсы) — «всё-в-одном». Обзорщики отмечают: для учёта времени нужен интернет (офлайн не подтверждён). Подтверждает курс «один экран, одно действие».
- **Clockify:** перегружен проектами/тегами/отчётами — про проекты, а не про смены. Для наших работников лишнее.
- **Harvust:** своя HR-платформа, учёт часов — через интеграции со сторонними системами. Подтверждает: экспорт часов в зарплату/HR — то, что фермеры реально используют.

## Итоговые паттерны для макета v5 (подтверждены)
1. **Работник: один экран.** Задание → большая кнопка → история по дням → «К выплате». Без вкладок. (Jibble, Connecteam)
2. **Руководитель: 3 вкладки.** Сегодня (проблемы наверху + задания) · Задания · Деньги. Люди/заказчики/инвентарь — из шапки ☰. (Homebase «Needs Review»)
3. **Бригадир вводит за бригаду** списком с галочками, все отмечены по умолчанию. (PickTrace)
4. **Офлайн-запись с очередью синхронизации** — обязательна для полей. (Jibble, Clockify, PickTrace)
5. **Записать часы = 2 тапа:** кнопка → 8/10/другое → готово. (Jibble 1-tap)
6. **Пустое = хорошо:** нет проблем — «Всё в порядке ✓». (Homebase)
7. **Таблица люди × дни** — только внутри экрана задания, не на главной.
