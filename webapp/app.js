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
        defaultLang: 'ru'
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
        heCtx: null         // контекст экрана ввода часов
    };

    /* ========================================================
     * 4. i18n — ru / uk / es
     * ======================================================== */
    const I18N = {
        ru: {
            'app.name': 'AgroManager',
            'navDashboard': 'Главная', 'navTasks': 'Задания',
            'navReports': 'Отчёты', 'navTeam': 'Команда',
            'navInventory': 'Инвентарь', 'navMore': 'Ещё',
            'loading': 'Загрузка...',
            'loginTitle': 'Вход',
            'loginSubtitle': 'Проверка данных пользователя...',
            'network.error': 'Ошибка сети. Проверьте подключение.',
            'headerOrg': 'AgroManager',
            'headerMetaRole': '{role} · {date}',
            'role.manager': 'Руководитель', 'role.worker': 'Сотрудник',
            'role.reporter': 'учётчик', 'role.unknown': 'Пользователь',
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
            'dashTeam': 'Команда',
            'dashMyHours': 'Мои часы сегодня: {n} ч',
            'dashEmpty': 'Пока нет заданий. Нажмите «Новое задание», чтобы создать',
            'dashEmptyWorker': 'Пока нет заданий. Ждите, когда руководитель вас назначит',
            'dashToday': 'Сегодня',
            'dashEarned': 'Начислено',
            'dashMyTasksToday': 'Мои задания сегодня',
            'dashNoTasksToday': 'На сегодня заданий нет',
            'dashHoursToday': 'Часы сегодня',
            // --- задания ---
            'tasksTitle': 'Задания', 'tasksNew': 'Новое задание',
            'status.draft': 'черновик', 'status.active': 'активно',
            'status.done': 'завершено', 'status.cancelled': 'отменено',
            'taskClient': 'Заказчик', 'taskLocations': 'Локации',
            'taskWorkers': 'Сотрудники', 'taskDates': 'Даты',
            'taskDescr': 'Описание',
            'whoWorks': 'Кто работает',
            'totalHours': 'Часы всего', 'totalEarned': 'Начислено всего',
            'enterHours': 'Ввести часы',
            'finishTask': 'Завершить задание',
            'editTask': 'Редактировать',
            'notEnteredToday': 'Сегодня не отмечено',
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
            'taskReporter': 'Учётчик',
            'noLocations': 'У этого заказчика нет локаций',
            'noWorkers': 'Нет активных сотрудников',
            'taskNeedsTitle': 'Введите название',
            'taskNeedsClient': 'Выберите заказчика',
            'taskNeedsReporter': 'Выберите учётчика из выбранных сотрудников',
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
            'hoursBad': 'Часы должны быть от 0.25 до 24',
            // --- отчёты ---
            'reportsTitle': 'Отчёты',
            'tabSummary': 'Сводка', 'tabPayouts': 'Выплаты',
            'repPeriod': 'Период',
            'repTasksTotal': 'Заданий всего', 'repTasksActive': 'Активных',
            'repTasksDone': 'Завершённых', 'repHoursTotal': 'Часов всего',
            'repPayroll': 'ФОТ за период',
            'repByWorker': 'По сотрудникам', 'repByClient': 'По заказчикам',
            'repMyHours': 'Мои часы: {n} ч',
            'repMyEarned': 'Начислено', 'repMyHoursLabel': 'Часы',
            'repMyTasks': 'Мои задания за период',
            'repEmpty': 'За период нет данных',
            // --- выплаты ---
            'payPreview': 'Предпросмотр', 'payClose': 'Закрыть период',
            'payAdvance': 'Аванс',
            'payrollClosed': 'Период закрыт, выплаты созданы',
            'payrollEmpty': 'Нет данных за период',
            'colEmployee': 'Сотрудник', 'colHours': 'Часы',
            'colGross': 'Начислено', 'colAdvances': 'Аванс', 'colNet': 'К выплате',
            'payStart': 'Начало', 'payEnd': 'Конец',
            'payCloseConfirm': 'Закрыть период {start} — {end}? После закрытия часы этого периода править нельзя',
            // --- команда ---
            'teamTitle': 'Сотрудники', 'teamAdd': 'Добавить сотрудника',
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
            'inventoryEmpty': 'Пока нет предметов. Нажмите «Добавить», чтобы создать'
        },
        uk: {
            'app.name': 'AgroManager',
            'navDashboard': 'Головна', 'navTasks': 'Завдання',
            'navReports': 'Звіти', 'navTeam': 'Команда',
            'navInventory': 'Інвентар', 'navMore': 'Більше',
            'loading': 'Завантаження...',
            'loginTitle': 'Вхід',
            'loginSubtitle': 'Перевірка даних користувача...',
            'network.error': 'Помилка мережі. Перевірте з\'єднання.',
            'headerOrg': 'AgroManager',
            'headerMetaRole': '{role} · {date}',
            'role.manager': 'Керівник', 'role.worker': 'Працівник',
            'role.reporter': 'обліковець', 'role.unknown': 'Користувач',
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
            'dashTeam': 'Команда',
            'dashMyHours': 'Мої години сьогодні: {n} год',
            'dashEmpty': 'Поки немає завдань. Натисніть «Нове завдання», щоб створити',
            'dashEmptyWorker': 'Поки немає завдань. Чекайте, коли керівник вас призначить',
            'dashToday': 'Сьогодні',
            'dashEarned': 'Нараховано',
            'dashMyTasksToday': 'Мої завдання сьогодні',
            'dashNoTasksToday': 'На сьогодні завдань немає',
            'dashHoursToday': 'Години сьогодні',
            'tasksTitle': 'Завдання', 'tasksNew': 'Нове завдання',
            'status.draft': 'чернетка', 'status.active': 'активне',
            'status.done': 'завершено', 'status.cancelled': 'скасовано',
            'taskClient': 'Замовник', 'taskLocations': 'Локації',
            'taskWorkers': 'Працівники', 'taskDates': 'Дати',
            'taskDescr': 'Опис',
            'whoWorks': 'Хто працює',
            'totalHours': 'Годин разом', 'totalEarned': 'Нараховано разом',
            'enterHours': 'Ввести години',
            'finishTask': 'Завершити завдання',
            'editTask': 'Редагувати',
            'notEnteredToday': 'Сьогодні не відмічено',
            'enteredToday': 'Сьогодні: {n} год',
            'finishConfirm': 'Завдання виконано? Після завершення години можна лише виправляти, з причиною',
            'finish': 'Завершити',
            'taskFinished': 'Завдання завершено',
            'newTaskTitle': 'Нове завдання',
            'taskTitle': 'Назва',
            'taskDateStart': 'Дата',
            'taskDateEnd': 'По дату',
            'taskMultiDay': 'Кілька днів',
            'taskReporter': 'Обліковець',
            'noLocations': 'У цього замовника немає локацій',
            'noWorkers': 'Немає активних працівників',
            'taskNeedsTitle': 'Введіть назву',
            'taskNeedsClient': 'Оберіть замовника',
            'taskNeedsReporter': 'Оберіть обліковця з вибраних працівників',
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
            'hoursBad': 'Години мають бути від 0.25 до 24',
            'reportsTitle': 'Звіти',
            'tabSummary': 'Зведення', 'tabPayouts': 'Виплати',
            'repPeriod': 'Період',
            'repTasksTotal': 'Завдань всього', 'repTasksActive': 'Активних',
            'repTasksDone': 'Завершених', 'repHoursTotal': 'Годин всього',
            'repPayroll': 'ФОП за період',
            'repByWorker': 'За працівниками', 'repByClient': 'За замовниками',
            'repMyHours': 'Мої години: {n} год',
            'repMyEarned': 'Нараховано', 'repMyHoursLabel': 'Години',
            'repMyTasks': 'Мої завдання за період',
            'repEmpty': 'За період немає даних',
            'payPreview': 'Попередній перегляд', 'payClose': 'Закрити період',
            'payAdvance': 'Аванс',
            'payrollClosed': 'Період закрито, виплати створено',
            'payrollEmpty': 'Немає даних за період',
            'colEmployee': 'Працівник', 'colHours': 'Години',
            'colGross': 'Нараховано', 'colAdvances': 'Аванс', 'colNet': 'До виплати',
            'payStart': 'Початок', 'payEnd': 'Кінець',
            'payCloseConfirm': 'Закрити період {start} — {end}? Після закриття години цього періоду виправляти не можна',
            'teamTitle': 'Працівники', 'teamAdd': 'Додати працівника',
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
            'inventoryEmpty': 'Поки немає предметів. Натисніть «Додати», щоб створити'
        },
        es: {
            'app.name': 'AgroManager',
            'navDashboard': 'Inicio', 'navTasks': 'Tareas',
            'navReports': 'Informes', 'navTeam': 'Equipo',
            'navInventory': 'Inventario', 'navMore': 'Más',
            'loading': 'Cargando...',
            'loginTitle': 'Entrar',
            'loginSubtitle': 'Comprobando datos del usuario...',
            'network.error': 'Error de red. Compruebe la conexión.',
            'headerOrg': 'AgroManager',
            'headerMetaRole': '{role} · {date}',
            'role.manager': 'Gerente', 'role.worker': 'Trabajador',
            'role.reporter': 'encargado', 'role.unknown': 'Usuario',
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
            'dashTeam': 'Equipo',
            'dashMyHours': 'Mis horas hoy: {n} h',
            'dashEmpty': 'Aún no hay tareas. Pulse «Nueva tarea» para crear una',
            'dashEmptyWorker': 'Aún no hay tareas. Espere a que el gerente le asigne',
            'dashToday': 'Hoy',
            'dashEarned': 'Acumulado',
            'dashMyTasksToday': 'Mis tareas de hoy',
            'dashNoTasksToday': 'No hay tareas para hoy',
            'dashHoursToday': 'Horas hoy',
            'tasksTitle': 'Tareas', 'tasksNew': 'Nueva tarea',
            'status.draft': 'borrador', 'status.active': 'activa',
            'status.done': 'terminada', 'status.cancelled': 'cancelada',
            'taskClient': 'Cliente', 'taskLocations': 'Ubicaciones',
            'taskWorkers': 'Empleados', 'taskDates': 'Fechas',
            'taskDescr': 'Descripción',
            'whoWorks': 'Quién trabaja',
            'totalHours': 'Horas totales', 'totalEarned': 'Total acumulado',
            'enterHours': 'Registrar horas',
            'finishTask': 'Terminar tarea',
            'editTask': 'Editar',
            'notEnteredToday': 'Hoy sin registrar',
            'enteredToday': 'Hoy: {n} h',
            'finishConfirm': '¿Tarea terminada? Después solo se pueden corregir las horas, con motivo',
            'finish': 'Terminar',
            'taskFinished': 'Tarea terminada',
            'newTaskTitle': 'Nueva tarea',
            'taskTitle': 'Título',
            'taskDateStart': 'Fecha',
            'taskDateEnd': 'Hasta',
            'taskMultiDay': 'Varios días',
            'taskReporter': 'Encargado del registro',
            'noLocations': 'Este cliente no tiene ubicaciones',
            'noWorkers': 'No hay empleados activos',
            'taskNeedsTitle': 'Introduzca el título',
            'taskNeedsClient': 'Elija un cliente',
            'taskNeedsReporter': 'Elija el encargado entre los empleados seleccionados',
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
            'hoursBad': 'Las horas deben ser de 0.25 a 24',
            'reportsTitle': 'Informes',
            'tabSummary': 'Resumen', 'tabPayouts': 'Pagos',
            'repPeriod': 'Período',
            'repTasksTotal': 'Tareas totales', 'repTasksActive': 'Activas',
            'repTasksDone': 'Terminadas', 'repHoursTotal': 'Horas totales',
            'repPayroll': 'Nómina del período',
            'repByWorker': 'Por empleados', 'repByClient': 'Por clientes',
            'repMyHours': 'Mis horas: {n} h',
            'repMyEarned': 'Acumulado', 'repMyHoursLabel': 'Horas',
            'repMyTasks': 'Mis tareas del período',
            'repEmpty': 'Sin datos para el período',
            'payPreview': 'Vista previa', 'payClose': 'Cerrar período',
            'payAdvance': 'Adelanto',
            'payrollClosed': 'Período cerrado, pagos creados',
            'payrollEmpty': 'Sin datos para el período',
            'colEmployee': 'Empleado', 'colHours': 'Horas',
            'colGross': 'Acumulado', 'colAdvances': 'Adelantos', 'colNet': 'A pagar',
            'payStart': 'Inicio', 'payEnd': 'Fin',
            'payCloseConfirm': '¿Cerrar el período {start} — {end}? Después no se podrán corregir las horas de este período',
            'teamTitle': 'Empleados', 'teamAdd': 'Añadir empleado',
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
            'inventoryEmpty': 'Aún no hay artículos. Pulse «Añadir» para crear uno'
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

    function fmtHours(v) {
        const n = num(v);
        return (n % 1 === 0) ? String(n) : n.toFixed(2).replace(/0$/, '');
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
     * 7. API client (initData + X-Actor-Id)
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
            if (state.user && state.user.id) headers['X-Actor-Id'] = String(state.user.id);
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
                throw new Error(detail);
            }
            return data;
        },
        getMe() { return this.request('/users/me'); },
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
        createGroup(taskId, reporterId, memberIds) {
            return this.request('/tasks/' + entry_id(taskId) + '/groups',
                { method: 'POST', body: { reporter_id: entry_id(reporterId), member_ids: memberIds.map(entry_id) } });
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
        }
    };

    /* ========================================================
     * 8. Роутер: showScreen + renderNav по роли
     * ======================================================== */
    function renderNav() {
        const manager = isManager();
        document.querySelectorAll('.bottom-nav__item').forEach((btn) => {
            const target = btn.getAttribute('data-nav-target');
            if (target === 'team') btn.hidden = !manager;
            if (target === 'inventory') btn.hidden = manager;
        });
    }

    function showScreen(name) {
        document.querySelectorAll('.screen').forEach((s) => {
            s.hidden = s.getAttribute('data-screen-name') !== name;
        });
        document.querySelectorAll('.bottom-nav__item').forEach((b) => {
            b.classList.toggle('is-active', b.getAttribute('data-nav-target') === name);
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
            meta.textContent = t('headerMetaRole', {
                role: roleLabel(state.user), date: dateStr
            });
        }
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
            escapeHtml(w.name) + (w.is_reporter
                ? ' <span class="badge badge--reporter">' + escapeHtml(t('role.reporter')) + '</span>'
                : '')
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
            '<div class="card-sub"><span class="badge badge--' + escapeHtml(task.status) + '">' +
            escapeHtml(statusLabel(task.status)) + '</span>' +
            (hoursToday > 0
                ? '<span class="card-hours">' + escapeHtml(fmtHours(hoursToday)) + ' ' + escapeHtml(t('hoursUnit')) + '</span>'
                : '') +
            '</div>' +
            enteredLine + enterBtn +
            '</div>';
    }

    async function loadDashboard() {
        showScreen('loading');
        try {
            const [tasks, entries] = await Promise.all([api.getTasks(), api.getMyEntries()]);
            state.tasks = tasks;
            state.entries = entries;
            renderDashboard();
        } catch (err) { renderError(err.message); }
    }

    function renderDashboard() {
        const body = $('#dashboardBody');
        const today = todayIso();
        const myToday = (state.entries || [])
            .filter((e) => e.work_date === today)
            .reduce((s, e) => s + num(e.hours), 0);

        if (isManager()) {
            const tasks = state.tasks || [];
            const cards = tasks.map((tk) => taskCardHtml(tk, { canEnter: true })).join('');
            const empty = tasks.length
                ? ''
                : '<div class="empty"><div class="empty__text">' + escapeHtml(t('dashEmpty')) + '</div></div>';
            body.innerHTML =
                '<h2>' + escapeHtml(t('dashActiveTasks')) + '</h2>' +
                '<div class="list">' + cards + empty + '</div>' +
                '<div class="stat-row stat-row--2">' +
                statCell(t('dashWeek'), tasks.length, 0) +
                statCell(t('dashWeek'), 0, 0, true) +
                statCell(t('dashMonth'), tasks.length, 0) +
                statCell(t('dashMonth'), 0, 0, true) +
                '</div>' +
                '<div class="grid2x2">' +
                '<button class="btn btn--primary grid2x2__wide" data-action="new-task">' + escapeHtml(t('dashNewTask')) + '</button>' +
                '<button class="btn btn--ghost grid2x2__cell" data-action="go-clients">' + escapeHtml(t('dashClients')) + '</button>' +
                '<button class="btn btn--ghost grid2x2__cell" data-action="go-inventory">' + escapeHtml(t('dashInventory')) + '</button>' +
                '<button class="btn btn--ghost grid2x2__cell" data-action="go-team">' + escapeHtml(t('dashTeam')) + '</button>' +
                '</div>' +
                (myToday > 0
                    ? '<p class="muted my-hours">' + escapeHtml(t('dashMyHours', { n: fmtHours(myToday) })) + '</p>'
                    : '');
        } else {
            const myTasks = (state.tasks || []).filter((tk) =>
                (tk.workers || []).some((w) => w.user_id === state.user.id));
            const cards = myTasks.map((tk) => taskCardHtml(tk)).join('');
            body.innerHTML =
                '<div class="stat-row stat-row--2">' +
                '<div class="stat"><span class="stat__value">' + escapeHtml(fmtHours(myToday)) + '</span>' +
                '<span class="stat__label">' + escapeHtml(t('dashHoursToday')) + '</span></div>' +
                '<div class="stat"><span class="stat__value">' + escapeHtml(Number(state.user.total_earned || 0).toFixed(2)) + '</span>' +
                '<span class="stat__label">' + escapeHtml(t('dashEarned')) + '</span></div>' +
                '</div>' +
                '<h2>' + escapeHtml(t('dashMyTasksToday')) + '</h2>' +
                '<div class="list">' +
                (myTasks.length ? cards
                    : '<div class="empty"><div class="empty__text">' + escapeHtml(t('dashNoTasksToday')) + '</div></div>') +
                '</div>';
        }
        showScreen('dashboard');
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
        $('#btnNewTask').hidden = !isManager();
        try {
            state.tasks = await api.getTasks();
            renderTasks();
        } catch (err) {
            setList('tasksList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>');
        }
    }

    function renderTasks() {
        const tasks = state.tasks || [];
        if (!tasks.length) {
            setList('tasksList', '<div class="empty"><div class="empty__text">' +
                escapeHtml(isManager() ? t('dashEmpty') : t('dashEmptyWorker')) + '</div></div>');
            return;
        }
        setList('tasksList', tasks.map((tk) => taskCardHtml(tk, { canEnter: true })).join(''));
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
            const reporter = !manager && (task.groups || []).some(
                (g) => g.reporter && g.reporter.id === state.user.id);
            const canEnter = (manager || reporter) && task.status === 'active';

            const workers = (task.assignments || []).map((a) => {
                const isRep = (task.groups || []).some(
                    (g) => g.reporter && g.reporter.id === a.user.id);
                const su = summary && summary.by_user.find(
                    (u) => u.user_id === a.user.id);
                return '<div class="row-line">' + avatarHtml(a.user.id, a.user.name) +
                    '<span class="row-line__name">' + escapeHtml(a.user.name) +
                    (isRep ? ' <span class="badge badge--reporter">' + escapeHtml(t('role.reporter')) + '</span>' : '') +
                    '</span>' +
                    (su ? '<span class="row-line__meta">' + escapeHtml(fmtHours(su.total_hours)) + ' ' +
                        escapeHtml(t('hoursUnit')) + '</span>' : '') +
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
                '<span class="row-line__meta">' + escapeHtml(fmtHours(totalHours)) + ' ' + escapeHtml(t('hoursUnit')) + '</span></div>' +
                '<div class="row-line"><span>' + escapeHtml(t('totalEarned')) + '</span>' +
                '<span class="row-line__meta">' + escapeHtml(totalEarned.toFixed(2)) + '</span></div>' +
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
     * 12. ЭКРАН «ВВЕСТИ ЧАСЫ» (полноэкранный)
     * ======================================================== */
    async function openHoursEntry(taskId) {
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
                // Групповой ввод: одна цифра на бригаду учётчика.
                // Руководитель вносит индивидуально каждому.
                if (isManager()) {
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
                    const group = (ctx.task.groups || []).find(
                        (g) => g.reporter && g.reporter.id === state.user.id);
                    if (!group) throw new Error(t('error'));
                    await api.request('/work-entries/group', {
                        method: 'POST',
                        body: {
                            group_id: group.id, work_date: date,
                            hours: v.value.toFixed(2)
                        }
                    });
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
            showScreen(state.view === 'hours-entry' ? 'dashboard' : state.view);
            await openTaskSheet(tid);
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
            btn.disabled = false;
            updateSaveState();
        }
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

    function renderReporterChips() {
        const box = $('#ntReporter');
        const workerChips = Array.from(
            document.querySelectorAll('#ntWorkers [data-chip="worker"]'));
        const selected = workerChips.filter((c) => c.classList.contains('chip--on'));
        const current = document.querySelector('#ntReporter .chip--on');
        const currentId = current ? parseInt(current.getAttribute('data-id'), 10) : null;
        $('#ntReporterField').hidden = !selected.length;
        box.innerHTML = selected.map((c) => {
            const id = parseInt(c.getAttribute('data-id'), 10);
            const name = c.textContent;
            return chipHtml('reporter', id, name, id === currentId);
        }).join('');
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
            $('#ntReporterField').hidden = true;
            $('#ntReporter').innerHTML = '';
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
        const repChip = document.querySelector('#ntReporter .chip--on');
        const reporterId = repChip ? parseInt(repChip.getAttribute('data-id'), 10) : null;

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
            if (reporterId) {
                if (!workerIds.includes(reporterId)) {
                    await api.assignUser(task.id, reporterId);
                }
                await api.createGroup(task.id, reporterId, workerIds.filter((w) => w !== reporterId));
            }
            state.tasks = null;
            btn.disabled = false;
            btn.textContent = t('create');
            toast(t('taskCreated'), 'success');
            loadTasks();
        } catch (err) {
            btn.disabled = false;
            btn.textContent = t('create');
            ntError(err.message);
        }
    }

    /* ========================================================
     * 14. ОТЧЁТЫ: две вкладки (Сводка | Выплаты)
     * ======================================================== */
    async function loadReports() {
        showScreen('reports');
        $('#reportsSegment [data-reports-tab="payouts"]').hidden = !isManager();
        state.reportsTab = 'summary';
        document.querySelectorAll('#reportsSegment .segment__btn').forEach((b) => {
            b.classList.toggle('is-active', b.getAttribute('data-reports-tab') === 'summary');
        });
        renderReportsBody();
    }

    function renderReportsBody() {
        const body = $('#reportsBody');
        body.innerHTML = '<div class="skeleton skeleton--card"></div>';
        if (state.reportsTab === 'payouts') renderPayoutsTab(body);
        else if (isManager()) renderManagerSummary(body);
        else renderWorkerSummary(body);
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

    async function renderWorkerSummary(body) {
        const [ws, we] = weekRange();
        body.innerHTML = periodPickerHtml(ws, we) + '<div id="repData"></div>';
        await refreshWorkerSummary();
    }

    async function refreshWorkerSummary() {
        const start = $('#repStart').value;
        const end = $('#repEnd').value;
        const box = $('#repData');
        box.innerHTML = '<div class="skeleton skeleton--card"></div>';
        try {
            const rep = await api.reportUser(state.user.id, start, end);
            const hours = num(rep.total_hours);
            const earned = num(rep.total_earned);
            box.innerHTML =
                '<div class="stat-row stat-row--2">' +
                '<div class="stat"><span class="stat__value">' + escapeHtml(fmtHours(hours)) + '</span>' +
                '<span class="stat__label">' + escapeHtml(t('repMyHoursLabel')) + '</span></div>' +
                '<div class="stat"><span class="stat__value">' + earned.toFixed(2) + '</span>' +
                '<span class="stat__label">' + escapeHtml(t('repMyEarned')) + '</span></div>' +
                '</div>' +
                '<h3 class="sheet__h3">' + escapeHtml(t('repMyTasks')) + '</h3>' +
                ((rep.days || []).length
                    ? rep.days.map((d) =>
                        '<div class="row-line"><span>' + escapeHtml(d.task) +
                        (d.location ? ' · ' + escapeHtml(d.location) : '') + '</span>' +
                        '<span class="row-line__meta">' + escapeHtml(fmtDateHuman(d.date)) + ' · ' +
                        escapeHtml(fmtHours(d.hours)) + ' ' + escapeHtml(t('hoursUnit')) + '</span></div>').join('')
                    : '<p class="screen-message">' + escapeHtml(t('repEmpty')) + '</p>');
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
            '<button class="btn btn--danger" data-action="pay-close">' + escapeHtml(t('payClose')) + '</button>' +
            '</div>' +
            '<div id="payData"></div>' +
            '<h3 class="sheet__h3">' + escapeHtml(t('payAdvance')) + '</h3>' +
            '<div id="advData"></div>';
        await refreshPayPreview();
        renderAdvanceForm();
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

    async function closePayroll() {
        const start = $('#repStart').value;
        const end = $('#repEnd').value;
        if (!start || !end) return;
        const sheet = openSheet(
            '<p class="screen-message">' + escapeHtml(
                t('payCloseConfirm', { start: start, end: end })) + '</p>' +
            '<div class="sheet__actions">' +
            '<button class="btn btn--primary btn--block" data-action="pay-close-yes">' + escapeHtml(t('payClose')) + '</button>' +
            '<button class="btn btn--ghost btn--block" data-action="close-sheet">' + escapeHtml(t('cancel')) + '</button>' +
            '</div>');
    }

    async function closePayrollYes() {
        const start = $('#repStart').value;
        const end = $('#repEnd').value;
        try {
            const payouts = await api.payClose({
                period_start: start, period_end: end, created_by: state.user.id
            });
            toast(t('payrollClosed') + ' (' + (payouts ? payouts.length : 0) + ')', 'success');
            closeSheet();
            await refreshPayPreview();
        } catch (err) {
            closeSheet();
            toast(err.message, 'error');
        }
    }

    function renderAdvanceForm() {
        const box = $('#advData');
        const users = state.users || [];
        box.innerHTML =
            '<div class="form-row">' +
            '<select id="advUser">' +
            users.map((u) => '<option value="' + u.id + '">' + escapeHtml(u.name) + '</option>').join('') +
            '</select>' +
            '<input type="number" id="advAmount" min="0" step="0.01" placeholder="0.00">' +
            '</div>' +
            '<button class="btn btn--ghost btn--block" data-action="pay-advance">' + escapeHtml(t('payAdvance')) + '</button>';
    }

    async function createAdvance() {
        const userId = parseInt($('#advUser').value, 10);
        const amount = parseFloat($('#advAmount').value);
        if (!userId || !(amount > 0)) return;
        try {
            await api.createAdvance({
                user_id: userId, amount: amount.toFixed(2),
                date: todayIso(), created_by: state.user.id
            });
            toast(t('saved'), 'success');
            $('#advAmount').value = '';
            await refreshPayPreview();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    /* ========================================================
     * 15. КОМАНДА: строки тапаются -> лист редактирования
     * ======================================================== */
    async function loadTeam() {
        showScreen('team');
        $('#btnAddWorker').hidden = !isManager();
        try {
            state.users = await api.getUsers();
            renderTeam();
        } catch (err) {
            setList('teamList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>');
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
     * 17. ИНВЕНТАРЬ: выдача через выбор сотрудника из списка
     * ======================================================== */
    async function loadInventory() {
        showScreen('inventory');
        $('#btnAddItem').hidden = !isManager();
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
     * 18. ПРОФИЛЬ (bottom sheet из «Ещё»)
     * ======================================================== */
    async function openProfileSheet() {
        const sheet = openSheet('<p class="screen-message">' + escapeHtml(t('loading')) + '</p>');
        try {
            const inv = await api.getInventory();
            const mine = (inv || []).filter((i) => i.holder && i.holder.id === state.user.id);
            sheet.innerHTML =
                '<div class="row-line">' + avatarHtml(state.user.id, state.user.name) +
                '<span class="row-line__name">' + escapeHtml(state.user.name) + '</span></div>' +
                '<div class="card-sub"><span>' + escapeHtml(t('profile.role')) + ': ' +
                escapeHtml(roleLabel(state.user)) + '</span>' +
                '<span>' + escapeHtml(t('workerRate')) + ': ' +
                escapeHtml(Number(state.user.hourly_rate || 0).toFixed(2)) + '</span></div>' +
                '<h3 class="sheet__h3">' + escapeHtml(t('profileInventory')) + '</h3>' +
                (mine.length
                    ? mine.map((i) =>
                        '<div class="row-line"><span>' + escapeHtml(i.name) + '</span></div>').join('')
                    : '<p class="screen-message">' + escapeHtml(t('profileNoInventory')) + '</p>') +
                '<button class="btn btn--ghost btn--block" data-action="close-sheet">' + escapeHtml(t('close')) + '</button>';
        } catch (err) {
            sheet.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
        }
    }

    /* ========================================================
     * 19. «Ещё» — bottom sheet
     * ======================================================== */
    function openMoreSheet() {
        const manager = isManager();
        const items = [];
        if (manager) {
            items.push(['go-clients', t('navClients')]);
            items.push(['go-inventory', t('navInventory')]);
        }
        items.push(['go-profile', t('profileTitle')]);
        openSheet(
            '<div class="list">' +
            items.map(([act, label]) =>
                '<button class="row-line row-line--btn" data-action="' + act + '">' +
                '<span class="row-line__name">' + escapeHtml(label) + '</span></button>').join('') +
            '</div>');
    }

    /* ========================================================
     * 20. Events
     * ======================================================== */
    function bindEvents() {
        document.querySelectorAll('.bottom-nav__item[data-nav-target]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-nav-target');
                if (target === 'dashboard') loadDashboard();
                else if (target === 'tasks') loadTasks();
                else if (target === 'reports') loadReports();
                else if (target === 'team') loadTeam();
                else if (target === 'inventory') loadInventory();
                else if (target === 'more') openMoreSheet();
            });
        });

        // Делегированные клики по data-action
        document.addEventListener('click', (ev) => {
            const btn = ev.target.closest('[data-action]');
            if (btn) {
                const action = btn.getAttribute('data-action');
                const id = btn.getAttribute('data-id');
                if (action === 'new-task') openNewTask();
                else if (action === 'go-clients') { closeSheet(); loadClients(); }
                else if (action === 'go-inventory') { closeSheet(); loadInventory(); }
                else if (action === 'go-team') { closeSheet(); loadTeam(); }
                else if (action === 'go-profile') { closeSheet(); openProfileSheet(); }
                else if (action === 'enter-hours') openHoursEntry(parseInt(id, 10));
                else if (action === 'finish-task') finishTask(parseInt(id, 10));
                else if (action === 'finish-task-yes') doFinishTask(parseInt(id, 10));
                else if (action === 'edit-task') editTaskSheet(parseInt(id, 10));
                else if (action === 'close-sheet') closeSheet();
                else if (action === 'pay-preview') refreshPayPreview();
                else if (action === 'pay-close') closePayroll();
                else if (action === 'pay-close-yes') closePayrollYes();
                else if (action === 'pay-advance') createAdvance();
                else if (action === 'assign-item') openAssignSheet(parseInt(id, 10));
                else if (action === 'assign-to') {
                    assignTo(parseInt(btn.getAttribute('data-item'), 10),
                        parseInt(btn.getAttribute('data-user'), 10));
                }
                else if (action === 'return-item') returnItem(parseInt(id, 10));
                return;
            }

            // Тап по карточке задания (кроме кнопки внутри)
            const taskCard = ev.target.closest('[data-task-id]');
            if (taskCard && !ev.target.closest('[data-action]')) {
                openTaskSheet(parseInt(taskCard.getAttribute('data-task-id'), 10));
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
            }
        });

        // Чипы формы нового задания
        document.addEventListener('click', (ev) => {
            const chip = ev.target.closest('[data-chip]');
            if (!chip) return;
            const kind = chip.getAttribute('data-chip');
            if (kind === 'reporter') {
                // радио: ровно один учётчик
                const was = chip.classList.contains('chip--on');
                document.querySelectorAll('#ntReporter [data-chip="reporter"]')
                    .forEach((c) => c.classList.remove('chip--on'));
                if (!was) chip.classList.add('chip--on');
            } else {
                chip.classList.toggle('chip--on');
                if (kind === 'worker') renderReporterChips();
            }
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
        if (backHe) backHe.addEventListener('click', () => {
            const tid = state.heCtx ? state.heCtx.task.id : null;
            state.heCtx = null;
            if (tid) openTaskSheet(tid);
            else loadDashboard();
        });

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
                else if (isManager()) refreshManagerSummary();
                else refreshWorkerSummary();
            }
        });

        // Кнопки шапок экранов
        const newTaskBtn = $('#btnNewTask');
        if (newTaskBtn) newTaskBtn.addEventListener('click', openNewTask);
        const backNew = $('#btnBackNewTask');
        if (backNew) backNew.addEventListener('click', loadTasks);
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

        const lang = $('#langSelect');
        if (lang) lang.addEventListener('change', () => {
            state.lang = normalizeLang(lang.value);
            applyI18n();
            if (state.view === 'dashboard') renderDashboard();
            else if (state.view === 'tasks') renderTasks();
            else if (state.view === 'team') renderTeam();
            else if (state.view === 'clients') renderClients();
            else if (state.view === 'inventory') renderInventory();
        });
    }

    async function doFinishTask(taskId) {
        try {
            await api.updateTask(taskId, { status: 'done' });
            toast(t('taskFinished'), 'success');
            closeSheet();
            state.tasks = null;
            if (state.view === 'dashboard') loadDashboard();
            else loadTasks();
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

    function renderError(message) {
        $('#screenLoading').hidden = true;
        const login = $('#screenLogin');
        login.hidden = false;
        login.querySelector('[data-i18n="loginSubtitle"]').textContent = message;
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
            renderError('Откройте приложение через меню бота в Telegram.');
            return;
        }

        try {
            state.user = await api.getMe();
            if (state.user.lang) {
                state.lang = normalizeLang(state.user.lang);
                applyI18n();
                const lang = $('#langSelect');
                if (lang) lang.value = state.lang;
            }
            renderNav();
            await loadDashboard();
        } catch (err) {
            renderError(err.message || t('network.error'));
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
