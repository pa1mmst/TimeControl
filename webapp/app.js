/* ============================================================
 * Time Control — Telegram Mini App
 * File: webapp/app.js
 *
 * Полная логика: авторизация через /api/users/me (HMAC initData),
 * нижнее меню, экраны: главная, задания, часы, отчёты, профиль,
 * + разделы руководителя («Ещё»): сотрудники, заказчики,
 * инвентарь, выплаты.
 * Шаг 2: форма «Новое задание» — цепочка fetch:
 *   POST /tasks -> POST /tasks/{id}/assignments -> POST /tasks/{id}/groups
 * Шаг 3: форма «Ввод часов»:
 *   работник за себя  -> POST /work-entries
 *   учётчик за группу -> POST /work-entries/group (exclude_user_ids)
 *
 * API base относительный ("/api"), работает на любом домене.
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
        user: null,          // ответ /users/me
        view: 'loading',
        tasks: null,
        entries: null,
        clients: null,       // кэш заказчиков для формы задания
        users: null,         // кэш сотрудников для формы задания
        myGroups: null       // группы, где текущий пользователь — учётчик
    };

    /* ========================================================
     * 4. i18n — ru / uk / es
     * ======================================================== */
    const I18N = {
        ru: {
            'app.name': 'AgroManager',
            'navDashboard': 'Главная', 'navTasks': 'Задания', 'navHours': 'Часы',
            'navReports': 'Отчёты', 'navProfile': 'Профиль', 'navMore': 'Ещё',
            'navTeam': 'Сотрудники', 'navClients': 'Заказчики',
            'navInventory': 'Инвентарь', 'navPayments': 'Выплаты',
            'loading': 'Загрузка...',
            'loginTitle': 'Вход',
            'network.error': 'Ошибка сети. Проверьте подключение.',
            'coming.soon': 'Раздел в разработке',
            'dashboardTitle': 'Главная',
            'statActiveTasks': 'Активных заданий',
            'statHoursToday': 'Часов за сегодня',
            'statEarned': 'Начислено',
            'tasksTitle': 'Задания', 'hoursTitle': 'Рабочие часы',
            'reportsTitle': 'Отчёты', 'profileTitle': 'Профиль',
            'teamTitle': 'Сотрудники', 'clientsTitle': 'Заказчики',
            'inventoryTitle': 'Инвентарь', 'paymentsTitle': 'Выплаты',
            'back': '← Назад',
            'role.manager': 'Руководитель', 'role.worker': 'Сотрудник',
            'role.reporter': 'Учётчик', 'role.unknown': 'Пользователь',
            'profile.name': 'Имя', 'profile.role': 'Роль',
            'profile.rate': 'Ставка', 'profile.hours': 'Всего часов',
            'profile.earned': 'Всего начислено', 'profile.lang': 'Язык',
            'empty': 'Пока пусто', 'error': 'Ошибка',
            // --- Шаг 2: форма «Новое задание» ---
            'newTaskTitle': 'Новое задание',
            'taskTitle': 'Название',
            'taskDescr': 'Описание',
            'taskClient': 'Заказчик',
            'taskLocations': 'Локации',
            'taskDateStart': 'Начало',
            'taskDateEnd': 'Конец',
            'taskWorkers': 'Сотрудники',
            'taskReporter': 'Учётчик (необязательно)',
            'taskGroupMembers': 'Участники группы учётчика',
            'save': 'Создать',
            'saving': 'Сохранение...',
            'taskCreated': 'Задание создано',
            'noLocations': 'У этого заказчика нет локаций',
            'noWorkers': 'Нет активных сотрудников',
            'selectClientFirst': 'Сначала выберите заказчика',
            'pickReporterFirst': 'Сначала выберите учётчика',
            'taskNeedsClient': 'Выберите заказчика',
            'taskNeedsTitle': 'Введите название',
            'groupOf': 'Группа',
            // --- Шаг 3: форма «Ввод часов» ---
            'hoursNewTitle': 'Ввод часов',
            'hoursTask': 'Задание',
            'hoursDate': 'Дата',
            'hoursHours': 'Часы',
            'hoursLocation': 'Локация (необязательно)',
            'hoursMode': 'Кого записываем',
            'modeSelf': 'Себя',
            'modeGroup': 'Группа (учётчик)',
            'groupExclude': 'Не работал(и) в этот день — отметить',
            'hoursCreated': 'Часы записаны',
            'groupCreated': 'Часы записаны группе',
            'hoursNeedsTask': 'Выберите задание',
            'hoursNeedsHours': 'Введите часы (0.25–24)',
            'noReporterGroups': 'Вы не учётчик ни в одной группе',
            'skippedLine': 'Пропущены'
        },
        uk: {
            'navDashboard': 'Головна', 'navTasks': 'Завдання', 'navHours': 'Години',
            'navReports': 'Звіти', 'navProfile': 'Профіль', 'navMore': 'Більше',
            'navTeam': 'Працівники', 'navClients': 'Замовники',
            'navInventory': 'Інвентар', 'navPayments': 'Виплати',
            'loading': 'Завантаження...',
            'loginTitle': 'Вхід',
            'network.error': 'Помилка мережі. Перевірте з\'єднання.',
            'coming.soon': 'Розділ у розробці',
            'dashboardTitle': 'Головна',
            'statActiveTasks': 'Активних завдань',
            'statHoursToday': 'Годин за сьогодні',
            'statEarned': 'Нараховано',
            'tasksTitle': 'Завдання', 'hoursTitle': 'Робочі години',
            'reportsTitle': 'Звіти', 'profileTitle': 'Профіль',
            'teamTitle': 'Працівники', 'clientsTitle': 'Замовники',
            'inventoryTitle': 'Інвентар', 'paymentsTitle': 'Виплати',
            'back': '← Назад',
            'role.manager': 'Керівник', 'role.worker': 'Працівник',
            'role.reporter': 'Обліковець', 'role.unknown': 'Користувач',
            'profile.name': 'Ім\'я', 'profile.role': 'Роль',
            'profile.rate': 'Ставка', 'profile.hours': 'Всього годин',
            'profile.earned': 'Всього нараховано', 'profile.lang': 'Мова',
            'empty': 'Поки порожньо', 'error': 'Помилка',
            'newTaskTitle': 'Нове завдання',
            'taskTitle': 'Назва',
            'taskDescr': 'Опис',
            'taskClient': 'Замовник',
            'taskLocations': 'Локації',
            'taskDateStart': 'Початок',
            'taskDateEnd': 'Кінець',
            'taskWorkers': 'Працівники',
            'taskReporter': 'Обліковець (необов\'язково)',
            'taskGroupMembers': 'Учасники групи обліковця',
            'save': 'Створити',
            'saving': 'Збереження...',
            'taskCreated': 'Завдання створено',
            'noLocations': 'У цього замовника немає локацій',
            'noWorkers': 'Немає активних працівників',
            'selectClientFirst': 'Спочатку оберіть замовника',
            'pickReporterFirst': 'Спочатку оберіть обліковця',
            'taskNeedsClient': 'Оберіть замовника',
            'taskNeedsTitle': 'Введіть назву',
            'groupOf': 'Група',
            'hoursNewTitle': 'Введення годин',
            'hoursTask': 'Завдання',
            'hoursDate': 'Дата',
            'hoursHours': 'Години',
            'hoursLocation': 'Локація (необов\'язково)',
            'hoursMode': 'Кому записуємо',
            'modeSelf': 'Собі',
            'modeGroup': 'Група (обліковець)',
            'groupExclude': 'Не працював(и) цього дня — позначити',
            'hoursCreated': 'Години записано',
            'groupCreated': 'Години записано групі',
            'hoursNeedsTask': 'Оберіть завдання',
            'hoursNeedsHours': 'Введіть години (0.25–24)',
            'noReporterGroups': 'Ви не обліковець ні в одній групі',
            'skippedLine': 'Пропущено'
        },
        es: {
            'navDashboard': 'Inicio', 'navTasks': 'Tareas', 'navHours': 'Horas',
            'navReports': 'Informes', 'navProfile': 'Perfil', 'navMore': 'Más',
            'navTeam': 'Empleados', 'navClients': 'Clientes',
            'navInventory': 'Inventario', 'navPayments': 'Pagos',
            'loading': 'Cargando...',
            'loginTitle': 'Entrar',
            'network.error': 'Error de red. Compruebe la conexión.',
            'coming.soon': 'Sección en desarrollo',
            'dashboardTitle': 'Inicio',
            'statActiveTasks': 'Tareas activas',
            'statHoursToday': 'Horas hoy',
            'statEarned': 'Acumulado',
            'tasksTitle': 'Tareas', 'hoursTitle': 'Horas de trabajo',
            'reportsTitle': 'Informes', 'profileTitle': 'Perfil',
            'teamTitle': 'Empleados', 'clientsTitle': 'Clientes',
            'inventoryTitle': 'Inventario', 'paymentsTitle': 'Pagos',
            'back': '← Atrás',
            'role.manager': 'Gerente', 'role.worker': 'Trabajador',
            'role.reporter': 'Encargado', 'role.unknown': 'Usuario',
            'profile.name': 'Nombre', 'profile.role': 'Rol',
            'profile.rate': 'Tarifa', 'profile.hours': 'Horas totales',
            'profile.earned': 'Total acumulado', 'profile.lang': 'Idioma',
            'empty': 'Aún vacío', 'error': 'Error',
            'newTaskTitle': 'Nueva tarea',
            'taskTitle': 'Título',
            'taskDescr': 'Descripción',
            'taskClient': 'Cliente',
            'taskLocations': 'Ubicaciones',
            'taskDateStart': 'Inicio',
            'taskDateEnd': 'Fin',
            'taskWorkers': 'Empleados',
            'taskReporter': 'Encargado del registro (opcional)',
            'taskGroupMembers': 'Miembros del grupo del encargado',
            'save': 'Crear',
            'saving': 'Guardando...',
            'taskCreated': 'Tarea creada',
            'noLocations': 'Este cliente no tiene ubicaciones',
            'noWorkers': 'No hay empleados activos',
            'selectClientFirst': 'Elija primero un cliente',
            'pickReporterFirst': 'Elija primero un encargado',
            'taskNeedsClient': 'Elija un cliente',
            'taskNeedsTitle': 'Introduzca el título',
            'groupOf': 'Grupo',
            'hoursNewTitle': 'Registro de horas',
            'hoursTask': 'Tarea',
            'hoursDate': 'Fecha',
            'hoursHours': 'Horas',
            'hoursLocation': 'Ubicación (opcional)',
            'hoursMode': 'A quién registramos',
            'modeSelf': 'A mí mismo',
            'modeGroup': 'Grupo (encargado)',
            'groupExclude': 'No trabajó ese día — marcar',
            'hoursCreated': 'Horas registradas',
            'groupCreated': 'Horas registradas al grupo',
            'hoursNeedsTask': 'Elija una tarea',
            'hoursNeedsHours': 'Introduzca las horas (0.25–24)',
            'noReporterGroups': 'Usted no es encargado de ningún grupo',
            'skippedLine': 'Omitidos'
        }
    };

    function t(key) {
        const dict = I18N[state.lang] || I18N[CONFIG.defaultLang];
        if (dict && dict[key] !== undefined) return dict[key];
        return I18N.ru[key] !== undefined ? I18N.ru[key] : key;
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

    function roleLabel(user) {
        if (!user) return t('role.unknown');
        if (user.is_manager) return t('role.manager');
        return t('role.worker');
    }

    const STATUS_RU = { draft: 'черновик', active: 'активно', done: 'завершено', cancelled: 'отменено' };

    /* ========================================================
     * 6. API client (initData + X-Actor-Id)
     * ======================================================== */
    const api = {
        async request(path, options) {
            options = options || {};
            const url = CONFIG.apiBase.replace(/\/+$/, '') + path;
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
        getMyEntries() { return this.request('/work-entries'); },
        getUsers() { return this.request('/users'); },
        getClients() { return this.request('/clients'); },
        getInventory() { return this.request('/inventory'); },
        getPayouts() { return this.request('/payroll/payouts'); },
        // --- Шаг 2: цепочка создания задания ---
        createTask(body) { return this.request('/tasks', { method: 'POST', body: body }); },
        assignUser(taskId, userId) {
            return this.request('/tasks/' + taskId + '/assignments',
                { method: 'POST', body: { user_id: userId } });
        },
        createGroup(taskId, reporterId, memberIds) {
            return this.request('/tasks/' + taskId + '/groups',
                { method: 'POST', body: { reporter_id: reporterId, member_ids: memberIds } });
        },
        // --- Шаг 3: ввод часов ---
        createEntry(body) { return this.request('/work-entries', { method: 'POST', body: body }); },
        createGroupEntries(body) { return this.request('/work-entries/group', { method: 'POST', body: body }); }
    };

    /* ========================================================
     * 7. Rendering
     * ======================================================== */
    const $ = (sel) => document.querySelector(sel);

    function showScreen(name) {
        document.querySelectorAll('.screen').forEach((s) => {
            s.hidden = s.getAttribute('data-screen-name') !== name;
        });
        document.querySelectorAll('.nav-item').forEach((b) => {
            b.classList.toggle('is-active', b.getAttribute('data-nav-target') === name);
        });
        $('#moreMenu').hidden = true;
        state.view = name;
    }

    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
    }

    function setList(id, html) {
        const el = $('#' + id);
        if (el) el.innerHTML = html;
    }

    function renderDashboard(me, tasks, entries) {
        $('#statActiveTasks').textContent = tasks ? tasks.length : '—';
        const today = new Date().toISOString().slice(0, 10);
        const hoursToday = (entries || [])
            .filter((e) => e.work_date === today)
            .reduce((sum, e) => sum + parseFloat(e.hours), 0);
        $('#statHoursToday').textContent = hoursToday.toFixed(2);
        $('#statEarned').textContent = me ? Number(me.total_earned).toFixed(2) : '—';
        showScreen('dashboard');
    }

    function renderTasks(tasks) {
        if (!tasks || !tasks.length) {
            setList('tasksList', '<p class="screen-message">' + t('empty') + '</p>');
            return;
        }
        setList('tasksList', tasks.map((task) =>
            '<button class="card card-tap" data-task-id="' + task.id + '">' +
            '<div class="card-title">' + escapeHtml(task.title) + '</div>' +
            '<div class="card-sub">' +
            '<span class="badge">' + escapeHtml(STATUS_RU[task.status] || task.status) + '</span>' +
            (task.date_start ? '<span>' + escapeHtml(task.date_start) +
                (task.date_end ? ' — ' + escapeHtml(task.date_end) : '') + '</span>' : '') +
            '</div></button>'
        ).join(''));
    }

    function renderHours(entries) {
        if (!entries || !entries.length) {
            setList('hoursList', '<p class="screen-message">' + t('empty') + '</p>');
            return;
        }
        setList('hoursList', entries.map((e) =>
            '<div class="card"><div class="card-title">' + escapeHtml(e.work_date) +
            ' — ' + escapeHtml(String(e.hours)) + ' ч</div>' +
            '<div class="card-sub"><span>задание #' + e.task_id + '</span>' +
            '<span>' + escapeHtml(String(e.rate_snapshot)) + '/ч</span></div></div>'
        ).join(''));
    }

    function renderProfile(me) {
        setList('profileInfo',
            '<div class="card">' +
            '<div class="card-title">' + escapeHtml(me.name) + '</div>' +
            '<div class="card-sub"><span>' + t('profile.role') + ': ' + roleLabel(me) + '</span></div>' +
            '<div class="card-sub"><span>' + t('profile.hours') + ': ' + Number(me.total_hours).toFixed(2) + '</span>' +
            '<span>' + t('profile.earned') + ': ' + Number(me.total_earned).toFixed(2) + '</span></div>' +
            '</div>');
    }

    function renderSimpleList(listId, items, titleFn, subFn) {
        if (!items || !items.length) {
            setList(listId, '<p class="screen-message">' + t('empty') + '</p>');
            return;
        }
        setList(listId, items.map((item) =>
            '<div class="card"><div class="card-title">' + escapeHtml(titleFn(item)) + '</div>' +
            '<div class="card-sub"><span>' + escapeHtml(subFn(item)) + '</span></div></div>'
        ).join(''));
    }

    function applyManagerUI() {
        const isManager = !!(state.user && state.user.is_manager);
        const moreBtn = $('#navMoreBtn');
        if (moreBtn) moreBtn.hidden = !isManager;
        $('#btnNewTask').hidden = !isManager;
        $('#btnAddWorker').hidden = !isManager;
        $('#btnAddClient').hidden = !isManager;
        // «Добавить часы» видят все: работник пишет себя,
        // учётчик — группу (шаг 3)
    }

    /* ========================================================
     * 7a. Форма «Новое задание» (шаг 2)
     * ======================================================== */
    function ntError(message) {
        const el = $('#ntError');
        el.textContent = message || '';
        el.hidden = !message;
    }

    function checkedIds(containerId) {
        return Array.from(document.querySelectorAll('#' + containerId + ' input:checked'))
            .map((cb) => parseInt(cb.value, 10));
    }

    function renderClientOptions(clients) {
        const sel = $('#ntClient');
        sel.innerHTML = '<option value="">—</option>' + clients.map((c) =>
            '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>'
        ).join('');
    }

    function renderLocationChecks(locations) {
        const box = $('#ntLocations');
        if (!locations || !locations.length) {
            box.innerHTML = '<p class="screen-message">' + t('noLocations') + '</p>';
            return;
        }
        box.innerHTML = locations.map((loc) =>
            '<label class="check-item"><input type="checkbox" value="' + loc.id + '"> ' +
            escapeHtml(loc.name) + '</label>'
        ).join('');
    }

    function renderWorkerChecks(users) {
        const box = $('#ntWorkers');
        const active = (users || []).filter((u) => u.is_active);
        if (!active.length) {
            box.innerHTML = '<p class="screen-message">' + t('noWorkers') + '</p>';
            return;
        }
        box.innerHTML = active.map((u) =>
            '<label class="check-item"><input type="checkbox" data-worker value="' + u.id + '"> ' +
            escapeHtml(u.name) + '</label>'
        ).join('');
        // Учётчик выбирается только из назначенных сотрудников
        const rep = $('#ntReporter');
        rep.innerHTML = '<option value="">—</option>' + active.map((u) =>
            '<option value="' + u.id + '">' + escapeHtml(u.name) + '</option>'
        ).join('');
        renderGroupMemberChecks();
    }

    function renderGroupMemberChecks() {
        const box = $('#ntGroupMembers');
        const selected = Array.from(
            document.querySelectorAll('#ntWorkers input[data-worker]:checked')
        );
        const reporterId = parseInt($('#ntReporter').value, 10);
        if (!selected.length) {
            box.innerHTML = '<p class="screen-message">' + t('empty') + '</p>';
            return;
        }
        box.innerHTML = selected.map((cb) => {
            const id = parseInt(cb.value, 10);
            const name = cb.parentElement.textContent.trim();
            // Учётчик в группу входит автоматически (сервер добавляет сам)
            const disabled = reporterId === id;
            return '<label class="check-item"><input type="checkbox" data-member value="' + id + '"' +
                (disabled ? ' disabled' : '') + '> ' + escapeHtml(name) +
                (disabled ? ' — ' + t('role.reporter') : '') + '</label>';
        }).join('');
    }

    async function openNewTask() {
        ntError('');
        showScreen('new-task');
        try {
            // Заказчики и сотрудники грузятся один раз и кэшируются
            const [clients, users] = await Promise.all([
                state.clients ? Promise.resolve(state.clients) : api.getClients(),
                state.users ? Promise.resolve(state.users) : api.getUsers()
            ]);
            state.clients = clients;
            state.users = users;
            renderClientOptions(clients);
            renderWorkerChecks(users);
            renderLocationChecks([]); // пока заказчик не выбран
        } catch (err) {
            ntError(err.message);
        }
    }

    async function onClientChange() {
        const clientId = parseInt($('#ntClient').value, 10);
        if (!clientId) { renderLocationChecks([]); return; }
        try {
            const locations = await api.request('/clients/' + clientId + '/locations');
            renderLocationChecks(locations);
        } catch (err) {
            renderLocationChecks([]);
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

        const locationIds = checkedIds('ntLocations');
        const workerIds = checkedIds('ntWorkers');
        const reporterId = parseInt($('#ntReporter').value, 10) || null;
        const memberIds = checkedIds('ntGroupMembers');

        const btn = $('#ntSubmit');
        btn.disabled = true;
        btn.textContent = t('saving');

        try {
            // 1) Создание задания (created_by берётся сервером из initData-actor)
            const task = await api.createTask({
                title: title,
                description: $('#ntDescr').value.trim() || null,
                client_id: clientId,
                location_ids: locationIds,
                date_start: $('#ntDateStart').value || null,
                date_end: $('#ntDateEnd').value || null,
                created_by: state.user.id
            });

            // 2) Назначение выбранных сотрудников (каждый — отдельный POST,
            //    бэкенд не принимает список одним запросом)
            for (const uid of workerIds) {
                await api.assignUser(task.id, uid);
            }

            // 3) Группа с учётчиком (механизм группового ввода, SPEC п.1/26)
            if (reporterId) {
                if (!workerIds.includes(reporterId)) {
                    // учётчик должен быть назначен — назначаем автоматически
                    await api.assignUser(task.id, reporterId);
                }
                await api.createGroup(task.id, reporterId, memberIds);
            }

            state.tasks = null; // сброс кэша, список перезагрузится
            btn.disabled = false;
            btn.textContent = t('save');
            alert(t('taskCreated'));
            loadTasks();
        } catch (err) {
            btn.disabled = false;
            btn.textContent = t('save');
            ntError(err.message);
        }
    }

    /* ========================================================
     * 7b. Форма «Ввод часов» (шаг 3)
     * ======================================================== */
    function nhError(message) {
        const el = $('#nhError');
        el.textContent = message || '';
        el.hidden = !message;
    }

    function renderTaskOptions(tasks) {
        const sel = $('#nhTask');
        sel.innerHTML = '<option value="">—</option>' + (tasks || []).map((task) =>
            '<option value="' + task.id + '">' + escapeHtml(task.title) + '</option>'
        ).join('');
    }

    function renderLocationOptions(locations) {
        const sel = $('#nhLocation');
        sel.innerHTML = '<option value="">—</option>' + (locations || []).map((loc) =>
            '<option value="' + loc.id + '">' + escapeHtml(loc.name) + '</option>'
        ).join('');
    }

    function renderExcludeList(members) {
        const box = $('#nhExclude');
        if (!members || !members.length) {
            box.innerHTML = '<p class="screen-message">' + t('empty') + '</p>';
            return;
        }
        box.innerHTML = members.map((u) =>
            '<label class="check-item"><input type="checkbox" data-exclude value="' + u.id + '"> ' +
            escapeHtml(u.name) + '</label>'
        ).join('');
    }

    function onHoursModeChange() {
        const radio = document.querySelector('input[name="nhMode"]:checked');
        const mode = radio ? radio.value : 'self';
        $('#nhExcludeField').hidden = mode !== 'group';
    }

    async function onHoursTaskChange() {
        const taskId = parseInt($('#nhTask').value, 10);
        if (!taskId) { renderLocationOptions([]); return; }
        try {
            const task = await api.request('/tasks/' + taskId);
            renderLocationOptions(task.locations || []);
        } catch (err) {
            renderLocationOptions([]);
            nhError(err.message);
        }
    }

    // Собираем группы, где текущий пользователь — учётчик:
    // детали активных заданий -> groups с reporter.id == me
    async function findMyReporterGroups() {
        const tasks = state.tasks || await api.getTasks();
        state.tasks = tasks;
        if (!tasks || !tasks.length) return [];
        const myId = state.user.id;
        const details = await Promise.all(
            tasks.map((tk) => api.request('/tasks/' + tk.id))
        );
        return details.flatMap((task) =>
            (task.groups || [])
                .filter((g) => g.reporter && g.reporter.id === myId)
                .map((g) => ({ group_id: g.id, task_id: task.id, reporter_id: myId }))
        );
    }

    async function openNewHours() {
        nhError('');
        showScreen('new-hours');
        $('#nhDate').value = new Date().toISOString().slice(0, 10);
        $('#nhHours').value = '';
        $('#nhExcludeField').hidden = true;

        try {
            const tasks = state.tasks || await api.getTasks();
            state.tasks = tasks;
            renderTaskOptions(tasks);

            // Режим «группа» показываем только учётчику
            state.myGroups = await findMyReporterGroups();
            const modeField = $('#nhModeField');
            if (state.myGroups.length) {
                modeField.hidden = false;
                document.querySelector('input[name="nhMode"][value="self"]').checked = true;
                await loadGroupMembers();
            } else {
                modeField.hidden = true;
            }
        } catch (err) {
            nhError(err.message);
        }
    }

    async function loadGroupMembers() {
        const g = (state.myGroups || [])[0];
        if (!g) { renderExcludeList([]); return; }
        // Участники группы = assignments задания с этим group_id,
        // учётчик в список исключений не попадает (он пишет и себя)
        try {
            const task = await api.request('/tasks/' + g.task_id);
            const members = (task.assignments || [])
                .filter((a) => a.group_id === g.group_id && a.user.id !== g.reporter_id)
                .map((a) => a.user);
            renderExcludeList(members);
        } catch (err) {
            renderExcludeList([]);
            nhError(err.message);
        }
    }

    async function submitNewHours(event) {
        event.preventDefault();
        nhError('');

        const taskId = parseInt($('#nhTask').value, 10);
        const hoursVal = parseFloat($('#nhHours').value);
        if (!taskId) { nhError(t('hoursNeedsTask')); return; }
        if (!hoursVal || hoursVal <= 0 || hoursVal > 24) { nhError(t('hoursNeedsHours')); return; }

        const workDate = $('#nhDate').value;
        const locationId = parseInt($('#nhLocation').value, 10) || null;

        const radio = document.querySelector('input[name="nhMode"]:checked');
        const mode = radio ? radio.value : 'self';

        const btn = $('#nhSubmit');
        btn.disabled = true;
        btn.textContent = t('saving');

        try {
            if (mode === 'group' && state.myGroups && state.myGroups.length) {
                // Групповой ввод учётчика: одно действие -> N записей.
                // Учётчик сам входит в группу (сервер добавляет его).
                const exclude = Array.from(
                    document.querySelectorAll('#nhExclude input[data-exclude]:checked')
                ).map((cb) => parseInt(cb.value, 10));
                const result = await api.createGroupEntries({
                    group_id: state.myGroups[0].group_id,
                    work_date: workDate,
                    hours: hoursVal.toFixed(2),
                    location_id: locationId,
                    exclude_user_ids: exclude
                });
                const skipped = (result && result.skipped) || [];
                state.entries = null;
                btn.disabled = false;
                btn.textContent = t('save');
                alert(t('groupCreated') +
                    (skipped.length ? ' (' + t('skippedLine') + ': ' + skipped.length + ')' : ''));
            } else {
                // Индивидуальная запись: работник за себя (user_id не передаём)
                await api.createEntry({
                    task_id: taskId,
                    work_date: workDate,
                    hours: hoursVal.toFixed(2),
                    location_id: locationId
                });
                state.entries = null;
                btn.disabled = false;
                btn.textContent = t('save');
                alert(t('hoursCreated'));
            }
            loadHours();
        } catch (err) {
            btn.disabled = false;
            btn.textContent = t('save');
            nhError(err.message);
        }
    }

    /* ---------- Загрузчики разделов ---------- */
    async function loadDashboard() {
        showScreen('loading');
        try {
            const [tasks, entries] = await Promise.all([api.getTasks(), api.getMyEntries()]);
            state.tasks = tasks; state.entries = entries;
            renderDashboard(state.user, tasks, entries);
        } catch (err) { renderError(err.message); }
    }

    async function loadTasks() {
        showScreen('tasks');
        try {
            state.tasks = state.tasks || await api.getTasks();
            renderTasks(state.tasks);
        } catch (err) { setList('tasksList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>'); }
    }

    async function loadHours() {
        showScreen('hours');
        try {
            state.entries = state.entries || await api.getMyEntries();
            renderHours(state.entries);
        } catch (err) { setList('hoursList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>'); }
    }

    function loadReports() {
        showScreen('reports');
        setList('reportsList',
            '<div class="card"><div class="card-title">' + t('statEarned') + '</div>' +
            '<div class="card-sub"><span>' + Number(state.user.total_earned).toFixed(2) + '</span></div></div>' +
            '<div class="card"><div class="card-title">' + t('profile.hours') + '</div>' +
            '<div class="card-sub"><span>' + Number(state.user.total_hours).toFixed(2) + '</span></div></div>');
    }

    function loadProfile() {
        showScreen('profile');
        renderProfile(state.user);
    }

    async function loadManager(target) {
        showScreen(target);
        const map = {
            team: ['teamList', () => api.getUsers(), (u) => u.name, (u) => roleLabel(u) + (u.phone ? ' · ' + u.phone : '')],
            clients: ['clientsList', () => api.getClients(), (c) => c.name, (c) => (c.contact || '')],
            inventory: ['inventoryList', () => api.getInventory(), (i) => i.name, (i) => String(i.qty) + ' шт.'],
            payments: ['paymentsList', () => api.getPayouts(), (p) => 'Выплата #' + p.id, (p) => String(p.amount)]
        };
        const [listId, loader, titleFn, subFn] = map[target];
        try {
            renderSimpleList(listId, await loader(), titleFn, subFn);
        } catch (err) {
            setList(listId, '<p class="screen-message">' + t('coming.soon') + ' (' + escapeHtml(err.message) + ')</p>');
        }
    }

    function renderError(message) {
        $('#screenLoading').hidden = true;
        const login = $('#screenLogin');
        login.hidden = false;
        login.querySelector('[data-i18n="loginSubtitle"]').textContent = message;
    }

    /* ========================================================
     * 8. Events
     * ======================================================== */
    function bindEvents() {
        document.querySelectorAll('.nav-item[data-nav-target]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-nav-target');
                if (target === 'dashboard') loadDashboard();
                else if (target === 'tasks') loadTasks();
                else if (target === 'hours') loadHours();
                else if (target === 'reports') loadReports();
                else if (target === 'profile') loadProfile();
                else if (target === 'more') {
                    const menu = $('#moreMenu');
                    menu.hidden = !menu.hidden;
                }
            });
        });

        document.querySelectorAll('.more-menu-item[data-nav-target]').forEach((btn) => {
            btn.addEventListener('click', () => loadManager(btn.getAttribute('data-nav-target')));
        });

        const back = $('#btnBackTasks');
        if (back) back.addEventListener('click', loadTasks);

        // --- Шаг 2: форма «Новое задание» ---
        const newTaskBtn = $('#btnNewTask');
        if (newTaskBtn) newTaskBtn.addEventListener('click', openNewTask);
        const backNew = $('#btnBackNewTask');
        if (backNew) backNew.addEventListener('click', loadTasks);
        const form = $('#newTaskForm');
        if (form) form.addEventListener('submit', submitNewTask);
        const clientSel = $('#ntClient');
        if (clientSel) clientSel.addEventListener('change', onClientChange);
        const workersBox = $('#ntWorkers');
        if (workersBox) workersBox.addEventListener('change', renderGroupMemberChecks);
        const repSel = $('#ntReporter');
        if (repSel) repSel.addEventListener('change', renderGroupMemberChecks);

        // --- Шаг 3: форма «Ввод часов» ---
        const addHoursBtn = $('#btnAddHours');
        if (addHoursBtn) addHoursBtn.addEventListener('click', openNewHours);
        const backHours = $('#btnBackNewHours');
        if (backHours) backHours.addEventListener('click', loadHours);
        const hoursForm = $('#newHoursForm');
        if (hoursForm) hoursForm.addEventListener('submit', submitNewHours);
        const taskSel = $('#nhTask');
        if (taskSel) taskSel.addEventListener('change', onHoursTaskChange);
        document.querySelectorAll('input[name="nhMode"]').forEach((radio) => {
            radio.addEventListener('change', onHoursModeChange);
        });

        const lang = $('#langSelect');
        if (lang) lang.addEventListener('change', () => {
            state.lang = normalizeLang(lang.value);
            applyI18n();
            if (state.view === 'profile') loadProfile();
        });
    }

    /* ========================================================
     * 9. Startup
     * ======================================================== */
    async function init() {
        state.lang = normalizeLang((tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code) || CONFIG.defaultLang);
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
            applyManagerUI();
            await loadDashboard();
        } catch (err) {
            renderError(err.message || t('network.error'));
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
