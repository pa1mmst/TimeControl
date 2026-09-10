/* ============================================================
 * Time Control — Telegram Mini App
 * File: webapp/app.js
 *
 * Полная логика: авторизация через /api/users/me (HMAC initData),
 * нижнее меню, экраны: главная, задания, часы, отчёты, профиль,
 * + разделы руководителя («Ещё»): сотрудники, заказчики,
 * инвентарь, выплаты.
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
        entries: null
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
            'empty': 'Пока пусто', 'error': 'Ошибка'
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
            'empty': 'Поки порожньо', 'error': 'Помилка'
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
            'empty': 'Aún vacío', 'error': 'Error'
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
        getPayouts() { return this.request('/payroll/payouts'); }
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
        $('#btnAddHours').hidden = !isManager;
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
