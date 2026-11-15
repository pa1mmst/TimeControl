/* ============================================================
 * Time Control — Telegram Mini App
 * File: webapp/app.js  (v=6)
 *
 * Экраны по ролям, bottom sheet'ы, ввод часов из задания.
 * Все тексты — только через словари I18N (ru/uk/es).
 * API base относительный ("/api"); роутер work_entries смонтирован
 * без префикса /api, пути /work-entries чинятся в api.request.
 * ============================================================ */

(function () {
    'use strict';

    /* ========================================================
     * 1. Telegram WebApp bridge
     * ======================================================== */
    const tg = window.Telegram ? window.Telegram.WebApp : null;

    /* ========================================================
     * 2. Configuration
     * ======================================================== */
    const CONFIG = {
        apiBase: (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api',
        defaultLang: 'ru',
        // username бота для кнопки «Открыть бота» (без @); можно переопределить
        // через window.APP_CONFIG.botUsername, вписав в index.html перед app.js
        botUsername: (window.APP_CONFIG && window.APP_CONFIG.botUsername) || 'agrofirmbot'
    };

    /* ========================================================
     * 3. Application state
     * ======================================================== */
    const state = {
        lang: CONFIG.defaultLang,
        user: null,
        view: 'loading',
        tasks: null,        // активные задания (TaskShortOut)
        entries: null,      // мои записи часов
        clients: null,
        users: null,
        inventory: null,
        reportsTab: 'summary',
        detailTask: null,   // задание в открытом листе
        sheetTaskId: null,
        heCtx: null,        // контекст экрана ввода часов
        histRange: null,    // [from, to] для экрана История
        matrixTaskId: null, // задание открытой матрицы
        summaryUserId: null, // сотрудник открытой карточки
        teamTab: 'people',  // активный сегмент экрана «Сотрудники»
        navStack: []        // стек экранов для Telegram BackButton
    };

    /* ========================================================
     * 4. i18n — ru / uk / es
     * ======================================================== */
    const I18N = {
        ru: {
            'app.name': 'AgroManager',
            'navDashboard': 'Главная', 'navTasks': 'Задания',
            'navReports': 'Отчёты', 'navTeam': 'Люди',
            'navInventory': 'Инвентарь', 'navMore': 'Ещё',
            'navMe': 'Я', 'navClients': 'Заказчики',
            'loading': 'Загрузка...',
            'loginTitle': 'Вход',
            'loginStep1': 'Откройте @{bot}',
            'loginStep2': 'Нажмите «Отправить номер»',
            'loginStep3': 'Дождитесь одобрения руководителя',
            'loginSubtitle': 'Проверка данных пользователя...',
            'network.error': 'Ошибка сети. Проверьте подключение.',
            'headerOrg': 'AgroManager',
            'headerMetaRole': '{role} · {date}',
            'role.manager': 'Руководитель', 'role.worker': 'Работник',
            'role.reporter': 'Работник', 'role.unknown': 'Пользователь',
            'back': '← Назад', 'save': 'Сохранить', 'create': 'Создать',
            'saving': 'Сохранение...', 'saved': 'Сохранено',
            'close': 'Закрыть', 'cancel': 'Отмена', 'add': 'Добавить',
            'empty': 'Пока пусто',
            'error': 'Ошибка',
            // --- главная ---
            'dashActiveTasks': 'Активные задания',
            'dashWeek': 'Неделя', 'dashMonth': 'Месяц',
            'dashTasks': 'заданий', 'dashHours': 'ч',
            'dashNewTask': 'Новое задание',
            'dashClients': 'Заказчики', 'dashInventory': 'Инвентарь',
            'dashTeam': 'Люди',
            'dashMyHours': 'Мои часы сегодня: {n} ч',
            'dashEmpty': 'Пока нет заданий. Нажмите «Новое задание», чтобы создать',
            'dashEmptyWorker': 'Пока нет заданий. Ждите, когда руководитель вас назначит',
            'dashToday': 'Сегодня',
            'dashEarned': 'Заработано',
            'dashMyTasksToday': 'Мои задания сегодня',
            'dashNoTasksToday': 'На сегодня заданий нет',
            'dashHoursToday': 'Часы сегодня',
            // --- задания ---
            'tasksTitle': 'Задания', 'tasksNew': 'Новое задание',
            'status.draft': 'черновик', 'status.active': 'активно',
            'status.done': 'завершено', 'status.cancelled': 'отменено',
            'taskClient': 'Заказчик', 'taskLocations': 'Локации',
            'taskWorkers': 'Люди', 'taskDates': 'Даты',
            'taskDescr': 'Описание',
            'whoWorks': 'Кто работает',
            'totalHours': 'Часы всего', 'totalEarned': 'Заработано всего',
            'enterHours': 'Записать часы',
            'finishTask': 'Завершить задание',
            'editTask': 'Редактировать',
            'notEnteredToday': 'Сегодня часов нет',
            'enteredToday': 'Сегодня: {n} ч',
            'finishConfirm': 'Задание выполнено? После завершения часы можно только править, с причиной',
            'finish': 'Завершить',
            'taskFinished': 'Задание завершено',
            // --- новое задание ---
            'newTaskTitle': 'Новое задание',
            'taskTitle': 'Название',
            'taskDateStart': 'Дата',
            'taskDateEnd': 'По дату',
            'taskMultiDay': 'Несколько дней',
            'noLocations': 'У этого заказчика нет локаций',
            'noWorkers': 'Нет активных работников',
            'taskNeedsTitle': 'Введите название',
            'taskNeedsClient': 'Выберите заказчика',
            'taskCreated': 'Задание создано',
            // --- ввод часов ---
            'hoursEntryTitle': 'Часы за работу',
            'hoursSameAll': 'Всем одинаково',
            'hoursSameHint': 'Поставить одну цифру на всю бригаду',
            'hoursReason': 'Почему меняете часы?',
            'hoursReasonHint': 'Например: ошибся при вводе, работали до обеда',
            'hoursHintEmpty': 'Введите часы хотя бы одному человеку',
            'hoursHintReason': 'Укажите причину изменения',
            'hoursSaved': 'Часы сохранены',
            'alreadyEntered': 'уже внесено {n} ч',
            'today': 'Сегодня',
            'hoursUnit': 'ч',
            'todayFixByManager': 'Ошиблись? Исправить может руководитель.',
            'fixNoReason': 'Укажите причину исправления',
            'errorTitle': 'Не удалось загрузить',
            'retry': 'Повторить',
            'hoursBad': 'Часы должны быть от 0.25 до 24',
            // --- отчёты ---
            'reportsTitle': 'Отчёты',
            'tabSummary': 'Сводка', 'tabPayouts': 'Выплаты', 'tabReports': 'Отчёты',
            'teamTabPeople': 'Люди', 'teamTabInventory': 'Инвентарь',
            'repPeriod': 'Период',
            'repTasksTotal': 'Заданий всего', 'repTasksActive': 'Активных',
            'repTasksDone': 'Завершённых', 'repHoursTotal': 'Часов всего',
            'repPayroll': 'Заработано за период',
            'repByWorker': 'По людям', 'repByClient': 'По заказчикам',
            'repMyHours': 'Мои часы: {n} ч',
            'repMyEarned': 'Заработано', 'repMyHoursLabel': 'Часы',
            'repMyTasks': 'Мои задания за период',
            'repEmpty': 'За период нет данных',
            // --- выплаты ---
            'payPreview': 'Проверить расчёт', 'payClose': 'Закрыть расчёт',
            'payAdvance': 'Аванс',
            'payrollClosed': 'Период закрыт, выплаты созданы',
            'payrollEmpty': 'Нет данных за период',
            'colEmployee': 'Человек', 'colHours': 'Часы',
            'colGross': 'Заработано', 'colAdvances': 'Аванс', 'colNet': 'К выплате',
            'payStart': 'Начало', 'payEnd': 'Конец',
            'payCloseConfirm': 'Закрыть расчёт {start} — {end}? После закрытия часы этого периода править нельзя',
            // --- команда ---
            'teamTitle': 'Люди', 'teamAdd': 'Добавить человека',
            'workerName': 'Имя', 'workerPhone': 'Телефон',
            'workerRate': 'Ставка/час',
            'profile.rate': 'Ставка', 'profile.role': 'Роль',
            'profile.active': 'Активен', 'profile.inactive': 'Не активен',
            'profile.lang': 'Язык',
            'profileTitle': 'Профиль',
            'profileInventory': 'Занятый инвентарь',
            'profileNoInventory': 'Закреплённого инвентаря нет',
            'rateSaved': 'Ставка обновлена',
            'userSaved': 'Сохранено',
            // --- заказчики ---
            'clientsTitle': 'Заказчики', 'clientsAdd': 'Добавить заказчика',
            'clientName': 'Название', 'clientNotes': 'Заметки',
            'addLocation': 'Добавить локацию',
            'locationName': 'Название локации',
            'locationDelete': 'Удалить',
            'locationAdded': 'Локация добавлена',
            'locationDeleted': 'Локация удалена',
            'clientSaved': 'Сохранено',
            // --- инвентарь ---
            'inventoryTitle': 'Инвентарь', 'inventoryAdd': 'Добавить предмет',
            'itemName': 'Предмет', 'itemNotes': 'Заметки',
            'assign': 'Выдать', 'onStock': 'на складе',
            'holder': 'У кого сейчас',
            'pickHolder': 'Кому выдать?',
            'returnStock': 'Вернуть на склад',
            'itemSaved': 'Сохранено',
            'inventoryEmpty': 'Пока нет предметов. Нажмите «Добавить», чтобы создать',
            // --- v4: сегодня / история / деньги / дашборд / матрица / карточка ---
            'navToday': 'Сегодня', 'navHistory': 'История', 'navMoney': 'Деньги',
            'todayTitle': 'Сегодня',
            'todayNoTasks': 'На сегодня заданий нет',
            'todayMyHours': 'Мои часы сегодня: {n} ч',
            'todayEnterHours': 'Записать часы',
            'todayEntered': 'Записано: {n} ч',
            'todayNotEntered': 'Часы ещё не записаны',
            // --- v5: работник, один экран ---
            'menu': 'Меню',
            'payCardTitle': 'К выплате за {m}',
            'payCardEarnedAdv': 'заработано {e} · аванс {a}',
            'todayHistoryTitle': 'История',
            'todayCoworkers': 'С вами: {names}',
            'payRowEarned': 'Заработано', 'payRowAdvances': 'Авансы', 'payRowToPay': 'К выплате',
            'payNegativeNote': 'Аванс больше заработка на {sum}',
            'allHistory': 'Вся история',
            'myMoney': 'Мои деньги',
            'myInventory': 'Мой инвентарь',
            'language': 'Язык',
            'hoursSheetTitle': 'Сколько часов сегодня?',
            'hoursSheetFixTitle': 'Исправить часы',
            'hoursMore': '…',
            'hoursCustom': 'Своя цифра',
            'recorded': 'Записано',
            'offlineSaved': 'Сохранено офлайн — отправим при появлении сети',
            'offlineQueued': '{n} записей ждут отправки',
            'fixNotAllowed': 'Изменять часы может только руководитель',
            'histTitle': 'История',
            'histWeek': 'Неделя', 'histMonth': 'Месяц', 'histCustom': 'Свой',
            'histApply': 'Применить',
            'histEmpty': 'Записей за период нет',
            'histCorrected': 'Исправлено',
            'moneyTitle': 'Деньги',
            'moneyPeriodMonth': 'Этот месяц',
            'moneyPeriodPrev': 'Прошлый месяц',
            'moneyPeriodSince': 'С последнего закрытия',
            'moneyColPerson': 'Человек',
            'moneyColHours': 'Часы',
            'moneyColEarned': 'Заработано',
            'moneyColAdv': 'Авансы',
            'moneyColNet': 'К выплате',
            'moneyTotalRow': 'Итого',
            'moneyEmptyPeriod': 'За этот период нет часов и авансов',
            'moneyGiveAdvance': 'Выдать аванс',
            'moneyCloseBtn': 'Закрыть расчёт',
            'advWho': 'Кому',
            'advAmountLabel': 'Сумма, €',
            'advDateLabel': 'Дата',
            'advAmountError': 'Введите сумму больше нуля',
            'advSaved': 'Аванс выдан',
            'moneyCloseEmpty': 'Нечего закрывать: за период нет часов и авансов',
            'moneyCloseConfirm': 'Закрыть расчёт за {period}: {n} чел., {sum}? После закрытия суммы за этот период изменить нельзя.',
            'moneyClosed': 'Расчёт закрыт',
            'reportsTitle': 'Отчёты',
            'moneyPeriod': 'Период с {d}',
            'moneyHours': 'Часы', 'moneyEarned': 'Заработано',
            'moneyAdvances': 'Аванс', 'moneyToPay': 'К выплате',
            'moneyRate': 'Ставка/час',
            'moneyLastPayout': 'Последняя выплата',
            'moneyNoPayout': 'Выплат ещё не было',
            'moneyInventory': 'Инвентарь на руках',
            'moneyNoInventory': 'Инвентаря на руках нет',
            'payout.accrued': 'рассчитано', 'payout.pending': 'ожидает', 'payout.paid': 'выплачено',
            'dashTitle': 'Сегодня',
            'dashSummary': 'Назначено {a} · Отметились {b} · Часов {h}',
            'notCheckedIn': 'Не отметились',
            'enterFor': 'Записать за него',
            'enterForTitle': 'Часы за сегодня: {name}',
            'allCheckedIn': 'Все отметились',
            'tasksNewPlus': '+ Новое задание',
            'tasksNone': 'Заданий нет.',
            'tasksCreate': 'Создать задание',
            'dashWorkers': 'Людей на работе', 'dashNoHoursTasks': 'Заданий без часов',
            'dashNoHoursWarn': 'Задания без часов сегодня: {n}',
            'dashNoHours': 'нет часов',
            'dashOpenMatrix': 'Таблица часов',
            'dashOpenWorker': 'Карточка работника',
            // --- v5: руководитель ---
            'segActive': 'Активные', 'segDone': 'Завершённые',
            'attTitle': 'Требует внимания',
            'attOk': 'Всё в порядке ✓',
            'attNoHoursUser': 'Не отметился: {name}',
            'attNoHoursTask': 'Задание без записей: {title}',
            'dashOnWork': 'На работе',
            'dashHours': 'Часов',
            'dashWithoutHours': 'Не отметился',
            'dashActiveTasks': 'Активные задания',
            'fabNewTask': '+ Задание',
            'menuPeople': 'Люди',
            'menuClients': 'Заказчики и локации',
            'moneyTotalToPay': 'К выплате всего',
            'moneyEarnedAdv': 'заработано {e} · авансы {a}',
            'moneyWorkers': 'Люди',
            'moneyOpenReports': 'Отчёты',
            'moneyAddAdvance': '+ Аванс',
            'moneyClosePeriod': 'Закрыть расчёт',
            'webapp_not_registered': 'Вы ещё не в системе. Откройте бота и отправьте свой номер — после одобрения руководителем появится доступ.',
            'webapp_deactivated': 'Доступ отключён. Обратитесь к руководителю.',
            'open_bot_btn': 'Открыть бота',
            'matrixTitle': 'Часы по дням',
            'matrixEmpty': 'Нет данных',
            'sumTitle': 'Карточка работника',
            'sumPeriod': 'За период с {d}',
            'sumLastEntries': 'Последние записи',
            'sumNoEntries': 'Записей нет'
        },
        uk: {
            'app.name': 'AgroManager',
            'navDashboard': 'Головна', 'navTasks': 'Завдання',
            'navReports': 'Звіти', 'navTeam': 'Люди',
            'navInventory': 'Інвентар', 'navMore': 'Більше',
            'navMe': 'Я', 'navClients': 'Замовники',
            'loading': 'Завантаження...',
            'loginTitle': 'Вхід',
            'loginStep1': 'Відкрийте @{bot}',
            'loginStep2': 'Натисніть «Надіслати номер»',
            'loginStep3': 'Дочекайтеся схвалення керівника',
            'loginSubtitle': 'Перевірка даних користувача...',
            'network.error': 'Помилка мережі. Перевірте з\'єднання.',
            'headerOrg': 'AgroManager',
            'headerMetaRole': '{role} · {date}',
            'role.manager': 'Керівник', 'role.worker': 'Працівник',
            'role.reporter': 'Працівник', 'role.unknown': 'Користувач',
            'back': '← Назад', 'save': 'Зберегти', 'create': 'Створити',
            'saving': 'Збереження...', 'saved': 'Збережено',
            'close': 'Закрити', 'cancel': 'Скасувати', 'add': 'Додати',
            'empty': 'Поки порожньо',
            'error': 'Помилка',
            'dashActiveTasks': 'Активні завдання',
            'dashWeek': 'Тиждень', 'dashMonth': 'Місяць',
            'dashTasks': 'завдань', 'dashHours': 'год',
            'dashNewTask': 'Нове завдання',
            'dashClients': 'Замовники', 'dashInventory': 'Інвентар',
            'dashTeam': 'Люди',
            'dashMyHours': 'Мої години сьогодні: {n} год',
            'dashEmpty': 'Поки немає завдань. Натисніть «Нове завдання», щоб створити',
            'dashEmptyWorker': 'Поки немає завдань. Чекайте, коли керівник вас призначить',
            'dashToday': 'Сьогодні',
            'dashEarned': 'Зароблено',
            'dashMyTasksToday': 'Мої завдання сьогодні',
            'dashNoTasksToday': 'На сьогодні завдань немає',
            'dashHoursToday': 'Години сьогодні',
            'tasksTitle': 'Завдання', 'tasksNew': 'Нове завдання',
            'status.draft': 'чернетка', 'status.active': 'активне',
            'status.done': 'завершено', 'status.cancelled': 'скасовано',
            'taskClient': 'Замовник', 'taskLocations': 'Локації',
            'taskWorkers': 'Люди', 'taskDates': 'Дати',
            'taskDescr': 'Опис',
            'whoWorks': 'Хто працює',
            'totalHours': 'Годин разом', 'totalEarned': 'Зароблено разом',
            'enterHours': 'Записати години',
            'finishTask': 'Завершити завдання',
            'editTask': 'Редагувати',
            'notEnteredToday': 'Сьогодні годин немає',
            'enteredToday': 'Сьогодні: {n} год',
            'finishConfirm': 'Завдання виконано? Після завершення години можна лише виправляти, з причиною',
            'finish': 'Завершити',
            'taskFinished': 'Завдання завершено',
            'newTaskTitle': 'Нове завдання',
            'taskTitle': 'Назва',
            'taskDateStart': 'Дата',
            'taskDateEnd': 'По дату',
            'taskMultiDay': 'Кілька днів',
            'noLocations': 'У цього замовника немає локацій',
            'noWorkers': 'Немає активних працівників',
            'taskNeedsTitle': 'Введіть назву',
            'taskNeedsClient': 'Оберіть замовника',
            'taskCreated': 'Завдання створено',
            'hoursEntryTitle': 'Години за роботу',
            'hoursSameAll': 'Усім однаково',
            'hoursSameHint': 'Поставити одну цифру на всю бригаду',
            'hoursReason': 'Чому змінюєте години?',
            'hoursReasonHint': 'Наприклад: помилився при введенні, працювали до обіду',
            'hoursHintEmpty': 'Введіть години хоча б одній людині',
            'hoursHintReason': 'Вкажіть причину зміни',
            'hoursSaved': 'Години збережено',
            'alreadyEntered': 'вже внесено {n} год',
            'today': 'Сьогодні',
            'hoursUnit': 'год',
            'todayFixByManager': 'Помилились? Виправити може керівник.',
            'fixNoReason': 'Вкажіть причину виправлення',
            'errorTitle': 'Не вдалося завантажити',
            'retry': 'Повторити',
            'hoursBad': 'Години мають бути від 0.25 до 24',
            'reportsTitle': 'Звіти',
            'tabSummary': 'Зведення', 'tabPayouts': 'Виплати', 'tabReports': 'Звіти',
            'teamTabPeople': 'Люди', 'teamTabInventory': 'Інвентар',
            'repPeriod': 'Період',
            'repTasksTotal': 'Завдань всього', 'repTasksActive': 'Активних',
            'repTasksDone': 'Завершених', 'repHoursTotal': 'Годин всього',
            'repPayroll': 'Зароблено за період',
            'repByWorker': 'За людьми', 'repByClient': 'За замовниками',
            'repMyHours': 'Мої години: {n} год',
            'repMyEarned': 'Зароблено', 'repMyHoursLabel': 'Години',
            'repMyTasks': 'Мої завдання за період',
            'repEmpty': 'За період немає даних',
            'payPreview': 'Перевірити розрахунок', 'payClose': 'Закрити розрахунок',
            'payAdvance': 'Аванс',
            'payrollClosed': 'Період закрито, виплати створено',
            'payrollEmpty': 'Немає даних за період',
            'colEmployee': 'Людина', 'colHours': 'Години',
            'colGross': 'Зароблено', 'colAdvances': 'Аванс', 'colNet': 'До виплати',
            'payStart': 'Початок', 'payEnd': 'Кінець',
            'payCloseConfirm': 'Закрити розрахунок {start} — {end}? Після закриття години цього періоду виправляти не можна',
            'teamTitle': 'Люди', 'teamAdd': 'Додати людину',
            'workerName': 'Ім\'я', 'workerPhone': 'Телефон',
            'workerRate': 'Ставка/год',
            'profile.rate': 'Ставка', 'profile.role': 'Роль',
            'profile.active': 'Активний', 'profile.inactive': 'Не активний',
            'profile.lang': 'Мова',
            'profileTitle': 'Профіль',
            'profileInventory': 'Зайнятий інвентар',
            'profileNoInventory': 'Закріпленого інвентарю немає',
            'rateSaved': 'Ставку оновлено',
            'userSaved': 'Збережено',
            'clientsTitle': 'Замовники', 'clientsAdd': 'Додати замовника',
            'clientName': 'Назва', 'clientNotes': 'Нотатки',
            'addLocation': 'Додати локацію',
            'locationName': 'Назва локації',
            'locationDelete': 'Видалити',
            'locationAdded': 'Локацію додано',
            'locationDeleted': 'Локацію видалено',
            'clientSaved': 'Збережено',
            'inventoryTitle': 'Інвентар', 'inventoryAdd': 'Додати предмет',
            'itemName': 'Предмет', 'itemNotes': 'Нотатки',
            'assign': 'Видати', 'onStock': 'на складі',
            'holder': 'У кого зараз',
            'pickHolder': 'Кому видати?',
            'returnStock': 'Повернути на склад',
            'itemSaved': 'Збережено',
            'inventoryEmpty': 'Поки немає предметів. Натисніть «Додати», щоб створити',
            'navToday': 'Сьогодні', 'navHistory': 'Історія', 'navMoney': 'Гроші',
            'todayTitle': 'Сьогодні',
            'todayNoTasks': 'На сьогодні завдань немає',
            'todayMyHours': 'Мої години сьогодні: {n} год',
            'todayEnterHours': 'Записати години',
            'todayEntered': 'Записано: {n} год',
            'todayNotEntered': 'Години ще не записані',
            // --- v5: працівник, один екран ---
            'menu': 'Меню',
            'payCardTitle': 'До виплати за {m}',
            'payCardEarnedAdv': 'зароблено {e} · аванс {a}',
            'todayHistoryTitle': 'Історія',
            'todayCoworkers': 'З вами: {names}',
            'payRowEarned': 'Зароблено', 'payRowAdvances': 'Аванси', 'payRowToPay': 'До виплати',
            'payNegativeNote': 'Аванс більший за заробіток на {sum}',
            'allHistory': 'Вся історія',
            'myMoney': 'Мої гроші',
            'myInventory': 'Мій інвентар',
            'language': 'Мова',
            'hoursSheetTitle': 'Скільки годин сьогодні?',
            'hoursSheetFixTitle': 'Виправити години',
            'hoursMore': '…',
            'hoursCustom': 'Своя цифра',
            'recorded': 'Записано',
            'offlineSaved': 'Збережено офлайн — надішлемо, коли з’явиться мережа',
            'offlineQueued': '{n} записів чекають відправки',
            'fixNotAllowed': 'Змінювати години може тільки керівник',
            'histTitle': 'Історія',
            'histWeek': 'Тиждень', 'histMonth': 'Місяць', 'histCustom': 'Свій',
            'histApply': 'Застосувати',
            'histEmpty': 'Записів за період немає',
            'histCorrected': 'Виправлено',
            'moneyTitle': 'Гроші',
            'moneyPeriodMonth': 'Цей місяць',
            'moneyPeriodPrev': 'Минулий місяць',
            'moneyPeriodSince': 'Від останнього закриття',
            'moneyColPerson': 'Людина',
            'moneyColHours': 'Години',
            'moneyColEarned': 'Зароблено',
            'moneyColAdv': 'Аванси',
            'moneyColNet': 'До виплати',
            'moneyTotalRow': 'Разом',
            'moneyEmptyPeriod': 'За цей період немає годин і авансів',
            'moneyGiveAdvance': 'Видати аванс',
            'moneyCloseBtn': 'Закрити розрахунок',
            'advWho': 'Кому',
            'advAmountLabel': 'Сума, €',
            'advDateLabel': 'Дата',
            'advAmountError': 'Введіть суму більше нуля',
            'advSaved': 'Аванс видано',
            'moneyCloseEmpty': 'Нічого закривати: за період немає годин і авансів',
            'moneyCloseConfirm': 'Закрити розрахунок за {period}: {n} осіб, {sum}? Після закриття суми за цей період змінити не можна.',
            'moneyClosed': 'Розрахунок закрито',
            'reportsTitle': 'Звіти',
            'moneyPeriod': 'Період з {d}',
            'moneyHours': 'Години', 'moneyEarned': 'Зароблено',
            'moneyAdvances': 'Аванс', 'moneyToPay': 'До виплати',
            'moneyRate': 'Ставка/год',
            'moneyLastPayout': 'Остання виплата',
            'moneyNoPayout': 'Виплат ще не було',
            'moneyInventory': 'Інвентар на руках',
            'moneyNoInventory': 'Інвентарю на руках немає',
            'payout.accrued': 'розраховано', 'payout.pending': 'очікує', 'payout.paid': 'виплачено',
            'dashTitle': 'Сьогодні',
            'dashSummary': 'Призначено {a} · Відмітились {b} · Годин {h}',
            'notCheckedIn': 'Не відмітились',
            'enterFor': 'Записати за нього',
            'enterForTitle': 'Години за сьогодні: {name}',
            'allCheckedIn': 'Всі відмітились',
            'tasksNewPlus': '+ Нове завдання',
            'tasksNone': 'Завдань немає.',
            'tasksCreate': 'Створити завдання',
            'dashWorkers': 'Людей на роботі', 'dashNoHoursTasks': 'Завдань без годин',
            'dashNoHoursWarn': 'Завдання без годин сьогодні: {n}',
            'dashNoHours': 'немає годин',
            'dashOpenMatrix': 'Таблиця годин',
            'dashOpenWorker': 'Картка працівника',
            // --- v5: керівник ---
            'segActive': 'Активні', 'segDone': 'Завершені',
            'attTitle': 'Потребує уваги',
            'attOk': 'Все в порядку ✓',
            'attNoHoursUser': 'Не відмітився: {name}',
            'attNoHoursTask': 'Завдання без записів: {title}',
            'dashOnWork': 'На роботі',
            'dashHours': 'Годин',
            'dashWithoutHours': 'Не відмітився',
            'dashActiveTasks': 'Активні завдання',
            'fabNewTask': '+ Завдання',
            'menuPeople': 'Люди',
            'menuClients': 'Замовники та локації',
            'moneyTotalToPay': 'До виплати разом',
            'moneyEarnedAdv': 'зароблено {e} · аванси {a}',
            'moneyWorkers': 'Люди',
            'moneyOpenReports': 'Звіти',
            'moneyAddAdvance': '+ Аванс',
            'moneyClosePeriod': 'Закрити розрахунок',
            'webapp_not_registered': 'Вас ще немає в системі. Відкрийте бота та надішліть свій номер — після схвалення керівником з\'явиться доступ.',
            'webapp_deactivated': 'Доступ вимкнено. Зверніться до керівника.',
            'open_bot_btn': 'Відкрити бота',
            'matrixTitle': 'Години по днях',
            'matrixEmpty': 'Немає даних',
            'sumTitle': 'Картка працівника',
            'sumPeriod': 'За період з {d}',
            'sumLastEntries': 'Останні записи',
            'sumNoEntries': 'Записів немає'
        },
        es: {
            'app.name': 'AgroManager',
            'navDashboard': 'Inicio', 'navTasks': 'Tareas',
            'navReports': 'Informes', 'navTeam': 'Personas',
            'navInventory': 'Inventario', 'navMore': 'Más',
            'navMe': 'Yo', 'navClients': 'Clientes',
            'loading': 'Cargando...',
            'loginTitle': 'Entrar',
            'loginStep1': 'Abra @{bot}',
            'loginStep2': 'Pulse «Enviar número»',
            'loginStep3': 'Espere la aprobación del responsable',
            'loginSubtitle': 'Comprobando datos del usuario...',
            'network.error': 'Error de red. Compruebe la conexión.',
            'headerOrg': 'AgroManager',
            'headerMetaRole': '{role} · {date}',
            'role.manager': 'Gerente', 'role.worker': 'Trabajador',
            'role.reporter': 'Trabajador', 'role.unknown': 'Usuario',
            'back': '← Atrás', 'save': 'Guardar', 'create': 'Crear',
            'saving': 'Guardando...', 'saved': 'Guardado',
            'close': 'Cerrar', 'cancel': 'Cancelar', 'add': 'Añadir',
            'empty': 'Aún vacío',
            'error': 'Error',
            'dashActiveTasks': 'Tareas activas',
            'dashWeek': 'Semana', 'dashMonth': 'Mes',
            'dashTasks': 'tareas', 'dashHours': 'h',
            'dashNewTask': 'Nueva tarea',
            'dashClients': 'Clientes', 'dashInventory': 'Inventario',
            'dashTeam': 'Personas',
            'dashMyHours': 'Mis horas hoy: {n} h',
            'dashEmpty': 'Aún no hay tareas. Pulse «Nueva tarea» para crear una',
            'dashEmptyWorker': 'Aún no hay tareas. Espere a que el gerente le asigne',
            'dashToday': 'Hoy',
            'dashEarned': 'Ganado',
            'dashMyTasksToday': 'Mis tareas de hoy',
            'dashNoTasksToday': 'No hay tareas para hoy',
            'dashHoursToday': 'Horas hoy',
            'tasksTitle': 'Tareas', 'tasksNew': 'Nueva tarea',
            'status.draft': 'borrador', 'status.active': 'activa',
            'status.done': 'terminada', 'status.cancelled': 'cancelada',
            'taskClient': 'Cliente', 'taskLocations': 'Ubicaciones',
            'taskWorkers': 'Personas', 'taskDates': 'Fechas',
            'taskDescr': 'Descripción',
            'whoWorks': 'Quién trabaja',
            'totalHours': 'Horas totales', 'totalEarned': 'Total ganado',
            'enterHours': 'Registrar horas',
            'finishTask': 'Terminar tarea',
            'editTask': 'Editar',
            'notEnteredToday': 'Hoy no hay horas',
            'enteredToday': 'Hoy: {n} h',
            'finishConfirm': '¿Tarea terminada? Después solo se pueden corregir las horas, con motivo',
            'finish': 'Terminar',
            'taskFinished': 'Tarea terminada',
            'newTaskTitle': 'Nueva tarea',
            'taskTitle': 'Título',
            'taskDateStart': 'Fecha',
            'taskDateEnd': 'Hasta',
            'taskMultiDay': 'Varios días',
            'noLocations': 'Este cliente no tiene ubicaciones',
            'noWorkers': 'No hay trabajadores activos',
            'taskNeedsTitle': 'Introduzca el título',
            'taskNeedsClient': 'Elija un cliente',
            'taskCreated': 'Tarea creada',
            'hoursEntryTitle': 'Horas de trabajo',
            'hoursSameAll': 'Igual para todos',
            'hoursSameHint': 'Poner una cifra para todo el equipo',
            'hoursReason': '¿Por qué cambia las horas?',
            'hoursReasonHint': 'Por ejemplo: me equivoqué al registrar, trabajamos hasta el mediodía',
            'hoursHintEmpty': 'Introduzca horas para al menos una persona',
            'hoursHintReason': 'Indique el motivo del cambio',
            'hoursSaved': 'Horas guardadas',
            'alreadyEntered': 'ya registrado {n} h',
            'today': 'Hoy',
            'hoursUnit': 'h',
            'todayFixByManager': '¿Error? Lo puede corregir el responsable.',
            'fixNoReason': 'Indique el motivo de la corrección',
            'errorTitle': 'No se pudo cargar',
            'retry': 'Reintentar',
            'hoursBad': 'Las horas deben ser de 0.25 a 24',
            'reportsTitle': 'Informes',
            'tabSummary': 'Resumen', 'tabPayouts': 'Pagos', 'tabReports': 'Informes',
            'teamTabPeople': 'Personas', 'teamTabInventory': 'Inventario',
            'repPeriod': 'Período',
            'repTasksTotal': 'Tareas totales', 'repTasksActive': 'Activas',
            'repTasksDone': 'Terminadas', 'repHoursTotal': 'Horas totales',
            'repPayroll': 'Ganado en el período',
            'repByWorker': 'Por personas', 'repByClient': 'Por clientes',
            'repMyHours': 'Mis horas: {n} h',
            'repMyEarned': 'Ganado', 'repMyHoursLabel': 'Horas',
            'repMyTasks': 'Mis tareas del período',
            'repEmpty': 'Sin datos para el período',
            'payPreview': 'Revisar cálculo', 'payClose': 'Cerrar liquidación',
            'payAdvance': 'Adelanto',
            'payrollClosed': 'Período cerrado, pagos creados',
            'payrollEmpty': 'Sin datos para el período',
            'colEmployee': 'Persona', 'colHours': 'Horas',
            'colGross': 'Ganado', 'colAdvances': 'Adelantos', 'colNet': 'A pagar',
            'payStart': 'Inicio', 'payEnd': 'Fin',
            'payCloseConfirm': '¿Cerrar la liquidación {start} — {end}? Después no se podrán corregir las horas de este período',
            'teamTitle': 'Personas', 'teamAdd': 'Añadir persona',
            'workerName': 'Nombre', 'workerPhone': 'Teléfono',
            'workerRate': 'Tarifa/hora',
            'profile.rate': 'Tarifa', 'profile.role': 'Rol',
            'profile.active': 'Activo', 'profile.inactive': 'Inactivo',
            'profile.lang': 'Idioma',
            'profileTitle': 'Perfil',
            'profileInventory': 'Inventario asignado',
            'profileNoInventory': 'Sin inventario asignado',
            'rateSaved': 'Tarifa actualizada',
            'userSaved': 'Guardado',
            'clientsTitle': 'Clientes', 'clientsAdd': 'Añadir cliente',
            'clientName': 'Nombre', 'clientNotes': 'Notas',
            'addLocation': 'Añadir ubicación',
            'locationName': 'Nombre de la ubicación',
            'locationDelete': 'Eliminar',
            'locationAdded': 'Ubicación añadida',
            'locationDeleted': 'Ubicación eliminada',
            'clientSaved': 'Guardado',
            'inventoryTitle': 'Inventario', 'inventoryAdd': 'Añadir artículo',
            'itemName': 'Artículo', 'itemNotes': 'Notas',
            'assign': 'Entregar', 'onStock': 'en almacén',
            'holder': 'Quién lo tiene',
            'pickHolder': '¿A quién entregar?',
            'returnStock': 'Devolver al almacén',
            'itemSaved': 'Guardado',
            'inventoryEmpty': 'Aún no hay artículos. Pulse «Añadir» para crear uno',
            'navToday': 'Hoy', 'navHistory': 'Historial', 'navMoney': 'Dinero',
            'todayTitle': 'Hoy',
            'todayNoTasks': 'No hay tareas para hoy',
            'todayMyHours': 'Mis horas hoy: {n} h',
            'todayEnterHours': 'Registrar horas',
            'todayEntered': 'Registrado: {n} h',
            'todayNotEntered': 'Horas aún no registradas',
            // --- v5: trabajador, una pantalla ---
            'menu': 'Menú',
            'payCardTitle': 'A pagar por {m}',
            'payCardEarnedAdv': 'ganado {e} · adelanto {a}',
            'todayHistoryTitle': 'Historial',
            'todayCoworkers': 'Con usted: {names}',
            'payRowEarned': 'Ganado', 'payRowAdvances': 'Adelantos', 'payRowToPay': 'A pagar',
            'payNegativeNote': 'El adelanto supera lo ganado en {sum}',
            'allHistory': 'Todo el historial',
            'myMoney': 'Mi dinero',
            'myInventory': 'Mi inventario',
            'language': 'Idioma',
            'hoursSheetTitle': '¿Cuántas horas hoy?',
            'hoursSheetFixTitle': 'Corregir horas',
            'hoursMore': '…',
            'hoursCustom': 'Cifra propia',
            'recorded': 'Registrado',
            'offlineSaved': 'Guardado sin conexión — se enviará cuando haya red',
            'offlineQueued': '{n} registros esperando envío',
            'fixNotAllowed': 'Solo el jefe puede cambiar las horas',
            'histTitle': 'Historial',
            'histWeek': 'Semana', 'histMonth': 'Mes', 'histCustom': 'Propio',
            'histApply': 'Aplicar',
            'histEmpty': 'Sin registros en el período',
            'histCorrected': 'Corregido',
            'moneyTitle': 'Dinero',
            'moneyPeriodMonth': 'Este mes',
            'moneyPeriodPrev': 'Mes anterior',
            'moneyPeriodSince': 'Desde el último cierre',
            'moneyColPerson': 'Persona',
            'moneyColHours': 'Horas',
            'moneyColEarned': 'Ganado',
            'moneyColAdv': 'Adelantos',
            'moneyColNet': 'A pagar',
            'moneyTotalRow': 'Total',
            'moneyEmptyPeriod': 'No hay horas ni adelantos en este período',
            'moneyGiveAdvance': 'Dar adelanto',
            'moneyCloseBtn': 'Cerrar liquidación',
            'advWho': 'Para quién',
            'advAmountLabel': 'Importe, €',
            'advDateLabel': 'Fecha',
            'advAmountError': 'Introduce un importe mayor que cero',
            'advSaved': 'Adelanto entregado',
            'moneyCloseConfirm': '¿Cerrar la liquidación de {period}: {n} pers., {sum}? Tras el cierre no se podrán cambiar los importes de este período.',
            'moneyCloseEmpty': 'Nada que cerrar: no hay horas ni adelantos en el período',
            'moneyClosed': 'Liquidación cerrada',
            'reportsTitle': 'Informes',
            'moneyPeriod': 'Período desde {d}',
            'moneyHours': 'Horas', 'moneyEarned': 'Ganado',
            'moneyAdvances': 'Adelanto', 'moneyToPay': 'A pagar',
            'moneyRate': 'Tarifa/hora',
            'moneyLastPayout': 'Último pago',
            'moneyNoPayout': 'Aún no hay pagos',
            'moneyInventory': 'Inventario en mano',
            'moneyNoInventory': 'Sin inventario en mano',
            'payout.accrued': 'calculado', 'payout.pending': 'pendiente', 'payout.paid': 'pagado',
            'dashTitle': 'Hoy',
            'dashSummary': 'Asignados {a} · Registrados {b} · Horas {h}',
            'notCheckedIn': 'Sin registrar',
            'enterFor': 'Registrar por él',
            'enterForTitle': 'Horas de hoy: {name}',
            'allCheckedIn': 'Todos han registrado',
            'tasksNewPlus': '+ Nueva tarea',
            'tasksNone': 'No hay tareas.',
            'tasksCreate': 'Crear tarea',
            'dashWorkers': 'Personas en trabajo', 'dashNoHoursTasks': 'Tareas sin horas',
            'dashNoHoursWarn': 'Tareas sin horas hoy: {n}',
            'dashNoHours': 'sin horas',
            'dashOpenMatrix': 'Tabla de horas',
            'dashOpenWorker': 'Ficha del trabajador',
            // --- v5: gerente ---
            'segActive': 'Activas', 'segDone': 'Terminadas',
            'attTitle': 'Requiere atención',
            'attOk': 'Todo en orden ✓',
            'attNoHoursUser': 'No ha fichado: {name}',
            'attNoHoursTask': 'Tarea sin registros: {title}',
            'dashOnWork': 'En trabajo',
            'dashHours': 'Horas',
            'dashWithoutHours': 'No ha fichado',
            'dashActiveTasks': 'Tareas activas',
            'fabNewTask': '+ Tarea',
            'menuPeople': 'Personas',
            'menuClients': 'Clientes y ubicaciones',
            'moneyTotalToPay': 'A pagar en total',
            'moneyEarnedAdv': 'ganado {e} · adelantos {a}',
            'moneyWorkers': 'Personas',
            'moneyOpenReports': 'Informes',
            'moneyAddAdvance': '+ Adelanto',
            'moneyClosePeriod': 'Cerrar liquidación',
            'webapp_not_registered': 'Aún no está en el sistema. Abra el bot y envíe su número — cuando el responsable lo apruebe, tendrá acceso.',
            'webapp_deactivated': 'Acceso desactivado. Contacte al responsable.',
            'open_bot_btn': 'Abrir el bot',
            'matrixTitle': 'Horas por día',
            'matrixEmpty': 'Sin datos',
            'sumTitle': 'Ficha del trabajador',
            'sumPeriod': 'Por el período desde {d}',
            'sumLastEntries': 'Últimos registros',
            'sumNoEntries': 'Sin registros'
        }
    };

    function t(key, vars) {
        const dict = I18N[state.lang] || I18N[CONFIG.defaultLang];
        let s = (dict && dict[key] !== undefined) ? dict[key]
            : (I18N.ru[key] !== undefined ? I18N.ru[key] : key);
        if (vars) {
            Object.keys(vars).forEach((k) => {
                s = s.replace('{' + k + '}', vars[k]);
            });
        }
        return s;
    }

    function normalizeLang(lang) {
        if (!lang) return CONFIG.defaultLang;
        const l = String(lang).toLowerCase();
        if (l.indexOf('uk') === 0) return 'uk';
        if (l.indexOf('es') === 0) return 'es';
        return 'ru';
    }

    /* ========================================================
     * 5. Utilities
     * ======================================================== */
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function $(sel) { return document.querySelector(sel); }

    function setList(id, html) {
        const el = $('#' + id);
        if (el) el.innerHTML = html;
    }

    function isManager() {
        return !!(state.user && state.user.is_manager);
    }

    function roleLabel(user) {
        if (!user) return t('role.unknown');
        return user.is_manager ? t('role.manager') : t('role.worker');
    }

    function statusLabel(status) { return t('status.' + status); }

    function num(v) {
        const n = parseFloat(v);
        return isNaN(n) ? 0 : n;
    }

    // Число часов без единицы, с точкой: для value полей ввода и для API.
    function fmtHours(v) {
        const n = num(v);
        return (n % 1 === 0) ? String(n) : n.toFixed(2).replace(/0$/, '');
    }

    function localeTag() {
        return state.lang === 'uk' ? 'uk-UA' : state.lang === 'es' ? 'es-ES' : 'ru-RU';
    }

    // Деньги для показа: «1 234,50 €» (разделители по языку интерфейса).
    function fmtMoney(v) {
        return num(v).toLocaleString(localeTag(), {
            minimumFractionDigits: 2, maximumFractionDigits: 2
        }) + ' €';
    }

    // Часы для показа: «8 ч», «7,5 ч».
    function fmtHoursUnit(v) {
        return num(v).toLocaleString(localeTag(), { maximumFractionDigits: 2 }) +
            ' ' + t('hoursUnit');
    }

    function todayIso() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function fmtDateHuman(iso) {
        if (!iso) return '';
        const loc = state.lang === 'uk' ? 'uk-UA'
            : state.lang === 'es' ? 'es-ES' : 'ru-RU';
        try {
            return new Date(iso + 'T00:00:00').toLocaleDateString(loc, {
                day: 'numeric', month: 'short'
            });
        } catch (e) { return iso; }
    }

    function fmtDateRange(a, b) {
        if (a && b && a !== b) return fmtDateHuman(a) + ' — ' + fmtDateHuman(b);
        if (a) return fmtDateHuman(a);
        return '';
    }

    function initials(name) {
        const parts = String(name || '?').trim().split(/\s+/);
        let s = parts[0].charAt(0) + (parts[1] ? parts[1].charAt(0) : '');
        return s.toUpperCase();
    }

    const AVATAR_COLORS = ['#4ADE80', '#60A5FA', '#FBBF24', '#F472B6', '#A78BFA', '#34D399', '#FB923C'];
    function avatarColor(id) {
        return AVATAR_COLORS[Math.abs(id || 0) % AVATAR_COLORS.length];
    }

    function avatarHtml(id, name) {
        return '<span class="avatar" style="background:' + avatarColor(id) + '">' +
            escapeHtml(initials(name)) + '</span>';
    }

    // Всплывающее сообщение (тост). Автоскрытие через 3.5с.
    let toastTimer = null;
    function toast(message, kind) {
        const root = $('#toastRoot');
        let el = document.getElementById('toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast';
            el.className = 'toast';
            root.appendChild(el);
        }
        el.textContent = message;
        el.className = 'toast' + (kind ? ' toast--' + kind : '');
        el.hidden = false;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
    }

    /* ========================================================
     * 5b. v5: офлайн-очередь самоввода часов (SPEC §22)
     * localStorage может быть недоступен (приватный режим) —
     * тогда очередь просто не работает, обычный путь.
     * ======================================================== */
    const QUEUE_KEY = 'tc_offline_queue';

    function queueLoad() {
        try {
            const arr = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }
    function queueSave(arr) {
        try { localStorage.setItem(QUEUE_KEY, JSON.stringify(arr)); } catch (e) { /* нет storage */ }
    }
    function queueAdd(payload) {
        const arr = queueLoad();
        arr.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            payload: payload,
            created_at: new Date().toISOString()
        });
        queueSave(arr);
    }
    function queueGet() { return queueLoad(); }
    function queueRemove(id) {
        queueSave(queueLoad().filter((it) => it.id !== id));
    }
    function queueCount() { return queueLoad().length; }

    /* сетевая ошибка? (fetch бросил / браузер офлайн) */
    function isNetError(err) {
        return !navigator.onLine || (err && err.message === t('network.error'));
    }

    /* прогон очереди: успех или отказ сервера (409 «уже есть») → убрать,
       сеть недоступна → оставить и прекратить прогон */
    async function syncQueue() {
        if (!queueCount()) { renderOfflineBanner(); return; }
        for (const it of queueGet()) {
            try {
                await api.createEntry(it.payload);
                queueRemove(it.id);
            } catch (err) {
                if (isNetError(err)) break;
                queueRemove(it.id);
            }
        }
        renderOfflineBanner();
        if (state.view === 'today' && !isManager()) {
            state.meToday = null;
            state.money = null;
            await loadToday();
        }
    }

    function renderOfflineBanner() {
        const box = $('#offlineBanner');
        if (!box) return;
        const n = queueCount();
        box.hidden = n === 0;
        if (n) box.textContent = '⏳ ' + t('offlineQueued', { n: n });
    }

    /* ========================================================
     * 6. Bottom sheets
     * ======================================================== */
    function openSheet(html, onClose) {
        const root = $('#sheetRoot');
        root.innerHTML =
            '<div class="sheet__backdrop"></div>' +
            '<div class="sheet" role="dialog">' +
            '<div class="sheet__handle"></div>' + html + '</div>';
        const backdrop = root.querySelector('.sheet__backdrop');
        backdrop.addEventListener('click', closeSheet);
        state._sheetClose = onClose || null;
        return root.querySelector('.sheet');
    }

    function closeSheet() {
        const root = $('#sheetRoot');
        root.innerHTML = '';
        const cb = state._sheetClose;
        state._sheetClose = null;
        if (cb) cb();
    }

    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && $('#sheetRoot').innerHTML) closeSheet();
    });

    /* ========================================================
     * 7. API client (initData — единственный способ авторизации)
     * ======================================================== */
    function entry_id(value) {
        const n = parseInt(value, 10);
        if (!n || n < 1) throw new Error('bad id');
        return n;
    }

    const api = {
        async request(path, options) {
            options = options || {};
            const base = CONFIG.apiBase.replace(/\/+$/, '');
            const url = (path.indexOf('/work-entries') === 0)
                ? base.replace(/\/api$/, '') + path
                : base + path;
            const headers = { 'Content-Type': 'application/json' };
            if (tg && tg.initData) headers['X-Telegram-Init-Data'] = tg.initData;
            if (options.headers) Object.assign(headers, options.headers);

            let response;
            try {
                response = await fetch(url, {
                    method: options.method || 'GET',
                    headers: headers,
                    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
                });
            } catch (err) {
                toast(t('network.error'), 'error');
                throw new Error(t('network.error'));
            }
            const text = await response.text();
            let data = null;
            if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
            if (!response.ok) {
                let detail = data && data.detail ? data.detail : 'HTTP ' + response.status;
                if (typeof detail !== 'string') detail = JSON.stringify(detail);
                const err = new Error(detail);
                // код ошибки от API (напр. 401 not_registered/deactivated)
                if (data && data.detail && typeof data.detail === 'object' && data.detail.code) {
                    err.code = data.detail.code;
                }
                err.status = response.status;
                throw err;
            }
            return data;
        },
        getMe() { return this.request('/users/me'); },
        setLang(lang) {
            return this.request('/me/lang', { method: 'PATCH', body: { lang: lang } });
        },
        getTasks() { return this.request('/tasks?status=active'); },
        getAllTasks() { return this.request('/tasks'); },
        getMyEntries() { return this.request('/work-entries'); },
        getEntries(params) {
            return this.request('/work-entries' + (params ? '?' + params : ''));
        },
        getUsers() { return this.request('/users'); },
        getClients() { return this.request('/clients'); },
        getInventory() { return this.request('/inventory'); },
        getPayouts() { return this.request('/payroll/payouts'); },
        createTask(body) { return this.request('/tasks', { method: 'POST', body: body }); },
        assignUser(taskId, userId) {
            return this.request('/tasks/' + entry_id(taskId) + '/assignments',
                { method: 'POST', body: { user_id: entry_id(userId) } });
        },
        createEntry(body) { return this.request('/work-entries', { method: 'POST', body: body }); },
        updateEntry(entryId, body) {
            return this.request('/work-entries/' + entry_id(entryId), { method: 'PATCH', body: body });
        },
        taskSummary(taskId) {
            return this.request('/work-entries/task/' + entry_id(taskId) + '/summary');
        },
        taskEntries(taskId) {
            return this.request('/work-entries?task_id=' + entry_id(taskId));
        },
        updateTask(taskId, body) {
            return this.request('/tasks/' + entry_id(taskId), { method: 'PATCH', body: body });
        },
        createUser(body) { return this.request('/users', { method: 'POST', body: body }); },
        updateUser(userId, body) {
            return this.request('/users/' + entry_id(userId), { method: 'PATCH', body: body });
        },
        createClient(body) { return this.request('/clients', { method: 'POST', body: body }); },
        updateClient(clientId, body) {
            return this.request('/clients/' + entry_id(clientId), { method: 'PATCH', body: body });
        },
        createLocation(clientId, body) {
            return this.request('/clients/' + entry_id(clientId) + '/locations',
                { method: 'POST', body: body });
        },
        deleteLocation(clientId, locationId) {
            return this.request('/clients/' + entry_id(clientId) +
                '/locations/' + entry_id(locationId), { method: 'DELETE' });
        },
        createItem(body) { return this.request('/inventory', { method: 'POST', body: body }); },
        updateItem(itemId, body) {
            return this.request('/inventory/' + entry_id(itemId), { method: 'PATCH', body: body });
        },
        payPreview(start, end) {
            return this.request('/payroll/preview?start=' + start + '&end=' + end);
        },
        payClose(body) { return this.request('/payroll/close', { method: 'POST', body: body }); },
        createAdvance(body) { return this.request('/payroll/advances', { method: 'POST', body: body }); },
        reportUser(userId, start, end) {
            return this.request('/reports/user/' + entry_id(userId) +
                '?start=' + start + '&end=' + end);
        },
        // --- v4: агрегатные эндпоинты ---
        meToday() { return this.request('/me/today'); },
        meHistory(from, to) {
            const p = [];
            if (from) p.push('date_from=' + from);
            if (to) p.push('date_to=' + to);
            return this.request('/me/history' + (p.length ? '?' + p.join('&') : ''));
        },
        meMoney() { return this.request('/me/money'); },
        dashboardToday() { return this.request('/dashboard/today'); },
        taskMatrix(taskId) {
            return this.request('/tasks/' + entry_id(taskId) + '/matrix');
        },
        userSummary(userId) {
            return this.request('/users/' + entry_id(userId) + '/summary');
        }
    };

    /* ========================================================
     * 8. Роутер: showScreen + renderNav по роли
     * ======================================================== */
    function renderNav() {
        const manager = isManager();
        // v5: работник — без вкладок (один экран, всё через ☰).
        // Руководитель: Сегодня / Задания / Деньги.
        const nav = $('#bottomNav');
        if (nav) nav.hidden = !manager;
        document.body.classList.toggle('no-nav', !manager);
        document.querySelectorAll('.bottom-nav__item').forEach((btn) => {
            btn.hidden = !manager; // все оставшиеся вкладки — только руководителю
        });
    }

    /* --- Навигация: стек экранов + Telegram BackButton --- */
    function isRootScreen(name) {
        return isManager()
            ? ['manager-dash', 'tasks', 'money'].indexOf(name) !== -1
            : name === 'today';
    }

    function navSync() {
        if (!tg || !tg.BackButton) return;
        if (state.navStack.length > 1) tg.BackButton.show();
        else tg.BackButton.hide();
    }

    function navTrack(name) {
        if (isRootScreen(name)) {
            state.navStack = [name];
            return;
        }
        const idx = state.navStack.indexOf(name);
        if (idx >= 0) state.navStack = state.navStack.slice(0, idx + 1);
        else state.navStack.push(name);
    }

    function navReset() {
        state.navStack = [];
        navSync();
    }

    function rerenderScreen(name) {
        switch (name) {
            case 'today': return loadToday();
            case 'manager-dash': return loadManagerDash();
            case 'tasks': return loadTasks();
            case 'money': return loadMoney();
            case 'history': return loadHistory(state.histPreset || 'week');
            case 'team': return loadTeam();
            case 'clients': return loadClients();
            case 'reports': return loadReports();
            case 'matrix': return openMatrix(state.matrixTaskId);
            case 'user-summary': return openUserSummary(state.summaryUserId);
            default: showScreen(name); return null;
        }
    }

    // Один «назад» для BackButton и экранных кнопок «← Назад»
    function navBack() {
        const stack = state.navStack;
        if (stack.length < 2) return goBackHome();
        const leaving = stack.pop();
        const tid = leaving === 'hours-entry' && state.heCtx ? state.heCtx.task.id : null;
        if (leaving === 'hours-entry') state.heCtx = null;
        const done = Promise.resolve(rerenderScreen(stack[stack.length - 1]));
        return tid ? done.then(() => openTaskSheet(tid)) : done;
    }

    function showScreen(name) {
        if (['loading', 'login', 'error'].indexOf(name) === -1) navTrack(name);
        else if (name !== 'loading') state.navStack = [];
        navSync();
        document.querySelectorAll('.screen').forEach((s) => {
            s.hidden = s.getAttribute('data-screen-name') !== name;
        });
        document.querySelectorAll('.bottom-nav__item').forEach((b) => {
            b.classList.toggle('is-active', b.getAttribute('data-nav-target') === name);
        });
        // v5: ☰ руководителя виден на его трёх вкладках
        const mgrMenu = isManager() &&
            ['manager-dash', 'tasks', 'money'].indexOf(name) !== -1;
        ['#btnManagerMenu', '#btnManagerMenu2', '#btnManagerMenu3', '#btnManagerMenu4'].forEach((sel) => {
            const btn = $(sel);
            if (btn) btn.hidden = !mgrMenu;
        });
        closeSheet();
        state.view = name;
        window.scrollTo(0, 0);
    }

    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
        });
        renderHeader();
    }

    function renderHeader() {
        const org = $('#headerOrg');
        if (org) org.textContent = t('headerOrg');
        const meta = $('#headerMeta');
        if (meta) {
            const loc = state.lang === 'uk' ? 'uk-UA'
                : state.lang === 'es' ? 'es-ES' : 'ru-RU';
            const dateStr = new Date().toLocaleDateString(loc, {
                day: 'numeric', month: 'long'
            });
            meta.textContent = dateStr;
        }
        renderLoginSteps();
    }

    function renderLoginSteps() {
        const bot = (CONFIG.botUsername || 'agrofirmbot').replace('@', '');
        const texts = [t('loginStep1', { bot: bot }), t('loginStep2'), t('loginStep3')];
        texts.forEach((txt, i) => {
            const li = $('#loginStep' + (i + 1));
            if (li) li.textContent = txt;
        });
    }

    /* ========================================================
     * 9. ГЛАВНАЯ РУКОВОДИТЕЛЯ
     * ======================================================== */
    function weekRange() {
        const d = new Date();
        const day = (d.getDay() + 6) % 7; // Пн=0
        const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
        const sun = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 6);
        return [isoOf(mon), isoOf(sun)];
    }

    function monthRange() {
        const d = new Date();
        const first = new Date(d.getFullYear(), d.getMonth(), 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return [isoOf(first), isoOf(last)];
    }

    function isoOf(d) {
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function taskCardHtml(task, opts) {
        opts = opts || {};
        const today = todayIso();
        const hoursToday = num(task.hours_today);
        const parts = [];
        if (task.client_name) parts.push(escapeHtml(task.client_name));
        if (task.location_names && task.location_names.length) {
            parts.push(escapeHtml(task.location_names.join(', ')));
        }
        const sub = parts.join(' · ');
        const workers = (task.workers || []).map((w) =>
            escapeHtml(w.name)
        ).join(', ');
        const canEnter = opts.canEnter && task.status === 'active';
        const enteredLine = canEnter
            ? (hoursToday > 0
                ? '<div class="card-sub"><span>' + escapeHtml(t('enteredToday', { n: fmtHours(hoursToday) })) + '</span></div>'
                : '<div class="card-sub"><span class="muted">' + escapeHtml(t('notEnteredToday')) + '</span></div>')
            : '';
        const enterBtn = canEnter
            ? '<button class="btn btn--primary btn--block card__enter" data-action="enter-hours" data-id="' + task.id + '">' +
              escapeHtml(t('enterHours')) + '</button>'
            : '';
        return '<div class="card card--tap" data-task-id="' + task.id + '" role="button" tabindex="0">' +
            '<div class="card-title">' + escapeHtml(task.title) + '</div>' +
            (sub ? '<div class="card-sub"><span>' + sub + '</span></div>' : '') +
            (workers ? '<div class="card-sub"><span>' + workers + '</span></div>' : '') +
            '<div class="card-sub">' +
            (opts.hideStatus ? '' : '<span class="badge badge--' + escapeHtml(task.status) + '">' +
                escapeHtml(statusLabel(task.status)) + '</span>') +
            (hoursToday > 0
                ? '<span class="card-hours">' + escapeHtml(fmtHours(hoursToday)) + ' ' + escapeHtml(t('hoursUnit')) + '</span>'
                : '') +
            '</div>' +
            enteredLine + enterBtn +
            '</div>';
    }

    /* ========================================================
     * 9b. Возврат на «домашний» экран по роли
     * ======================================================== */
    function goBackHome() {
        if (isManager()) loadManagerDash();
        else loadToday();
    }

    function statCell(label, tasks, hours, isHours) {
        return '<div class="stat"><span class="stat__value">' +
            (isHours ? escapeHtml(fmtHours(hours)) + ' ' + escapeHtml(t('hoursUnit')) : tasks) +
            '</span><span class="stat__label">' + escapeHtml(label) + '</span></div>';
    }

    /* ========================================================
     * 10. Список заданий
     * ======================================================== */
    async function loadTasks() {
        showScreen('tasks');
        const btnNewTask = $('#btnNewTask');
        if (btnNewTask) btnNewTask.hidden = !isManager();
        // v5 §3.2: сегменты Активные | Завершённые
        if (!state.tasksSeg) state.tasksSeg = 'active';
        document.querySelectorAll('#tasksSegment .segment__btn').forEach((b) => {
            b.classList.toggle('is-active',
                b.getAttribute('data-tasks-seg') === state.tasksSeg);
        });
        try {
            state.tasks = await (state.tasksSeg === 'active'
                ? api.getTasks() : api.getAllTasks());
            renderTasks();
        } catch (err) {
            setList('tasksList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>');
        }
    }

    function renderTasks() {
        let tasks = state.tasks || [];
        // v5: фильтр по сегменту (getAllTasks отдаёт все статусы)
        if (state.tasksSeg === 'active') {
            tasks = tasks.filter((tk) => tk.status === 'active');
        } else {
            tasks = tasks.filter((tk) => tk.status === 'done');
        }
        tasks = sortTasksByTitle(tasks);
        const newBtn = isManager()
            ? '<button type="button" class="btn btn--primary btn--block tasks-new" data-action="new-task">' +
              escapeHtml(t('tasksNewPlus')) + '</button>'
            : '';
        if (!tasks.length) {
            setList('tasksList', '<div class="empty"><div class="empty__text">' +
                escapeHtml(t('tasksNone')) + '</div>' +
                (isManager()
                    ? '<button type="button" class="btn btn--primary" data-action="new-task">' +
                      escapeHtml(t('tasksCreate')) + '</button>'
                    : '') + '</div>');
            return;
        }
        setList('tasksList', newBtn + tasks.map((tk) =>
            taskCardHtml(tk, { canEnter: true, hideStatus: state.tasksSeg === 'active' })).join(''));
    }

    /* ========================================================
     * 11. Лист задания (bottom sheet)
     * ======================================================== */
    async function openTaskSheet(taskId) {
        const sheet = openSheet('<p class="screen-message">' + escapeHtml(t('loading')) + '</p>');
        try {
            const [task, summary] = await Promise.all([
                api.request('/tasks/' + entry_id(taskId)),
                api.taskSummary(taskId).catch(() => null)
            ]);
            state.detailTask = task;
            state.sheetTaskId = taskId;

            const manager = isManager();
            // v5: роли «бригадир/учётчик» в UI нет — ввод за других только у руководителя
            const canEnter = manager && task.status === 'active';

            const workers = (task.assignments || []).map((a) => {
                const su = summary && summary.by_user.find(
                    (u) => u.user_id === a.user.id);
                return '<div class="row-line">' + avatarHtml(a.user.id, a.user.name) +
                    '<span class="row-line__name">' + escapeHtml(a.user.name) +
                    '</span>' +
                    (su ? '<span class="row-line__meta">' + escapeHtml(fmtHoursUnit(su.total_hours)) + '</span>' : '') +
                    '</div>';
            }).join('');

            const totalHours = summary ? summary.total_hours : 0;
            const totalEarned = summary
                ? summary.by_user.reduce((s, u) => s + num(u.total_amount), 0) : 0;

            const parts = [];
            if (task.client) parts.push(escapeHtml(task.client.name));
            if (task.locations && task.locations.length) {
                parts.push(task.locations.map((l) => escapeHtml(l.name)).join(', '));
            }

            let html =
                '<div class="card-title sheet__title">' + escapeHtml(task.title) + '</div>' +
                '<div class="card-sub"><span class="badge badge--' + escapeHtml(task.status) + '">' +
                escapeHtml(statusLabel(task.status)) + '</span></div>' +
                (parts.length ? '<div class="card-sub"><span>' + parts.join(' · ') + '</span></div>' : '') +
                ((task.date_start || task.date_end)
                    ? '<div class="card-sub"><span>' + escapeHtml(t('taskDates')) + ': ' +
                      escapeHtml(fmtDateRange(task.date_start, task.date_end)) + '</span></div>' : '') +
                (task.description ? '<div class="card-sub"><span>' + escapeHtml(task.description) + '</span></div>' : '') +
                '<h3 class="sheet__h3">' + escapeHtml(t('whoWorks')) + '</h3>' +
                (workers || '<p class="screen-message">' + escapeHtml(t('empty')) + '</p>') +
                '<div class="sheet__totals">' +
                '<div class="row-line"><span>' + escapeHtml(t('totalHours')) + '</span>' +
                '<span class="row-line__meta">' + escapeHtml(fmtHoursUnit(totalHours)) + '</span></div>' +
                '<div class="row-line"><span>' + escapeHtml(t('totalEarned')) + '</span>' +
                '<span class="row-line__meta">' + escapeHtml(fmtMoney(totalEarned)) + '</span></div>' +
                '</div>' +
                '<div class="sheet__actions">' +
                (canEnter
                    ? '<button class="btn btn--primary btn--block he-save" data-action="enter-hours" data-id="' + task.id + '">' +
                      escapeHtml(t('enterHours')) + '</button>' +
                      (manager
                          ? '<button class="btn btn--ghost btn--block" data-action="finish-task" data-id="' + task.id + '">' +
                            escapeHtml(t('finishTask')) + '</button>'
                          : '')
                    : '') +
                (manager
                    ? '<button class="btn btn--ghost btn--block" data-action="edit-task" data-id="' + task.id + '">' +
                      escapeHtml(t('editTask')) + '</button>'
                    : '') +
                '<button class="btn btn--ghost btn--block" data-action="close-sheet">' + escapeHtml(t('close')) + '</button>' +
                '</div>';
            sheet.innerHTML = html;
        } catch (err) {
            sheet.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>' +
                '<button class="btn btn--ghost btn--block" data-action="close-sheet">' + escapeHtml(t('close')) + '</button>';
        }
    }

    async function finishTask(taskId) {
        const sheet = openSheet(
            '<div class="card-title sheet__title">' + escapeHtml(t('finishTask')) + '</div>' +
            '<p class="screen-message">' + escapeHtml(t('finishConfirm')) + '</p>' +
            '<div class="sheet__actions">' +
            '<button class="btn btn--primary btn--block" data-action="finish-task-yes" data-id="' + taskId + '">' +
            escapeHtml(t('finish')) + '</button>' +
            '<button class="btn btn--ghost btn--block" data-action="close-sheet">' + escapeHtml(t('cancel')) + '</button>' +
            '</div>');
        sheet.setAttribute('data-finish', taskId);
    }

    /* ========================================================
     * 12. ЭКРАН «ВВЕСТИ ЧАСЫ» (полноэкранный; v5 — только руководитель,
     *     у работника ввод в bottom sheet, см. 13b)
     * ======================================================== */
    async function openHoursEntry(taskId) {
        if (!isManager()) { openWorkerHoursSheet(taskId, false); return; }
        closeSheet();
        showScreen('hours-entry');
        $('#heError').hidden = true;
        $('#heReasonField').hidden = true;
        $('#heSame').checked = false;
        $('#heDate').value = todayIso();
        $('#heDateBtn').textContent = t('today') + ', ' + fmtDateHuman(todayIso());
        $('#heTaskTitle').textContent = '...';

        try {
            const [task, entries] = await Promise.all([
                api.request('/tasks/' + entry_id(taskId)),
                api.taskEntries(taskId)
            ]);
            state.heCtx = { task: task, entries: entries };
            $('#heTaskTitle').textContent = task.title;
            renderHoursEntry();
        } catch (err) {
            $('#heError').textContent = err.message;
            $('#heError').hidden = false;
        }
    }

    function renderHoursEntry() {
        const ctx = state.heCtx;
        if (!ctx) return;
        const same = $('#heSame').checked;
        const date = $('#heDate').value;
        const existing = {};
        (ctx.entries || []).forEach((e) => {
            if (e.work_date === date) existing[e.user_id] = num(e.hours);
        });
        ctx.existing = existing;

        const people = (ctx.task.assignments || []).map((a) => a.user);
        const box = $('#hePeople');
        if (!people.length) {
            box.innerHTML = '<p class="screen-message">' + escapeHtml(t('empty')) + '</p>';
            return;
        }
        const sameVal = $('#heSameVal') ? num($('#heSameVal').value) : 8;
        box.innerHTML = people.map((u) => {
            const has = existing[u.id] !== undefined;
            const badge = has
                ? '<span class="badge badge--wait">' + escapeHtml(t('alreadyEntered', { n: fmtHours(existing[u.id]) })) + '</span>'
                : '';
            const field = same
                ? '<span class="he-val he-val--grey">' + escapeHtml(fmtHours(sameVal)) + '</span>'
                : '<div class="he-input-wrap"><input class="he-input" inputmode="decimal" ' +
                  'data-user="' + u.id + '" data-was="' + (has ? existing[u.id] : '') + '" ' +
                  'value="" placeholder="—"><span class="he-unit">' + escapeHtml(t('hoursUnit')) + '</span></div>';
            return '<div class="row-line he-row">' + avatarHtml(u.id, u.name) +
                '<span class="row-line__name">' + escapeHtml(u.name) + badge + '</span>' + field +
                '</div>';
        }).join('');
        updateSaveState();
    }

    function heValues() {
        const same = $('#heSame').checked;
        if (same) {
            const v = $('#heSameVal') ? num($('#heSameVal').value) : 0;
            return { same: true, value: v };
        }
        const vals = {};
        document.querySelectorAll('#hePeople .he-input').forEach((inp) => {
            const raw = inp.value.trim().replace(',', '.');
            if (raw !== '') vals[parseInt(inp.getAttribute('data-user'), 10)] = parseFloat(raw);
        });
        return { same: false, values: vals };
    }

    function heHasChanges() {
        const ctx = state.heCtx;
        if (!ctx) return false;
        const v = heValues();
        if (v.same) return v.value > 0;
        return Object.keys(v.values).some((uid) => {
            const was = ctx.existing[uid];
            return was === undefined || num(was) !== v.values[uid];
        });
    }

    function heNeedsReason() {
        const ctx = state.heCtx;
        if (!ctx) return false;
        const v = heValues();
        if (v.same) return false; // групповой ввод — только новые записи
        return Object.keys(v.values).some((uid) => {
            const was = ctx.existing[uid];
            return was !== undefined && num(was) !== v.values[uid];
        });
    }

    function updateSaveState() {
        const save = $('#heSave');
        const hint = $('#heHint');
        const reasonField = $('#heReasonField');
        const needReason = heNeedsReason();
        reasonField.hidden = !needReason;
        const hasAny = heHasChanges();
        const reasonOk = !needReason || $('#heReason').value.trim().length > 0;
        save.disabled = !(hasAny && reasonOk);
        hint.textContent = save.disabled
            ? (hasAny ? t('hoursHintReason') : t('hoursHintEmpty'))
            : '';
    }

    async function submitHoursEntry() {
        const ctx = state.heCtx;
        if (!ctx) return;
        const errEl = $('#heError');
        errEl.hidden = true;
        const date = $('#heDate').value;
        const reason = $('#heReason').value.trim() || null;
        const v = heValues();
        const btn = $('#heSave');
        btn.disabled = true;

        try {
            if (v.same) {
                if (!(v.value > 0 && v.value <= 24)) throw new Error(t('hoursBad'));
                // Руководитель вносит одну цифру каждому назначенному.
                const people = (ctx.task.assignments || []).map((a) => a.user);
                for (const u of people) {
                    const was = ctx.existing[u.id];
                    if (was !== undefined && num(was) !== v.value) {
                        const mine = (ctx.entries || []).find(
                            (e) => e.user_id === u.id && e.work_date === date);
                        await api.updateEntry(mine.id, {
                            hours: v.value.toFixed(2), reason: reason
                        });
                    } else if (was === undefined) {
                        await api.createEntry({
                            task_id: ctx.task.id, work_date: date,
                            hours: v.value.toFixed(2), user_id: u.id
                        });
                    }
                }
            } else {
                for (const uid of Object.keys(v.values)) {
                    const hours = v.values[uid];
                    if (!(hours > 0 && hours <= 24)) throw new Error(t('hoursBad'));
                    const was = ctx.existing[uid];
                    if (was !== undefined) {
                        if (num(was) === hours) continue;
                        if (!reason) throw new Error(t('hoursHintReason'));
                        const mine = (ctx.entries || []).find(
                            (e) => e.user_id === Number(uid) && e.work_date === date);
                        await api.updateEntry(mine.id, {
                            hours: hours.toFixed(2), reason: reason
                        });
                    } else {
                        await api.createEntry({
                            task_id: ctx.task.id, work_date: date,
                            hours: hours.toFixed(2), user_id: Number(uid)
                        });
                    }
                }
            }
            toast(t('hoursSaved'), 'success');
            state.entries = null;
            state.tasks = null;
            // Возврат в лист задания, итоги обновятся сразу
            const tid = ctx.task.id;
            state.heCtx = null;
            if (state.view === 'hours-entry') goBackHome();
            else showScreen(state.view);
            await openTaskSheet(tid);
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
            btn.disabled = false;
            updateSaveState();
        }
    }

    /* ========================================================
     * 13b. v5: ввод часов работника — bottom sheet (§3.4)
     * ======================================================== */
    function openWorkerHoursSheet(taskId, fixMode) {
        const data = state.meToday;
        const task = data && (data.tasks || []).find((tk) => tk.id === taskId);
        if (!task) return;
        const existing = num(task.my_hours_today);
        const fix = !!fixMode && existing > 0;
        let picked = fix ? String(fmtHours(existing)) : '';

        const sheet = openSheet(
            '<h3 class="sheet__title">' +
            escapeHtml(fix ? t('hoursSheetFixTitle') : t('hoursSheetTitle')) + '</h3>' +
            '<div class="he-quick" id="whQuick">' +
            ['4', '6', '8', '10', '12'].map((v) =>
                '<button type="button" class="chip' + (picked === v ? ' chip--on' : '') +
                '" data-wh="' + v + '">' + v + '</button>').join('') +
            '<button type="button" class="chip" data-wh="more">' +
            escapeHtml(t('hoursMore')) + '</button>' +
            '</div>' +
            '<div class="form-field" id="whCustomField" hidden>' +
            '<span class="form-label">' + escapeHtml(t('hoursCustom')) + '</span>' +
            '<input type="text" id="whCustom" inputmode="decimal" value="' +
            escapeHtml(picked) + '" placeholder="—">' +
            '</div>' +
            (fix
                ? '<div class="form-field"><span class="form-label">' +
                  escapeHtml(t('hoursReason')) + '</span>' +
                  '<input type="text" id="whReason" data-i18n-placeholder="hoursReasonHint"></div>'
                : '') +
            '<p class="form-error" id="whError" hidden></p>' +
            '<button type="button" class="btn btn--primary btn--block" id="whSave">' +
            escapeHtml(t('save')) + '</button>');

        const errEl = sheet.querySelector('#whError');
        const customField = sheet.querySelector('#whCustomField');
        const custom = sheet.querySelector('#whCustom');
        const save = sheet.querySelector('#whSave');

        function value() {
            const raw = (customField.hidden ? picked : custom.value.trim().replace(',', '.'));
            return raw === '' ? 0 : parseFloat(raw);
        }
        function refresh() {
            sheet.querySelectorAll('#whQuick .chip').forEach((c) => {
                const v = c.getAttribute('data-wh');
                c.classList.toggle('chip--on',
                    v !== 'more' && !customField.hidden === false && v === String(value()));
            });
            save.disabled = !(value() > 0);
        }

        sheet.querySelector('#whQuick').addEventListener('click', (ev) => {
            const chip = ev.target.closest('[data-wh]');
            if (!chip) return;
            const v = chip.getAttribute('data-wh');
            if (v === 'more') {
                customField.hidden = false;
                custom.focus();
            } else {
                customField.hidden = true;
                picked = v;
                custom.value = v;
            }
            sheet.querySelectorAll('#whQuick .chip').forEach((c) => {
                c.classList.toggle('chip--on',
                    c.getAttribute('data-wh') === v && v !== 'more');
            });
            save.disabled = !(value() > 0);
        });
        custom.addEventListener('input', () => {
            save.disabled = !(value() > 0);
        });

        save.addEventListener('click', async () => {
            errEl.hidden = true;
            const hours = value();
            if (!(hours > 0 && hours <= 24)) {
                errEl.textContent = t('hoursBad');
                errEl.hidden = false;
                return;
            }
            save.disabled = true;
            try {
                if (fix) {
                    // API: правка часов — только руководитель
                    // (app/services/work_entries.py:212). Работник получает 403 —
                    // показываем его текст как есть, ничего не выдумываем.
                    const entries = await api.taskEntries(taskId);
                    const mine = (entries || []).find(
                        (e) => e.work_date === todayIso() &&
                            Number(e.user_id) === Number(state.user.id));
                    if (!mine) throw new Error(t('error'));
                    const reason = sheet.querySelector('#whReason');
                    const r = reason ? reason.value.trim() : '';
                    if (!r) throw new Error(t('fixNoReason'));
                    await api.updateEntry(mine.id, {
                        hours: hours.toFixed(2), reason: r
                    });
                } else {
                    const payload = {
                        task_id: taskId, work_date: todayIso(),
                        hours: hours.toFixed(2)
                    };
                    try {
                        await api.createEntry(payload);
                    } catch (netErr) {
                        if (isNetError(netErr)) {
                            // SPEC §22: офлайн-запись — в очередь, уйдёт при появлении сети
                            queueAdd(payload);
                            closeSheet();
                            toast(t('offlineSaved'), 'success');
                            // Сети нет — с сервера перечитать нельзя (упадёт на
                            // логин). Отмечаем часы локально, экран остаётся.
                            const data = state.meToday;
                            if (data && data.tasks) {
                                const tk = data.tasks.find((x) => x.id === taskId);
                                if (tk) tk.my_hours_today = num(tk.my_hours_today) + hours;
                            }
                            renderToday();
                            renderOfflineBanner();
                            return;
                        }
                        throw netErr;
                    }
                }
                closeSheet();
                toast(t('recorded'), 'success');
                state.meToday = null;
                state.money = null;
                await loadToday();
            } catch (err) {
                errEl.textContent = err.message || t('error');
                errEl.hidden = false;
                save.disabled = false;
            }
        });
    }

    /* ========================================================
     * 13c. v5: меню ☰ работника (§3.3)
     * ======================================================== */
    // Смена языка: сохраняем на сервере, затем применяем и перерисовываем экран
    async function changeLang(value) {
        const lang = normalizeLang(value);
        try {
            await api.setLang(lang);
        } catch (err) {
            if (err.status) toast(err.message, 'error');
        }
        state.lang = lang;
        applyI18n();
        const v = state.view;
        if (v === 'tasks') renderTasks();
        else if (v === 'team') renderTeam();
        else if (v === 'clients') renderClients();
        else if (v === 'today') renderToday();
        else if (v === 'money') renderMoney();
        else if (v === 'manager-dash') renderManagerDash();
        else if (v === 'reports') renderReportsBody();
        else rerenderScreen(v);
    }

    function openWorkerMenu() {
        const sheet = openSheet(
            '<h3 class="sheet__title">' + escapeHtml(t('menu')) + '</h3>' +
            '<button class="btn btn--ghost btn--block" data-action="open-history">' +
            escapeHtml(t('allHistory')) + ' ›</button>' +
            '<button class="btn btn--ghost btn--block" data-action="open-money">' +
            escapeHtml(t('myMoney')) + ' ›</button>' +
            '<button class="btn btn--ghost btn--block" data-action="open-inventory">' +
            escapeHtml(t('myInventory')) + ' ›</button>' +
            '<div class="form-field"><span class="form-label">' +
            escapeHtml(t('language')) + '</span>' +
            '<select id="menuLang" class="lang-select">' +
            '<option value="ru">РУ</option><option value="uk">УК</option>' +
            '<option value="es">ES</option></select></div>');
        const sel = sheet.querySelector('#menuLang');
        sel.value = state.lang;
        sel.addEventListener('change', () => changeLang(sel.value));
    }

    /* --- v5 §3.3: меню ☰ руководителя (sheet снизу) --- */
    function openManagerMenu() {
        const sheet = openSheet(
            '<h3 class="sheet__title">' + escapeHtml(t('menu')) + '</h3>' +
            '<button class="btn btn--ghost btn--block" data-action="open-team">' +
            escapeHtml(t('menuPeople')) + ' ›</button>' +
            '<button class="btn btn--ghost btn--block" data-action="open-clients">' +
            escapeHtml(t('menuClients')) + ' ›</button>' +
            '<button class="btn btn--ghost btn--block" data-action="open-reports">' +
            escapeHtml(t('moneyOpenReports')) + ' ›</button>' +
            '<div class="form-field"><span class="form-label">' +
            escapeHtml(t('language')) + '</span>' +
            '<select id="menuLang" class="lang-select">' +
            '<option value="ru">РУ</option><option value="uk">УК</option>' +
            '<option value="es">ES</option></select></div>');
        const sel = sheet.querySelector('#menuLang');
        sel.value = state.lang;
        sel.addEventListener('change', () => changeLang(sel.value));
    }

    /* ========================================================
     * 13. Форма «Новое задание»
     * ======================================================== */
    function ntError(message) {
        const el = $('#ntError');
        el.textContent = message || '';
        el.hidden = !message;
    }

    function chipHtml(kind, id, name, on) {
        return '<button type="button" class="chip' + (on ? ' chip--on' : '') +
            '" data-chip="' + kind + '" data-id="' + id + '">' + escapeHtml(name) + '</button>';
    }

    function chipIds(kind) {
        return Array.from(document.querySelectorAll(
            '#ntLocations [data-chip="' + kind + '"], #ntWorkers [data-chip="' + kind + '"]'
        )).filter((c) => c.classList.contains('chip--on'))
            .map((c) => parseInt(c.getAttribute('data-id'), 10));
    }

    async function openNewTask() {
        ntError('');
        showScreen('new-task');
        $('#ntDateStart').value = todayIso();
        $('#ntMultiDay').checked = false;
        $('#ntDateEndField').hidden = true;
        $('#ntDateEnd').value = '';
        try {
            const [clients, users] = await Promise.all([
                state.clients || api.getClients(),
                state.users || api.getUsers()
            ]);
            state.clients = clients;
            state.users = users;
            $('#ntClient').innerHTML = '<option value="">' + escapeHtml(t('empty')) + '</option>' +
                clients.map((c) =>
                    '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>').join('');
            const active = (users || []).filter((u) => u.is_active);
            $('#ntWorkers').innerHTML = active.length
                ? active.map((u) => chipHtml('worker', u.id, u.name, false)).join('')
                : '<p class="screen-message">' + escapeHtml(t('noWorkers')) + '</p>';
            $('#ntLocationsField').hidden = true;
            $('#ntLocations').innerHTML = '';
        } catch (err) {
            ntError(err.message);
        }
    }

    async function onClientChange() {
        const clientId = parseInt($('#ntClient').value, 10);
        if (!clientId) {
            $('#ntLocationsField').hidden = true;
            $('#ntLocations').innerHTML = '';
            return;
        }
        try {
            const locations = await api.request('/clients/' + clientId + '/locations');
            $('#ntLocationsField').hidden = false;
            $('#ntLocations').innerHTML = locations.length
                ? locations.map((l) => chipHtml('location', l.id, l.name, false)).join('')
                : '<p class="screen-message">' + escapeHtml(t('noLocations')) + '</p>';
        } catch (err) {
            ntError(err.message);
        }
    }

    async function submitNewTask(event) {
        event.preventDefault();
        ntError('');
        const title = $('#ntTitle').value.trim();
        const clientId = parseInt($('#ntClient').value, 10);
        if (!title) { ntError(t('taskNeedsTitle')); return; }
        if (!clientId) { ntError(t('taskNeedsClient')); return; }

        const locationIds = chipIds('location');
        const workerIds = chipIds('worker');

        const btn = $('#ntSubmit');
        btn.disabled = true;
        btn.textContent = t('saving');
        try {
            const multi = $('#ntMultiDay').checked;
            const dateStart = $('#ntDateStart').value || null;
            const dateEnd = multi ? ($('#ntDateEnd').value || null) : null;
            const task = await api.createTask({
                title: title,
                description: $('#ntDescr').value.trim() || null,
                client_id: clientId,
                location_ids: locationIds,
                date_start: dateStart,
                date_end: dateEnd,
                status: 'active',
                created_by: state.user.id
            });
            for (const uid of workerIds) {
                await api.assignUser(task.id, uid);
            }
            state.tasks = null;
            btn.disabled = false;
            btn.textContent = t('create');
            toast(t('taskCreated'), 'success');
            goBackHome();
        } catch (err) {
            btn.disabled = false;
            btn.textContent = t('create');
            ntError(err.message);
        }
    }

    /* ========================================================
     * 14. ДЕНЬГИ РУКОВОДИТЕЛЯ: вкладки (Выплаты | Отчёты)
     * ======================================================== */
    async function loadReports() {
        showScreen('reports');
        state.reportsTab = 'payouts';
        document.querySelectorAll('#reportsSegment .segment__btn').forEach((b) => {
            b.classList.toggle('is-active', b.getAttribute('data-reports-tab') === 'payouts');
        });
        renderReportsBody();
    }

    function renderReportsBody() {
        const body = $('#reportsBody');
        body.innerHTML = '<div class="skeleton skeleton--card"></div>';
        if (state.reportsTab === 'payouts') renderPayoutsTab(body);
        else renderManagerSummary(body);
    }

    function periodPickerHtml(start, end) {
        return '<div class="form-row">' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('payStart')) + '</span>' +
            '<input type="date" id="repStart" value="' + start + '"></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('payEnd')) + '</span>' +
            '<input type="date" id="repEnd" value="' + end + '"></label>' +
            '</div>';
    }

    async function renderManagerSummary(body) {
        const [ws, we] = weekRange();
        body.innerHTML = periodPickerHtml(ws, we) + '<div id="repData"></div>';
        await refreshManagerSummary();
    }

    async function refreshManagerSummary() {
        const start = $('#repStart').value;
        const end = $('#repEnd').value;
        const box = $('#repData');
        box.innerHTML = '<div class="skeleton skeleton--card"></div>';
        try {
            const [tasks, entries] = await Promise.all([
                api.getAllTasks(), api.getEntries('date_from=' + start + '&date_to=' + end)
            ]);
            const total = tasks.length;
            const active = tasks.filter((tk) => tk.status === 'active').length;
            const done = tasks.filter((tk) => tk.status === 'done').length;
            const hours = entries.reduce((s, e) => s + num(e.hours), 0);
            const payroll = entries.reduce((s, e) => s + num(e.hours) * num(e.rate_snapshot), 0);

            const byUser = {};
            const byClient = {};
            const taskClient = {};
            (state.tasks || []).concat(tasks).forEach((tk) => {
                taskClient[tk.id] = tk.client_name;
            });
            entries.forEach((e) => {
                byUser[e.user_id] = (byUser[e.user_id] || 0) + num(e.hours);
                const cn = taskClient[e.task_id];
                if (cn) byClient[cn] = (byClient[cn] || 0) + num(e.hours);
            });
            const users = state.users || await api.getUsers();
            state.users = users;
            const nameOf = (id) => {
                const u = users.find((x) => x.id === id);
                return u ? u.name : '#' + id;
            };

            const myHours = entries
                .filter((e) => e.user_id === state.user.id)
                .reduce((s, e) => s + num(e.hours), 0);

            box.innerHTML =
                '<div class="stat-row stat-row--2">' +
                statCell(t('repTasksTotal'), total, 0) +
                statCell(t('repTasksActive'), active, 0) +
                statCell(t('repTasksDone'), done, 0) +
                '<div class="stat"><span class="stat__value">' + escapeHtml(fmtHours(hours)) + '</span>' +
                '<span class="stat__label">' + escapeHtml(t('repHoursTotal')) + '</span></div>' +
                '</div>' +
                '<div class="stat"><span class="stat__value">' + payroll.toFixed(2) + '</span>' +
                '<span class="stat__label">' + escapeHtml(t('repPayroll')) + '</span></div>' +
                '<h3 class="sheet__h3">' + escapeHtml(t('repByWorker')) + '</h3>' +
                (Object.keys(byUser).length
                    ? Object.keys(byUser).map((uid) =>
                        '<div class="row-line"><span>' + escapeHtml(nameOf(uid)) + '</span>' +
                        '<span class="row-line__meta">' + escapeHtml(fmtHours(byUser[uid])) + ' ' +
                        escapeHtml(t('hoursUnit')) + '</span></div>').join('')
                    : '<p class="screen-message">' + escapeHtml(t('repEmpty')) + '</p>') +
                '<h3 class="sheet__h3">' + escapeHtml(t('repByClient')) + '</h3>' +
                (Object.keys(byClient).length
                    ? Object.keys(byClient).map((cn) =>
                        '<div class="row-line"><span>' + escapeHtml(cn) + '</span>' +
                        '<span class="row-line__meta">' + escapeHtml(fmtHours(byClient[cn])) + ' ' +
                        escapeHtml(t('hoursUnit')) + '</span></div>').join('')
                    : '<p class="screen-message">' + escapeHtml(t('repEmpty')) + '</p>') +
                (myHours > 0
                    ? '<p class="muted my-hours">' + escapeHtml(t('repMyHours', { n: fmtHours(myHours) })) + '</p>'
                    : '');
        } catch (err) {
            box.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
        }
    }

    /* ---------- Выплаты (вкладка, только руководитель) ---------- */
    async function renderPayoutsTab(body) {
        const d = new Date();
        const start = isoOf(new Date(d.getFullYear(), d.getMonth(), 1));
        const end = isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0));
        body.innerHTML =
            periodPickerHtml(start, end) +
            '<div class="form-row">' +
            '<button class="btn btn--primary" data-action="pay-preview">' + escapeHtml(t('payPreview')) + '</button>' +
            '</div>' +
            '<div id="payData"></div>';
        await refreshPayPreview();
    }

    async function refreshPayPreview() {
        const start = $('#repStart').value;
        const end = $('#repEnd').value;
        const box = $('#payData');
        box.innerHTML = '<div class="skeleton skeleton--card"></div>';
        try {
            const rows = await api.payPreview(start, end);
            if (!rows || !rows.length) {
                box.innerHTML = '<p class="screen-message">' + escapeHtml(t('payrollEmpty')) + '</p>';
                return;
            }
            box.innerHTML = rows.map((r) =>
                '<div class="row-line"><span>' + escapeHtml(r.name) + '</span>' +
                '<span class="row-line__meta">' +
                escapeHtml(fmtHours(r.hours)) + ' ' + escapeHtml(t('hoursUnit')) + ' · ' +
                num(r.gross).toFixed(2) + ' − ' + num(r.advances_total).toFixed(2) +
                ' = <strong>' + num(r.net).toFixed(2) + '</strong></span></div>'
            ).join('');
        } catch (err) {
            box.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
        }
    }

    /* ========================================================
     * 15. СОТРУДНИКИ: сегменты Люди · Инвентарь (руководитель)
     * ======================================================== */
    async function loadTeam() {
        showScreen('team');
        $('#btnAddWorker').hidden = !isManager();
        // По умолчанию — сегмент «Люди»
        setTeamTab('people');
        try {
            state.users = await api.getUsers();
            renderTeam();
        } catch (err) {
            setList('teamList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>');
        }
    }

    function setTeamTab(tab) {
        const prev = state.teamTab;
        state.teamTab = tab;
        document.querySelectorAll('#teamSegment .segment__btn').forEach((b) => {
            b.classList.toggle('is-active', b.getAttribute('data-team-tab') === tab);
        });
        const peopleBlock = $('#teamPeopleBlock');
        const invBlock = $('#teamInvBlock');
        if (peopleBlock) peopleBlock.hidden = tab !== 'people';
        if (invBlock) invBlock.hidden = tab !== 'inventory';
        $('#btnAddWorker').hidden = tab !== 'people' || !isManager();
        $('#btnAddItem').hidden = tab !== 'inventory' || !isManager();
        // Подгружаем инвентарь при первом переходе на вкладку
        // (prev-гард не даёт loadInventory -> setTeamTab зациклиться)
        if (tab === 'inventory' && prev !== 'inventory' && !state.inventory) loadInventory();
        // v5: у работника кнопки добавления скрыты всегда
        if (!isManager()) {
            $('#btnAddWorker').hidden = true;
            $('#btnAddItem').hidden = true;
        }
    }

    function renderTeam() {
        const users = state.users || [];
        if (!users.length) {
            setList('teamList', '<div class="empty"><div class="empty__text">' +
                escapeHtml(t('empty')) + '</div></div>');
            return;
        }
        setList('teamList', users.map((u) =>
            '<div class="card card--tap" data-user-id="' + u.id + '" role="button" tabindex="0">' +
            '<div class="row-line">' + avatarHtml(u.id, u.name) +
            '<span class="row-line__name">' + escapeHtml(u.name) + '</span>' +
            '<span class="row-line__meta">' + escapeHtml(String(u.hourly_rate)) + '</span>' +
            '</div>' +
            '<div class="card-sub"><span>' + escapeHtml(roleLabel(u)) + '</span>' +
            '<span>' + escapeHtml(u.is_active ? t('profile.active') : t('profile.inactive')) + '</span></div>' +
            '</div>'
        ).join(''));
    }

    function openUserSheet(userId) {
        const u = (state.users || []).find((x) => x.id === userId);
        if (!u) return;
        const sheet = openSheet(
            '<div class="row-line">' + avatarHtml(u.id, u.name) +
            '<span class="row-line__name">' + escapeHtml(u.name) + '</span></div>' +
            '<form id="userEditForm" class="form">' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('workerName')) + '</span>' +
            '<input type="text" id="ueName" value="' + escapeHtml(u.name) + '" required></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('workerRate')) + '</span>' +
            '<input type="number" id="ueRate" min="0" step="0.01" value="' + escapeHtml(String(u.hourly_rate)) + '"></label>' +
            '<div class="card-sub"><span>' + escapeHtml(t('profile.role')) + ': ' + escapeHtml(roleLabel(u)) + '</span>' +
            '<span>' + escapeHtml(u.is_active ? t('profile.active') : t('profile.inactive')) + '</span></div>' +
            '<button type="button" class="btn btn--ghost btn--block" data-action="open-user-summary" data-user="' + u.id + '">' +
            escapeHtml(t('dashOpenWorker')) + '</button>' +
            '<p class="form-error" id="ueError" hidden></p>' +
            '<button type="submit" class="btn btn--primary btn--block">' + escapeHtml(t('save')) + '</button>' +
            '</form>');
        sheet.querySelector('#userEditForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const errEl = sheet.querySelector('#ueError');
            errEl.hidden = true;
            try {
                await api.updateUser(u.id, {
                    name: sheet.querySelector('#ueName').value.trim(),
                    hourly_rate: sheet.querySelector('#ueRate').value || '0'
                });
                toast(t('rateSaved'), 'success');
                closeSheet();
                loadTeam();
            } catch (err) {
                errEl.textContent = err.message;
                errEl.hidden = false;
            }
        });
    }

    async function submitTeamAdd(event) {
        event.preventDefault();
        const errEl = $('#twError');
        errEl.hidden = true;
        const name = $('#twName').value.trim();
        if (!name) return;
        const btn = $('#twSubmit');
        btn.disabled = true;
        try {
            await api.createUser({
                name: name,
                phone: $('#twPhone').value.trim() || null,
                hourly_rate: $('#twRate').value ? $('#twRate').value : '0'
            });
            $('#teamAddForm').hidden = true;
            $('#twName').value = ''; $('#twPhone').value = ''; $('#twRate').value = '';
            btn.disabled = false;
            toast(t('saved'), 'success');
            loadTeam();
        } catch (e) {
            btn.disabled = false;
            errEl.textContent = e.message;
            errEl.hidden = false;
        }
    }

    /* ========================================================
     * 16. ЗАКАЗЧИКИ: строка тапается -> лист с локациями
     * ======================================================== */
    async function loadClients() {
        showScreen('clients');
        $('#btnAddClient').hidden = !isManager();
        try {
            state.clients = await api.getClients();
            renderClients();
        } catch (err) {
            setList('clientsList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>');
        }
    }

    function renderClients() {
        const clients = state.clients || [];
        if (!clients.length) {
            setList('clientsList', '<div class="empty"><div class="empty__text">' +
                escapeHtml(t('empty')) + '</div></div>');
            return;
        }
        setList('clientsList', clients.map((c) =>
            '<div class="card card--tap" data-client-id="' + c.id + '" role="button" tabindex="0">' +
            '<div class="card-title">' + escapeHtml(c.name) + '</div>' +
            ((c.locations || []).length
                ? '<div class="card-sub"><span>' +
                  c.locations.map((l) => escapeHtml(l.name)).join(', ') + '</span></div>'
                : '') +
            '</div>'
        ).join(''));
    }

    function openClientSheet(clientId) {
        const c = (state.clients || []).find((x) => x.id === clientId);
        if (!c) return;
        const sheet = openSheet(
            '<form id="clientEditForm" class="form">' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('clientName')) + '</span>' +
            '<input type="text" id="ceName" value="' + escapeHtml(c.name) + '" required></label>' +
            '<h3 class="sheet__h3">' + escapeHtml(t('taskLocations')) + '</h3>' +
            '<div id="ceLocations"></div>' +
            '<button type="button" class="btn btn--ghost btn--block" data-action="add-location" data-id="' + c.id + '">' +
            escapeHtml(t('addLocation')) + '</button>' +
            '<p class="form-error" id="ceError" hidden></p>' +
            '<button type="submit" class="btn btn--primary btn--block">' + escapeHtml(t('save')) + '</button>' +
            '</form>');
        const locBox = sheet.querySelector('#ceLocations');
        const renderLocs = (locs) => {
            locBox.innerHTML = (locs || []).length
                ? locs.map((l) =>
                    '<div class="row-line"><span>' + escapeHtml(l.name) + '</span>' +
                    '<button type="button" class="btn btn-small" data-action="del-location" data-client="' +
                    c.id + '" data-id="' + l.id + '">' + escapeHtml(t('locationDelete')) + '</button></div>'
                ).join('')
                : '<p class="screen-message">' + escapeHtml(t('noLocations')) + '</p>';
        };
        renderLocs(c.locations);

        sheet.querySelector('[data-action="add-location"]').addEventListener('click', async () => {
            const name = prompt(t('locationName'), '');
            if (!name) return;
            try {
                await api.createLocation(c.id, { name: name });
                toast(t('locationAdded'), 'success');
                const locs = await api.request('/clients/' + c.id + '/locations');
                c.locations = locs;
                renderLocs(locs);
                state.clients = null;
            } catch (err) {
                toast(err.message, 'error');
            }
        });

        locBox.addEventListener('click', async (ev) => {
            const btn = ev.target.closest('[data-action="del-location"]');
            if (!btn) return;
            try {
                await api.deleteLocation(
                    parseInt(btn.getAttribute('data-client'), 10),
                    parseInt(btn.getAttribute('data-id'), 10));
                toast(t('locationDeleted'), 'success');
                const locs = await api.request('/clients/' + c.id + '/locations');
                c.locations = locs;
                renderLocs(locs);
                state.clients = null;
            } catch (err) {
                toast(err.message, 'error');
            }
        });

        sheet.querySelector('#clientEditForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const errEl = sheet.querySelector('#ceError');
            errEl.hidden = true;
            try {
                await api.updateClient(c.id, {
                    name: sheet.querySelector('#ceName').value.trim()
                });
                toast(t('clientSaved'), 'success');
                closeSheet();
                loadClients();
            } catch (err) {
                errEl.textContent = err.message;
                errEl.hidden = false;
            }
        });
    }

    /* ========================================================
     * 17. ИНВЕНТАРЬ: сегмент внутри экрана «Сотрудники»
     * ======================================================== */
    // v5: «Мой инвентарь» из меню ☰ работника — фильтр по держателю=я
    // (API: /inventory?holder_id=..., app/routers/inventory.py:47).
    async function loadInventoryMine() {
        if (!isManager()) {
            const sheet = openSheet('<div data-testid="my-inventory"><p class="screen-message">' +
                escapeHtml(t('loading')) + '</p></div>');
            try {
                // /inventory доступен только руководителю; свой список — в /me/money
                const mine = await api.meMoney();
                const items = (mine && mine.inventory) || [];
                const list = (items || []).length
                    ? items.map((i) =>
                        '<div class="row-line"><span>' + escapeHtml(i.name) + '</span></div>').join('')
                    : '<p class="screen-message">' + escapeHtml(t('moneyNoInventory')) + '</p>';
                sheet.innerHTML = '<div class="sheet__handle"></div><div data-testid="my-inventory">' +
                    '<div class="card-title sheet__title">' + escapeHtml(t('myInventory')) + '</div>' +
                    list +
                    '<button class="btn btn--ghost btn--block" data-action="close-sheet">' +
                    escapeHtml(t('close')) + '</button></div>';
            } catch (err) {
                sheet.innerHTML = '<div class="sheet__handle"></div><div data-testid="my-inventory">' +
                    '<p class="screen-message">' + escapeHtml(err.message) + '</p>' +
                    '<button class="btn btn--ghost btn--block" data-action="close-sheet">' +
                    escapeHtml(t('close')) + '</button></div>';
            }
            return;
        }
        showScreen('team');
        setTeamTab('inventory');
        const list = $('#inventoryList');
        if (list) list.innerHTML = '<div class="skeleton skeleton--card"></div>';
        try {
            state.inventory = await api.request(
                '/inventory?holder_id=' + entry_id(state.user.id));
            renderInventory();
        } catch (err) {
            setList('inventoryList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>');
        }
    }

    async function loadInventory() {
        // Рендерим внутри screenTeam: активный сегмент «Инвентарь»
        showScreen('team');
        setTeamTab('inventory');
        try {
            state.inventory = await api.getInventory();
            renderInventory();
        } catch (err) {
            setList('inventoryList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>');
        }
    }

    function renderInventory() {
        const items = state.inventory || [];
        if (!items.length) {
            setList('inventoryList', '<div class="empty"><div class="empty__text">' +
                escapeHtml(t('inventoryEmpty')) + '</div></div>');
            return;
        }
        setList('inventoryList', items.map((i) =>
            '<div class="card">' +
            '<div class="card-title">' + escapeHtml(i.name) + '</div>' +
            '<div class="card-sub"><span>' + escapeHtml(t('holder')) + ': ' +
            (i.holder ? escapeHtml(i.holder.name) : escapeHtml(t('onStock'))) + '</span></div>' +
            (isManager()
                ? '<div class="card-sub">' +
                  '<button class="btn btn-small" data-action="assign-item" data-id="' + i.id + '">' +
                  escapeHtml(t('assign')) + '</button>' +
                  (i.holder
                      ? '<button class="btn btn-small" data-action="return-item" data-id="' + i.id + '">' +
                        escapeHtml(t('returnStock')) + '</button>'
                      : '') +
                  '</div>'
                : '') +
            '</div>'
        ).join(''));
    }

    function openAssignSheet(itemId) {
        const item = (state.inventory || []).find((x) => x.id === itemId);
        if (!item) return;
        const users = (state.users || []).filter((u) => u.is_active);
        const sheet = openSheet(
            '<div class="card-title sheet__title">' + escapeHtml(item.name) + '</div>' +
            '<p class="screen-message">' + escapeHtml(t('pickHolder')) + '</p>' +
            '<div class="list">' +
            users.map((u) =>
                '<button class="row-line row-line--btn" data-action="assign-to" data-item="' + item.id +
                '" data-user="' + u.id + '">' + avatarHtml(u.id, u.name) +
                '<span class="row-line__name">' + escapeHtml(u.name) + '</span></button>').join('') +
            '</div>' +
            '<button class="btn btn--ghost btn--block" data-action="close-sheet">' + escapeHtml(t('cancel')) + '</button>');
    }

    async function assignTo(itemId, userId) {
        try {
            await api.updateItem(itemId, { holder_id: userId });
            toast(t('itemSaved'), 'success');
            closeSheet();
            state.inventory = null;
            await loadInventory();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function returnItem(itemId) {
        try {
            await api.updateItem(itemId, { holder_id: null });
            toast(t('itemSaved'), 'success');
            state.inventory = null;
            await loadInventory();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function submitItemAdd(event) {
        event.preventDefault();
        const errEl = $('#invError');
        errEl.hidden = true;
        const name = $('#invName').value.trim();
        if (!name) return;
        const btn = $('#invSubmit');
        btn.disabled = true;
        try {
            await api.createItem({
                name: name,
                notes: $('#invNotes').value.trim() || null,
                holder_id: null
            });
            $('#invAddForm').hidden = true;
            $('#invName').value = ''; $('#invNotes').value = '';
            btn.disabled = false;
            toast(t('itemSaved'), 'success');
            loadInventory();
        } catch (e) {
            btn.disabled = false;
            errEl.textContent = e.message;
            errEl.hidden = false;
        }
    }

    /* ========================================================
     * 19a. v4: СЕГОДНЯ (работник)
     * ======================================================== */
    async function loadToday() {
        showScreen('loading');
        try {
            state.meToday = await api.meToday();
            // v5: деньги для карточки «К выплате» (не блокирует экран)
            api.meMoney().then((m) => {
                state.money = m;
                if (state.view === 'today') renderTodayPayCard();
            }).catch(() => {});
            renderToday();
        } catch (err) { renderError(err.message); }
    }

    function renderToday() {
        const data = state.meToday;
        const body = $('#todayBody');
        if (!data || !data.tasks || !data.tasks.length) {
            body.innerHTML = '<div class="empty"><div class="empty__text">' +
                escapeHtml(t('todayNoTasks')) + '</div></div>';
            showScreen('today');
            return;
        }

        // --- карточки заданий на сегодня ---
        const cards = data.tasks.map((tk) => {
            const entered = num(tk.my_hours_today) > 0;
            const workers = isManager() ? (tk.workers || []).map((w) =>
                '<span class="chip chip--static">' + escapeHtml(w.name) +
                (w.hours_today !== null && w.hours_today !== undefined
                    ? ' ' + escapeHtml(fmtHours(w.hours_today)) + escapeHtml(t('hoursUnit'))
                    : '') + '</span>'
            ).join('') : '';
            const others = isManager() ? [] : (tk.workers || []).filter((w) =>
                !(state.user && w.user_id === state.user.id)).map((w) => w.name);
            const coworkers = others.length
                ? '<div class="today-coworkers" data-testid="coworkers">' +
                  escapeHtml(t('todayCoworkers', { names: others.join(', ') })) + '</div>'
                : '';
            const action = entered
                ? (isManager()
                    ? '<button class="btn btn--ghost btn--block card__enter today-done" data-action="fix-hours" data-id="' + tk.id + '">' +
                      '✓ ' + escapeHtml(t('todayEntered', { n: fmtHours(tk.my_hours_today) })) +
                      ' · ' + escapeHtml(t('editTask')) + '</button>'
                    : '<div class="today-done today-done--plaque" data-testid="today-done">✓ ' +
                      escapeHtml(t('todayEntered', { n: fmtHours(tk.my_hours_today) })) + '</div>' +
                      '<p class="today-done__hint">' + escapeHtml(t('todayFixByManager')) + '</p>')
                : '<button class="btn btn--primary btn--block card__enter" data-action="enter-hours" data-id="' + tk.id + '">' +
                  escapeHtml(t('todayEnterHours')) + '</button>';
            return '<div class="card">' +
                '<div class="card-title">' + escapeHtml(tk.title) + '</div>' +
                '<div class="card-sub"><span>' +
                [tk.client_name, (tk.location_names || []).join(', ')]
                    .filter(Boolean).map(escapeHtml).join(' · ') + '</span></div>' +
                (workers ? '<div class="chip-row">' + workers + '</div>' : '') +
                coworkers +
                action +
                '</div>';
        }).join('');

        body.innerHTML = '<div class="list">' + cards + '</div>' +
            '<div id="todayPayCard"></div>' +
            '<p class="card-sub" id="offlineBanner" hidden style="margin:8px 0"></p>' +
            '<h3 class="sheet__h3">' + escapeHtml(t('todayHistoryTitle')) + '</h3>' +
            '<div id="todayHistList"><div class="skeleton skeleton--card"></div></div>' +
            '<button class="btn btn--ghost btn--block" data-action="open-history">' +
            escapeHtml(t('allHistory')) + ' ›</button>';

        renderTodayPayCard();
        renderOfflineBanner();
        loadTodayHistory();
        showScreen('today');
    }

    /* --- v5: карточка «К выплате» на главном экране работника --- */
    function monthName(d) {
        const loc = state.lang === 'uk' ? 'uk-UA'
            : state.lang === 'es' ? 'es-ES' : 'ru-RU';
        try {
            return new Date(d + 'T00:00:00').toLocaleDateString(loc, { month: 'long' });
        } catch (e) { return d; }
    }

    function renderTodayPayCard() {
        const slot = $('#todayPayCard');
        if (!slot) return;
        const m = state.money;
        if (!m) { slot.innerHTML = ''; return; }
        // v5: если открытый период тянется с epoch (закрытых выплат нет),
        // показываем текущий месяц, а не «январь» из даты epoch.
        const today = new Date();
        const ps = m.period_start ? new Date(m.period_start + 'T00:00:00') : null;
        const sameMonth = ps && ps.getFullYear() === today.getFullYear()
            && ps.getMonth() === today.getMonth();
        const monthLabel = sameMonth ? monthName(m.period_start)
            : today.toLocaleDateString(
                state.lang === 'uk' ? 'uk-UA' : state.lang === 'es' ? 'es-ES' : 'ru-RU',
                { month: 'long' });
        const row = (k, label, v) =>
            '<div class="pay-row" data-testid="pay-' + k + '"><span class="pay-row__label">' +
            escapeHtml(label) + '</span><span class="pay-row__sum">' +
            escapeHtml(fmtMoney(v)) + '</span></div>';
        slot.innerHTML =
            '<div class="card card--tap" data-action="open-money" role="button" tabindex="0">' +
            '<div class="card-sub"><span>' +
            escapeHtml(t('payCardTitle', { m: monthLabel })) + '</span></div>' +
            row('earned', t('payRowEarned'), m.earned) +
            row('advances', t('payRowAdvances'), m.advances) +
            row('topay', t('payRowToPay'), m.to_pay) +
            (num(m.to_pay) < 0
                ? '<div class="pay-note" data-testid="pay-negative-note">' +
                  escapeHtml(t('payNegativeNote', { sum: fmtMoney(Math.abs(num(m.to_pay))) })) + '</div>'
                : '') +
            '</div>';
    }

    function historyRowHtml(r) {
        const text = [fmtDateHuman(r.date), r.task_title, r.location, fmtHoursUnit(r.hours)]
            .filter(Boolean).join(' · ');
        return '<div class="history-row-wrap"><div class="history-row" data-testid="history-row">' +
            escapeHtml(text) + '</div>' +
            (r.corrected
                ? '<div class="history-row__note" title="' + escapeHtml(r.corrected_reason || '') + '">' +
                  escapeHtml(t('histCorrected')) + '</div>'
                : '') + '</div>';
    }

    /* --- v5: последние ~5 записей истории на главном экране --- */
    async function loadTodayHistory() {
        const box = $('#todayHistList');
        if (!box) return;
        try {
            const rows = await api.meHistory();
            const recent = rows.slice(0, 5);
            if (!recent.length) {
                box.innerHTML = '<p class="screen-message">' +
                    escapeHtml(t('histEmpty')) + '</p>';
                return;
            }
            box.innerHTML = recent.map(historyRowHtml).join('');
        } catch (err) {
            box.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
        }
    }

    /* ========================================================
     * 19b. v4: ИСТОРИЯ (работник)
     * ======================================================== */
    async function loadHistory(preset) {
        showScreen('history');
        state.histPreset = preset || 'week';
        document.querySelectorAll('#histSegment .segment__btn').forEach((b) => {
            b.classList.toggle('is-active',
                b.getAttribute('data-hist') === state.histPreset);
        });
        $('#histCustomRange').hidden = state.histPreset !== 'custom';
        let from = null, to = null;
        if (state.histPreset === 'week') {
            const r = weekRange(); from = r[0]; to = r[1];
        } else if (state.histPreset === 'month') {
            const r = monthRange(); from = r[0]; to = r[1];
        } else {
            if (state.histRange) { from = state.histRange[0]; to = state.histRange[1]; }
            else return; // ждём «Применить»
        }
        await refreshHistory(from, to);
    }

    async function refreshHistory(from, to) {
        const box = $('#historyList');
        box.innerHTML = '<div class="skeleton skeleton--card"></div>';
        try {
            const rows = await api.meHistory(from, to);
            if (!rows.length) {
                box.innerHTML = '<div class="empty"><div class="empty__text">' +
                    escapeHtml(t('histEmpty')) + '</div></div>';
                return;
            }
            box.innerHTML = '<div class="card">' + rows.map(historyRowHtml).join('') + '</div>';
        } catch (err) {
            box.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
        }
    }

    /* ========================================================
     * 19c. v4: ДЕНЬГИ (работник)
     * ======================================================== */
    async function loadMoney() {
        showScreen('loading');
        try {
            state.money = await api.meMoney();
            renderMoney();
        } catch (err) { renderError(err.message); }
    }

    function renderMoney() {
        const m = state.money;
        const body = $('#moneyBody');
        if (!m) { showScreen('money'); return; }
        // v5 §3.2: у руководителя «Деньги» — сводка по всем сотрудникам
        if (isManager()) { renderMoneyManager(body); return; }
        const lp = m.last_payout;
        body.innerHTML =
            '<p class="muted my-hours">' + escapeHtml(t('moneyPeriod', { d: fmtDateHuman(m.period_start) })) + '</p>' +
            '<div class="stat-row stat-row--2">' +
            '<div class="stat"><span class="stat__value">' + escapeHtml(fmtHoursUnit(m.hours)) + '</span>' +
            '<span class="stat__label">' + escapeHtml(t('moneyHours')) + '</span></div>' +
            '<div class="stat"><span class="stat__value">' + escapeHtml(fmtMoney(m.earned)) + '</span>' +
            '<span class="stat__label">' + escapeHtml(t('moneyEarned')) + '</span></div>' +
            '</div>' +
            '<div class="stat-row stat-row--2">' +
            '<div class="stat"><span class="stat__value">' + escapeHtml(fmtMoney(m.advances)) + '</span>' +
            '<span class="stat__label">' + escapeHtml(t('moneyAdvances')) + '</span></div>' +
            '<div class="stat"><span class="stat__value">' + escapeHtml(fmtMoney(m.to_pay)) + '</span>' +
            '<span class="stat__label">' + escapeHtml(t('moneyToPay')) + '</span></div>' +
            '</div>' +
            '<div class="card">' +
            '<div class="row-line"><span>' + escapeHtml(t('moneyRate')) + '</span>' +
            '<span class="row-line__meta">' + escapeHtml(fmtMoney(m.rate) + '/' + t('hoursUnit')) + '</span></div>' +
            '<div class="row-line"><span>' + escapeHtml(t('moneyLastPayout')) + '</span>' +
            (lp
                ? '<span class="row-line__meta">' + escapeHtml(fmtDateHuman(lp.date)) + ' · ' +
                  escapeHtml(fmtMoney(lp.amount)) + ' · ' +
                  escapeHtml(t('payout.' + lp.status)) + '</span>'
                : '<span class="row-line__meta muted">' + escapeHtml(t('moneyNoPayout')) + '</span>') +
            '</div></div>' +
            '<h3 class="sheet__h3">' + escapeHtml(t('moneyInventory')) + '</h3>' +
            ((m.inventory || []).length
                ? m.inventory.map((i) =>
                    '<div class="row-line"><span>' + escapeHtml(i.name) + '</span></div>').join('')
                : '<p class="screen-message">' + escapeHtml(t('moneyNoInventory')) + '</p>');
        showScreen('money');
    }

    /* --- ТЗ 11.11 этап 0: «Деньги» руководителя: период, таблица, аванс, закрытие --- */
    function payPeriodBounds(kind) {
        const d = new Date();
        if (kind === 'prev') {
            return [isoOf(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
                isoOf(new Date(d.getFullYear(), d.getMonth(), 0))];
        }
        if (kind === 'since-close' && state.payLastEnd) {
            const e = new Date(state.payLastEnd + 'T00:00:00');
            const start = isoOf(new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1));
            const today = todayIso();
            return [start, start > today ? start : today];
        }
        return monthRange();
    }

    function fmtPayPeriod(a, b) {
        const opt = { day: 'numeric', month: 'short' };
        const optY = { day: 'numeric', month: 'short', year: 'numeric' };
        try {
            const da = new Date(a + 'T00:00:00');
            const db = new Date(b + 'T00:00:00');
            const sameYear = da.getFullYear() === db.getFullYear();
            return da.toLocaleDateString(localeTag(), sameYear ? opt : optY) + ' – ' +
                db.toLocaleDateString(localeTag(), optY);
        } catch (e) { return a + ' – ' + b; }
    }

    async function renderMoneyManager(body) {
        if (!state.payPeriod) state.payPeriod = 'month';
        body.innerHTML = '<div class="skeleton skeleton--card"></div>';
        try {
            const [users, payouts] = await Promise.all([
                state.users || api.getUsers(),
                api.getPayouts()
            ]);
            state.users = users;
            let lastEnd = '';
            (payouts || []).forEach((p) => {
                if (p.period_end && p.period_end > lastEnd) lastEnd = p.period_end;
            });
            state.payLastEnd = lastEnd;
            if (state.payPeriod === 'since-close' && !lastEnd) state.payPeriod = 'month';
        } catch (err) {
            body.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
            showScreen('money');
            return;
        }
        const kinds = [['month', 'moneyPeriodMonth'], ['prev', 'moneyPeriodPrev']];
        if (state.payLastEnd) kinds.push(['since-close', 'moneyPeriodSince']);
        body.innerHTML =
            '<div class="segment money-period">' +
            kinds.map((k) =>
                '<button class="segment__btn' + (state.payPeriod === k[0] ? ' is-active' : '') +
                '" data-period="' + k[0] + '">' + escapeHtml(t(k[1])) + '</button>').join('') +
            '</div>' +
            '<div class="money-period__dates muted" data-testid="pay-period"></div>' +
            '<div id="payTable"></div>' +
            '<div class="money-actions">' +
            '<button class="btn btn--primary btn--block" data-action="pay-advance-open">' +
            escapeHtml(t('moneyGiveAdvance')) + '</button>' +
            '<button class="btn btn--danger btn--block" data-action="pay-close">' +
            escapeHtml(t('moneyCloseBtn')) + '</button>' +
            '</div>';
        body.querySelectorAll('[data-period]').forEach((b) => {
            b.addEventListener('click', () => {
                state.payPeriod = b.getAttribute('data-period');
                body.querySelectorAll('[data-period]').forEach((x) => {
                    x.classList.toggle('is-active', x === b);
                });
                refreshMoneyTable();
            });
        });
        showScreen('money');
        await refreshMoneyTable();
    }

    async function refreshMoneyTable() {
        const box = $('#payTable');
        if (!box) return;
        const [start, end] = payPeriodBounds(state.payPeriod);
        const label = $('#screenMoney [data-testid="pay-period"]');
        if (label) label.textContent = fmtPayPeriod(start, end);
        state.payRows = null;
        state.payRange = [start, end];
        box.innerHTML = '<div class="skeleton skeleton--card"></div>';
        try {
            const rows = await api.payPreview(start, end);
            // за время запроса могли переключить период
            if (!state.payRange || state.payRange[0] !== start || state.payRange[1] !== end) return;
            state.payRows = rows || [];
            if (!state.payRows.length) {
                box.innerHTML = '<p class="screen-message">' + escapeHtml(t('moneyEmptyPeriod')) + '</p>';
                return;
            }
            let h = 0, g = 0, a = 0, n = 0;
            state.payRows.forEach((r) => {
                h += num(r.hours); g += num(r.gross); a += num(r.advances_total); n += num(r.net);
            });
            box.innerHTML =
                '<div class="pay-table-wrap"><table class="pay-table" data-testid="pay-table">' +
                '<thead><tr><th>' + escapeHtml(t('moneyColPerson')) + '</th>' +
                '<th class="num">' + escapeHtml(t('moneyColHours')) + '</th>' +
                '<th class="num">' + escapeHtml(t('moneyColEarned')) + '</th>' +
                '<th class="num">' + escapeHtml(t('moneyColAdv')) + '</th>' +
                '<th class="num">' + escapeHtml(t('moneyColNet')) + '</th></tr></thead><tbody>' +
                state.payRows.map((r) =>
                    '<tr data-testid="pay-row" data-user="' + escapeHtml(r.user_id) +
                    '" data-action="open-user-summary">' +
                    '<td>' + escapeHtml(r.name) + '</td>' +
                    '<td class="num">' + escapeHtml(fmtHoursUnit(r.hours)) + '</td>' +
                    '<td class="num">' + escapeHtml(fmtMoney(r.gross)) + '</td>' +
                    '<td class="num">' + escapeHtml(fmtMoney(r.advances_total)) + '</td>' +
                    '<td class="num"><strong>' + escapeHtml(fmtMoney(r.net)) + '</strong></td></tr>'
                ).join('') +
                '</tbody><tfoot><tr data-testid="pay-total">' +
                '<td>' + escapeHtml(t('moneyTotalRow')) + '</td>' +
                '<td class="num">' + escapeHtml(fmtHoursUnit(h)) + '</td>' +
                '<td class="num">' + escapeHtml(fmtMoney(g)) + '</td>' +
                '<td class="num">' + escapeHtml(fmtMoney(a)) + '</td>' +
                '<td class="num"><strong>' + escapeHtml(fmtMoney(n)) + '</strong></td></tr></tfoot>' +
                '</table></div>';
        } catch (err) {
            box.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
        }
    }

    function openAdvanceSheet() {
        const users = (state.users || []).filter((u) => u.is_active);
        const sheet = openSheet(
            '<h3 class="sheet__title">' + escapeHtml(t('moneyGiveAdvance')) + '</h3>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('advWho')) + '</span>' +
            '<select id="advUser">' +
            users.map((u) => '<option value="' + escapeHtml(u.id) + '">' + escapeHtml(u.name) + '</option>').join('') +
            '</select></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('advAmountLabel')) + '</span>' +
            '<input type="number" id="advAmount" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00"></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('advDateLabel')) + '</span>' +
            '<input type="date" id="advDate" value="' + todayIso() + '"></label>' +
            '<p class="form-error" id="advError" hidden></p>' +
            '<button class="btn btn--primary btn--block" data-action="pay-advance">' + escapeHtml(t('save')) + '</button>');
        return sheet;
    }

    async function createAdvance() {
        const sheet = document.querySelector('#sheetRoot .sheet');
        if (!sheet) return;
        const errBox = sheet.querySelector('#advError');
        const showErr = (msg) => { errBox.textContent = msg; errBox.hidden = false; };
        const userId = parseInt(sheet.querySelector('#advUser').value, 10);
        const amount = parseFloat(sheet.querySelector('#advAmount').value);
        const date = sheet.querySelector('#advDate').value || todayIso();
        if (!userId || !(amount > 0)) { showErr(t('advAmountError')); return; }
        const btn = sheet.querySelector('[data-action="pay-advance"]');
        btn.disabled = true;
        try {
            await api.createAdvance({
                user_id: userId, amount: amount.toFixed(2),
                date: date, created_by: state.user.id
            });
            closeSheet();
            toast(t('advSaved'), 'success');
            await refreshMoneyTable();
        } catch (err) {
            btn.disabled = false;
            showErr(err.message);
        }
    }

    function closePayroll() {
        const rows = state.payRows || [];
        if (!rows.length || !state.payRange) { toast(t('moneyCloseEmpty'), 'error'); return; }
        // Будущие дни не закрываем: иначе часы, записанные после закрытия, но до конца
        // выбранного периода, попали бы в уже закрытый расчёт и не вошли бы ни в одну выплату.
        const today = todayIso();
        const range = [state.payRange[0],
            state.payRange[1] > today ? today : state.payRange[1]];
        const total = rows.reduce((s, r) => s + num(r.net), 0);
        const msg = t('moneyCloseConfirm', {
            period: fmtPayPeriod(range[0], range[1]), n: rows.length, sum: fmtMoney(total)
        });
        const run = async (ok) => {
            if (!ok) return;
            try {
                await api.payClose({
                    period_start: range[0], period_end: range[1], created_by: state.user.id
                });
                toast(t('moneyClosed'), 'success');
                await renderMoneyManager($('#moneyBody'));
            } catch (err) {
                toast(err.message, 'error');
            }
        };
        if (tg && typeof tg.showConfirm === 'function') tg.showConfirm(msg, run);
        else run(window.confirm(msg));
    }

    /* ========================================================
     * 19d. v4: ДАШБОРД РУКОВОДИТЕЛЯ
     * ======================================================== */
    async function loadManagerDash() {
        showScreen('loading');
        try {
            state.dash = await api.dashboardToday();
            renderManagerDash();
        } catch (err) { renderError(err.message); }
    }

    // Часы для строки-итога: «10», «7,5» (разделитель по языку интерфейса).
    function fmtHoursPlain(v) {
        return num(v).toLocaleString(localeTag(), { maximumFractionDigits: 2 });
    }

    function sortTasksByTitle(tasks) {
        return (tasks || []).slice().sort((x, y) =>
            String(x.title).localeCompare(String(y.title), 'ru'));
    }

    function renderManagerDash() {
        const d = state.dash;
        const body = $('#managerDashBody');
        if (!d) { showScreen('manager-dash'); return; }
        const tasks = sortTasksByTitle(d.tasks);
        // Люди, назначенные на сегодняшние задания; отметились = есть часы хотя бы на одном.
        const people = {};
        const order = [];
        tasks.forEach((tk) => (tk.workers || []).forEach((w) => {
            if (!people[w.user_id]) {
                people[w.user_id] = { id: w.user_id, name: w.name, titles: [], has: false };
                order.push(w.user_id);
            }
            const p = people[w.user_id];
            p.titles.push(tk.title);
            if (num(w.hours_today) > 0) p.has = true;
        }));
        const assigned = order.length;
        const checked = order.filter((id) => people[id].has).length;
        const missing = order.map((id) => people[id]).filter((p) => !p.has);
        const summary = t('dashSummary', {
            a: assigned, b: checked, h: fmtHoursPlain(d.hours_today)
        });
        const list = missing.length
            ? '<h3 class="sheet__h3">' + escapeHtml(t('notCheckedIn')) + '</h3>' +
              '<div class="card nci" data-testid="not-checked-in">' +
              missing.map((p) =>
                  '<div class="nci__row" data-testid="nci-row" data-user="' + p.id + '">' +
                  '<div class="nci__info"><div class="nci__name">' + escapeHtml(p.name) + '</div>' +
                  '<div class="nci__tasks">' + escapeHtml(p.titles.join(', ')) + '</div></div>' +
                  '<button type="button" class="btn btn--primary nci__btn" data-action="enter-for" data-user="' +
                  p.id + '">' + escapeHtml(t('enterFor')) + '</button></div>').join('') +
              '</div>'
            : (assigned
                ? '<p class="screen-message nci-ok" data-testid="all-checked-in">' +
                  escapeHtml(t('allCheckedIn')) + '</p>'
                : '');
        const cards = tasks.map((tk) => {
            const chips = (tk.workers || []).map((w) => {
                const has = num(w.hours_today) > 0;
                return '<span class="chip chip--static' + (has ? ' chip--ok' : '') +
                    '" data-dash-user="' + w.user_id + '">' + escapeHtml(w.name) +
                    (has ? ' ' + escapeHtml(fmtHoursUnit(w.hours_today)) : '') + '</span>';
            }).join('');
            return '<div class="card card--tap" data-task-id="' + tk.id + '" role="button" tabindex="0">' +
                '<div class="card-title">' + escapeHtml(tk.title) + '</div>' +
                '<div class="card-sub"><span>' +
                [tk.client_name, (tk.location_names || []).join(', ')]
                    .filter(Boolean).map(escapeHtml).join(' · ') + '</span></div>' +
                (chips ? '<div class="chip-row">' + chips + '</div>' : '') +
                '</div>';
        }).join('');
        body.innerHTML =
            '<p class="dash-summary" data-testid="dash-summary">' + escapeHtml(summary) + '</p>' +
            list +
            '<h3 class="sheet__h3">' + escapeHtml(t('dashActiveTasks')) + '</h3>' +
            '<div class="list">' + (cards || '<div class="empty"><div class="empty__text">' +
                escapeHtml(t('dashNoTasksToday')) + '</div></div>') + '</div>';
        showScreen('manager-dash');
    }

    // «Записать за него»: часы сегодня за человека из списка «Не отметились».
    function openEnterForSheet(userId) {
        const d = state.dash;
        if (!d) return;
        const tasks = sortTasksByTitle(d.tasks).filter((tk) =>
            (tk.workers || []).some((w) => w.user_id === userId));
        if (!tasks.length) return;
        const who = tasks[0].workers.find((w) => w.user_id === userId);
        let taskId = tasks[0].id;
        let picked = '';
        const sheet = openSheet(
            '<h3 class="sheet__title">' + escapeHtml(t('enterForTitle', { name: who.name })) + '</h3>' +
            (tasks.length > 1
                ? '<div class="chip-row" id="efTasks">' + tasks.map((tk, i) =>
                    '<button type="button" class="chip' + (i === 0 ? ' chip--on' : '') +
                    '" data-ef-task="' + tk.id + '">' + escapeHtml(tk.title) + '</button>').join('') + '</div>'
                : '<p class="muted">' + escapeHtml(tasks[0].title) + '</p>') +
            '<div class="he-quick" id="whQuick">' +
            ['4', '6', '8', '10', '12'].map((v) =>
                '<button type="button" class="chip" data-wh="' + v + '">' + v + '</button>').join('') +
            '<button type="button" class="chip" data-wh="more">' + escapeHtml(t('hoursMore')) + '</button>' +
            '</div>' +
            '<div class="form-field" id="whCustomField" hidden>' +
            '<span class="form-label">' + escapeHtml(t('hoursCustom')) + '</span>' +
            '<input type="text" id="whCustom" inputmode="decimal" placeholder="—"></div>' +
            '<p class="form-error" id="whError" hidden></p>' +
            '<button type="button" class="btn btn--primary btn--block" id="whSave" disabled>' +
            escapeHtml(t('save')) + '</button>');
        const errEl = sheet.querySelector('#whError');
        const customField = sheet.querySelector('#whCustomField');
        const custom = sheet.querySelector('#whCustom');
        const save = sheet.querySelector('#whSave');
        const value = () => {
            const raw = customField.hidden ? picked : custom.value.trim().replace(',', '.');
            return raw === '' ? 0 : parseFloat(raw);
        };
        const efTasks = sheet.querySelector('#efTasks');
        if (efTasks) efTasks.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-ef-task]');
            if (!b) return;
            taskId = parseInt(b.getAttribute('data-ef-task'), 10);
            efTasks.querySelectorAll('.chip').forEach((c) => c.classList.toggle('chip--on', c === b));
        });
        sheet.querySelector('#whQuick').addEventListener('click', (ev) => {
            const chip = ev.target.closest('[data-wh]');
            if (!chip) return;
            const v = chip.getAttribute('data-wh');
            if (v === 'more') {
                customField.hidden = false;
                custom.focus();
            } else {
                customField.hidden = true;
                picked = v;
                custom.value = v;
            }
            sheet.querySelectorAll('#whQuick .chip').forEach((c) =>
                c.classList.toggle('chip--on', c.getAttribute('data-wh') === v && v !== 'more'));
            save.disabled = !(value() > 0);
        });
        custom.addEventListener('input', () => { save.disabled = !(value() > 0); });
        save.addEventListener('click', async () => {
            errEl.hidden = true;
            const hours = value();
            if (!(hours > 0 && hours <= 24)) {
                errEl.textContent = t('hoursBad');
                errEl.hidden = false;
                return;
            }
            save.disabled = true;
            try {
                await api.createEntry({
                    task_id: taskId, work_date: d.date || todayIso(),
                    hours: hours.toFixed(2), user_id: userId
                });
                closeSheet();
                toast(t('recorded'), 'success');
                state.tasks = null;
                state.dash = await api.dashboardToday();
                renderManagerDash();
            } catch (err) {
                errEl.textContent = err.message || t('error');
                errEl.hidden = false;
                save.disabled = false;
            }
        });
    }

    /* ========================================================
     * 19e. v4: МАТРИЦА ЗАДАНИЯ (руководитель)
     * ======================================================== */
    async function openMatrix(taskId, from) {
        state.matrixTaskId = taskId;
        state.matrixFrom = from || state.matrixFrom || 'manager-dash';
        const body = $('#matrixBody');
        body.innerHTML = '<div class="skeleton skeleton--card"></div>';
        showScreen('matrix');
        try {
            const m = await api.taskMatrix(taskId);
            if (!m.rows.length || !m.dates.length) {
                body.innerHTML = '<div class="empty"><div class="empty__text">' +
                    escapeHtml(t('matrixEmpty')) + '</div></div>';
                return;
            }
            const head = '<tr><th></th>' + m.dates.map((d) =>
                '<th>' + escapeHtml(fmtDateHuman(d)) + '</th>').join('') + '</tr>';
            const rows = m.rows.map((r) =>
                '<tr><th>' + escapeHtml(r.name) + '</th>' +
                m.dates.map((d) => {
                    const v = r.cells[d];
                    return v === null || v === undefined
                        ? '<td class="matrix-cell matrix-cell--empty">·</td>'
                        : '<td class="matrix-cell">' + escapeHtml(fmtHours(v)) + '</td>';
                }).join('') + '</tr>').join('');
            body.innerHTML =
                '<p class="muted my-hours">' + escapeHtml(m.title) + '</p>' +
                '<div class="matrix-wrap"><table class="matrix">' +
                '<thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
        } catch (err) {
            body.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
        }
    }

    /* ========================================================
     * 19f. v4: КАРТОЧКА СОТРУДНИКА (руководитель)
     * ======================================================== */
    async function openUserSummary(userId) {
        state.summaryUserId = userId;
        const body = $('#userSummaryBody');
        body.innerHTML = '<div class="skeleton skeleton--card"></div>';
        showScreen('user-summary');
        try {
            const s = await api.userSummary(userId);
            body.innerHTML =
                '<div class="row-line">' + avatarHtml(s.id, s.name) +
                '<span class="row-line__name">' + escapeHtml(s.name) + '</span>' +
                '<span class="row-line__meta">' + escapeHtml(roleLabel(s)) + '</span></div>' +
                '<p class="muted my-hours">' + escapeHtml(t('sumPeriod', { d: fmtDateHuman(s.period_start) })) + '</p>' +
                '<div class="stat-row stat-row--2">' +
                '<div class="stat"><span class="stat__value">' + escapeHtml(fmtHoursUnit(s.hours_period)) + '</span>' +
                '<span class="stat__label">' + escapeHtml(t('moneyHours')) + '</span></div>' +
                '<div class="stat"><span class="stat__value">' + escapeHtml(fmtMoney(s.earned_period)) + '</span>' +
                '<span class="stat__label">' + escapeHtml(t('moneyEarned')) + '</span></div>' +
                '</div>' +
                '<div class="card">' +
                '<div class="row-line"><span>' + escapeHtml(t('moneyRate')) + '</span>' +
                '<span class="row-line__meta">' + escapeHtml(fmtMoney(s.rate) + '/' + t('hoursUnit')) + '</span></div>' +
                '<div class="row-line"><span>' + escapeHtml(t('profile.role')) + '</span>' +
                '<span class="row-line__meta">' +
                escapeHtml(s.is_active ? t('profile.active') : t('profile.inactive')) + '</span></div>' +
                '</div>' +
                '<h3 class="sheet__h3">' + escapeHtml(t('moneyInventory')) + '</h3>' +
                ((s.inventory || []).length
                    ? s.inventory.map((i) =>
                        '<div class="row-line"><span>' + escapeHtml(i.name) + '</span></div>').join('')
                    : '<p class="screen-message">' + escapeHtml(t('moneyNoInventory')) + '</p>') +
                '<h3 class="sheet__h3">' + escapeHtml(t('sumLastEntries')) + '</h3>' +
                ((s.last_entries || []).length
                    ? s.last_entries.map((e) =>
                        '<div class="row-line"><span>' + escapeHtml(e.task_title || '—') +
                        (e.location ? ' · ' + escapeHtml(e.location) : '') + '</span>' +
                        '<span class="row-line__meta">' + escapeHtml(fmtDateHuman(e.date)) + ' · ' +
                        escapeHtml(fmtHours(e.hours)) + ' ' + escapeHtml(t('hoursUnit')) + '</span></div>').join('')
                    : '<p class="screen-message">' + escapeHtml(t('sumNoEntries')) + '</p>');
        } catch (err) {
            body.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
        }
    }

    /* ========================================================
     * 20. Events
     * ======================================================== */
    function bindEvents() {
        if (tg && tg.BackButton) tg.BackButton.onClick(navBack);
        document.querySelectorAll('.bottom-nav__item[data-nav-target]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-nav-target');
                if (target === 'tasks') loadTasks();
                else if (target === 'reports') loadReports();
                else if (target === 'team') loadTeam();
                else if (target === 'clients') loadClients();
                // v4
                else if (target === 'today') loadToday();
                else if (target === 'history') loadHistory('week');
                else if (target === 'money') loadMoney();
                else if (target === 'manager-dash') loadManagerDash();
            });
        });

        // Кнопка «Открыть бота» на экране логина (незарегистрированный пользователь)
        const btnRetry = $('#btnRetry');
        if (btnRetry) btnRetry.addEventListener('click', () => { location.reload(); });
        const btnOpenBot = $('#btnOpenBot');
        if (btnOpenBot) {
            btnOpenBot.addEventListener('click', () => {
                const username = (CONFIG.botUsername || 'agrofirmbot').replace('@', '');
                const url = 'https://t.me/' + username;
                if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
                else window.open(url, '_blank');
            });
        }

        // Делегированные клики по data-action
        document.addEventListener('click', (ev) => {
            const btn = ev.target.closest('[data-action]');
            if (btn) {
                const action = btn.getAttribute('data-action');
                const id = btn.getAttribute('data-id');
                if (action === 'new-task') openNewTask();
                else if (action === 'enter-for') {
                    openEnterForSheet(parseInt(btn.getAttribute('data-user'), 10));
                }
                else if (action === 'enter-hours') {
                    if (isManager()) openHoursEntry(parseInt(id, 10));
                    else openWorkerHoursSheet(parseInt(id, 10), false);
                }
                else if (action === 'fix-hours') openWorkerHoursSheet(parseInt(id, 10), true);
                else if (action === 'open-history') { closeSheet(); loadHistory('week'); }
                else if (action === 'open-money') { closeSheet(); loadMoney(); }
                else if (action === 'open-inventory') { closeSheet(); loadInventoryMine(); }
                else if (action === 'open-team') { closeSheet(); loadTeam(); }
                else if (action === 'open-clients') { closeSheet(); loadClients(); }
                else if (action === 'open-reports') { closeSheet(); loadReports(); }
                else if (action === 'pay-advance-open') openAdvanceSheet();
                else if (action === 'finish-task') finishTask(parseInt(id, 10));
                else if (action === 'finish-task-yes') doFinishTask(parseInt(id, 10));
                else if (action === 'edit-task') editTaskSheet(parseInt(id, 10));
                else if (action === 'close-sheet') closeSheet();
                else if (action === 'pay-preview') refreshPayPreview();
                else if (action === 'pay-close') closePayroll();
                else if (action === 'pay-advance') createAdvance();
                else if (action === 'assign-item') openAssignSheet(parseInt(id, 10));
                else if (action === 'assign-to') {
                    assignTo(parseInt(btn.getAttribute('data-item'), 10),
                        parseInt(btn.getAttribute('data-user'), 10));
                }
                else if (action === 'return-item') returnItem(parseInt(id, 10));
                // v4
                else if (action === 'open-matrix') openMatrix(parseInt(id, 10));
                else if (action === 'open-user-summary') {
                    openUserSummary(parseInt(btn.getAttribute('data-user'), 10));
                }
                return;
            }

            // Тап по карточке задания (кроме кнопки внутри)
            const taskCard = ev.target.closest('[data-task-id]');
            if (taskCard && !ev.target.closest('[data-action]')) {
                const cardTid = parseInt(taskCard.getAttribute('data-task-id'), 10);
                if (isManager()) openMatrix(cardTid, state.view);
                else openTaskSheet(cardTid);
                return;
            }
            const userCard = ev.target.closest('[data-user-id]');
            if (userCard && !ev.target.closest('[data-action]')) {
                openUserSheet(parseInt(userCard.getAttribute('data-user-id'), 10));
                return;
            }
            const clientCard = ev.target.closest('[data-client-id]');
            if (clientCard && !ev.target.closest('[data-action]')) {
                openClientSheet(parseInt(clientCard.getAttribute('data-client-id'), 10));
                return;
            }
            // v4: тап по работнику в дашборде руководителя -> карточка
            const dashWorker = ev.target.closest('[data-dash-user]');
            if (dashWorker && !ev.target.closest('[data-action]')) {
                openUserSummary(parseInt(dashWorker.getAttribute('data-dash-user'), 10));
            }
        });

        // v4: сегменты истории
        document.querySelectorAll('#histSegment .segment__btn').forEach((b) => {
            b.addEventListener('click', () => loadHistory(b.getAttribute('data-hist')));
        });
        const histApply = $('#histApply');
        if (histApply) histApply.addEventListener('click', () => {
            const from = $('#histFrom').value, to = $('#histTo').value;
            if (!from || !to) return;
            state.histRange = [from, to];
            refreshHistory(from, to);
        });
        // v4: назад из матрицы и карточки
        const backMatrix = $('#btnBackMatrix');
        if (backMatrix) backMatrix.addEventListener('click', navBack);
        const backSummary = $('#btnBackSummary');
        if (backSummary) backSummary.addEventListener('click', navBack);

        // Чипы формы нового задания
        document.addEventListener('click', (ev) => {
            const chip = ev.target.closest('[data-chip]');
            if (!chip) return;
            const kind = chip.getAttribute('data-chip');
            chip.classList.toggle('chip--on');
        });

        // v5: меню ☰ работника
        const workerMenuBtn = $('#btnWorkerMenu');
        if (workerMenuBtn) workerMenuBtn.addEventListener('click', openWorkerMenu);
        // v5: меню ☰ руководителя (на трёх его экранах)
        ['#btnManagerMenu', '#btnManagerMenu2', '#btnManagerMenu3', '#btnManagerMenu4'].forEach((sel) => {
            const btn = $(sel);
            if (btn) btn.addEventListener('click', openManagerMenu);
        });
        // v5: сегменты «Активные | Завершённые» на «Заданиях»
        document.querySelectorAll('#tasksSegment .segment__btn').forEach((b) => {
            b.addEventListener('click', () => {
                state.tasksSeg = b.getAttribute('data-tasks-seg');
                loadTasks();
            });
        });

        // Экран ввода часов
        $('#heSame').addEventListener('change', () => {
            const same = $('#heSame').checked;
            $('#heSameHint').hidden = !same;
            if (same && !$('#heSameVal')) {
                const inp = document.createElement('div');
                inp.className = 'he-input-wrap he-input-wrap--top';
                inp.innerHTML = '<input class="he-input" id="heSameVal" inputmode="decimal" value="8">' +
                    '<span class="he-unit">' + escapeHtml(t('hoursUnit')) + '</span>';
                $('#heQuick').before(inp);
                inp.querySelector('#heSameVal').addEventListener('input', renderHoursEntry);
            } else if (!same) {
                const top = document.querySelector('.he-input-wrap--top');
                if (top) top.remove();
            }
            renderHoursEntry();
        });
        $('#heQuick').addEventListener('click', (ev) => {
            const chip = ev.target.closest('[data-quick]');
            if (!chip) return;
            const v = chip.getAttribute('data-quick');
            if ($('#heSame').checked) {
                const top = $('#heSameVal');
                if (top) { top.value = v; renderHoursEntry(); }
            } else {
                const focused = document.activeElement;
                if (focused && focused.classList.contains('he-input')) focused.value = v;
                updateSaveState();
            }
        });
        $('#hePeople').addEventListener('input', (ev) => {
            if (ev.target.classList.contains('he-input')) updateSaveState();
        });
        $('#heReason').addEventListener('input', updateSaveState);
        $('#heDate').addEventListener('change', () => {
            $('#heDateBtn').textContent =
                ($('#heDate').value === todayIso() ? t('today') + ', ' : '') +
                fmtDateHuman($('#heDate').value);
            renderHoursEntry();
        });
        $('#heDateBtn').addEventListener('click', () => $('#heDate').showPicker && $('#heDate').showPicker());
        $('#heSave').addEventListener('click', submitHoursEntry);
        const backHe = $('#btnBackHoursEntry');
        if (backHe) backHe.addEventListener('click', navBack);

        // Форма нового задания
        const form = $('#newTaskForm');
        if (form) form.addEventListener('submit', submitNewTask);
        const clientSel = $('#ntClient');
        if (clientSel) clientSel.addEventListener('change', onClientChange);
        const multi = $('#ntMultiDay');
        if (multi) multi.addEventListener('change', () => {
            $('#ntDateEndField').hidden = !$('#ntMultiDay').checked;
        });

        // Вкладки отчётов
        document.querySelectorAll('#reportsSegment .segment__btn').forEach((b) => {
            b.addEventListener('click', () => {
                state.reportsTab = b.getAttribute('data-reports-tab');
                document.querySelectorAll('#reportsSegment .segment__btn').forEach((x) => {
                    x.classList.toggle('is-active', x === b);
                });
                renderReportsBody();
            });
        });
        // Смена периода в отчётах
        document.addEventListener('change', (ev) => {
            if (ev.target.id === 'repStart' || ev.target.id === 'repEnd') {
                if (state.reportsTab === 'payouts') refreshPayPreview();
                else refreshManagerSummary();
            }
        });

        // v4: сегменты «Люди · Инвентарь» на экране «Сотрудники»
        document.querySelectorAll('#teamSegment .segment__btn').forEach((b) => {
            b.addEventListener('click', () => setTeamTab(b.getAttribute('data-team-tab')));
        });

        // Кнопки шапок экранов
        const newTaskBtn = $('#btnNewTask');
        if (newTaskBtn) newTaskBtn.addEventListener('click', openNewTask);
        const backNew = $('#btnBackNewTask');
        if (backNew) backNew.addEventListener('click', navBack);
        const addWorkerBtn = $('#btnAddWorker');
        if (addWorkerBtn) addWorkerBtn.addEventListener('click', () => {
            const f = $('#teamAddForm');
            if (f) f.hidden = !f.hidden;
        });
        const teamForm = $('#teamAddForm');
        if (teamForm) teamForm.addEventListener('submit', submitTeamAdd);
        const addClientBtn = $('#btnAddClient');
        if (addClientBtn) addClientBtn.addEventListener('click', () => {
            const f = $('#clientAddForm');
            if (f) f.hidden = !f.hidden;
        });
        const clientForm = $('#clientAddForm');
        if (clientForm) clientForm.addEventListener('submit', submitClientAdd);
        const addInvBtn = $('#btnAddItem');
        if (addInvBtn) addInvBtn.addEventListener('click', () => {
            const f = $('#invAddForm');
            if (f) f.hidden = !f.hidden;
        });
        const invForm = $('#invAddForm');
        if (invForm) invForm.addEventListener('submit', submitItemAdd);

    }

    async function doFinishTask(taskId) {
        try {
            await api.updateTask(taskId, { status: 'done' });
            toast(t('taskFinished'), 'success');
            closeSheet();
            state.tasks = null;
            if (state.view === 'manager-dash') loadManagerDash();
            else if (state.view === 'tasks') loadTasks();
            else if (state.view === 'today') loadToday();
            else goBackHome();
        } catch (err) {
            closeSheet();
            toast(err.message, 'error');
        }
    }

    function editTaskSheet(taskId) {
        const task = state.detailTask;
        if (!task || task.id !== taskId) return;
        const sheet = openSheet(
            '<form id="taskEditForm" class="form">' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('taskTitle')) + '</span>' +
            '<input type="text" id="teTitle" value="' + escapeHtml(task.title) + '" required></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('taskDescr')) + '</span>' +
            '<textarea id="teDescr" rows="2">' + escapeHtml(task.description || '') + '</textarea></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('taskDateStart')) + '</span>' +
            '<input type="date" id="teStart" value="' + escapeHtml(task.date_start || '') + '"></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('taskDateEnd')) + '</span>' +
            '<input type="date" id="teEnd" value="' + escapeHtml(task.date_end || '') + '"></label>' +
            '<p class="form-error" id="teError" hidden></p>' +
            '<button type="submit" class="btn btn--primary btn--block">' + escapeHtml(t('save')) + '</button>' +
            '</form>');
        sheet.querySelector('#taskEditForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const errEl = sheet.querySelector('#teError');
            errEl.hidden = true;
            try {
                await api.updateTask(task.id, {
                    title: sheet.querySelector('#teTitle').value.trim(),
                    description: sheet.querySelector('#teDescr').value.trim() || null,
                    date_start: sheet.querySelector('#teStart').value || null,
                    date_end: sheet.querySelector('#teEnd').value || null
                });
                toast(t('saved'), 'success');
                closeSheet();
                state.tasks = null;
                await openTaskSheet(task.id);
            } catch (err) {
                errEl.textContent = err.message;
                errEl.hidden = false;
            }
        });
    }

    async function submitClientAdd(event) {
        event.preventDefault();
        const errEl = $('#clError');
        errEl.hidden = true;
        const name = $('#clName').value.trim();
        if (!name) return;
        const btn = $('#clSubmit');
        btn.disabled = true;
        try {
            await api.createClient({
                name: name,
                notes: $('#clNotes').value.trim() || null
            });
            $('#clientAddForm').hidden = true;
            $('#clName').value = ''; $('#clNotes').value = '';
            btn.disabled = false;
            toast(t('saved'), 'success');
            loadClients();
        } catch (e) {
            btn.disabled = false;
            errEl.textContent = e.message;
            errEl.hidden = false;
        }
    }

    function renderError(message, code, forceLogin) {
        if (!forceLogin && code !== 'not_registered' && code !== 'deactivated') {
            document.querySelectorAll('.screen').forEach((sc) => { sc.hidden = true; });
            const errScreen = $('#screenError');
            errScreen.hidden = false;
            $('#errorMessage').textContent = message || t('network.error');
            const nav = $('#bottomNav');
            if (nav) nav.hidden = true;
            navReset();
            return;
        }
        $('#screenLoading').hidden = true;
        const login = $('#screenLogin');
        login.hidden = false;
        login.querySelector('[data-i18n="loginSubtitle"]').textContent = message;
        // Кнопка «Открыть бота» — только для незарегистрированных (заявка через бота)
        const btn = $('#btnOpenBot');
        if (btn) btn.hidden = code !== 'not_registered';
        const steps = $('#loginSteps');
        if (steps) steps.hidden = code !== 'not_registered';
        navReset();
    }

    /* ========================================================
     * 21. Startup
     * ======================================================== */
    async function init() {
        state.lang = normalizeLang(
            (tg && tg.initDataUnsafe && tg.initDataUnsafe.user &&
                tg.initDataUnsafe.user.language_code) || CONFIG.defaultLang);
        applyI18n();
        bindEvents();
        showScreen('loading');

        if (!tg || !tg.initData) {
            renderError('Откройте приложение через меню бота в Telegram.', null, true);
            return;
        }

        try {
            state.user = await api.getMe();
        } catch (err) {
            // 401 с кодом: понятное сообщение вместо «Проверка данных...»
            if (err.code === 'not_registered') {
                renderError(t('webapp_not_registered'), 'not_registered');
            } else if (err.code === 'deactivated') {
                renderError(t('webapp_deactivated'), 'deactivated');
            } else {
                renderError(err.message || t('network.error'));
            }
            return;
        }
        try {
            if (state.user.lang) {
                state.lang = normalizeLang(state.user.lang);
                applyI18n();
            }
            renderNav();
            await (isManager() ? loadManagerDash() : loadToday());
            // SPEC §22: офлайн-очередь — прогон при старте и при появлении сети
            if (!isManager()) {
                renderOfflineBanner();
                syncQueue();
                window.addEventListener('online', () => { syncQueue(); });
            }
        } catch (err) {
            renderError(err.message || t('network.error'));
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
