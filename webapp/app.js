/* ============================================================
 * Time Control — Telegram Mini App
 * File: webapp/app.js
 *
 * SKELETON ONLY. No business logic.
 *
 * Portability note (step 3 of relocation audit):
 *   This file contains NO absolute filesystem or network paths.
 *   The API base is relative ("/api"), so the webapp works no
 *   matter which folder the project lives in — including a path
 *   with spaces such as "D:\Time Control". No quoting changes
 *   are required for this file.
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
        // Per-environment override: window.APP_CONFIG = { apiBase: 'https://...' }
        apiBase: (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api',
        defaultLang: 'ru'
    };

    /* ========================================================
     * 3. Application state
     * ======================================================== */
    const state = {
        lang: CONFIG.defaultLang,
        user: null,
        view: 'home',
        params: []
    };

    /* ========================================================
     * 4. i18n — ru / uk / es
     * ======================================================== */
    const I18N = {
        ru: {
            'app.name': 'Time Control',
            'nav.home': 'Главная',
            'nav.tasks': 'Задания',
            'nav.hours': 'Часы',
            'nav.reports': 'Отчёты',
            'nav.payments': 'Выплаты',
            'nav.inventory': 'Инвентарь',
            'nav.profile': 'Профиль',
            'loading': 'Загрузка…',
            'network.error': 'Ошибка сети. Проверьте подключение.',
            'coming.soon': 'Раздел в разработке',
            'hello': 'Здравствуйте',
            'role.manager': 'Руководитель',
            'role.worker': 'Сотрудник',
            'role.reporter': 'Учётчик',
            'role.unknown': 'Пользователь',
            'home.work': 'Работа',
            'home.finance': 'Финансы',
            'profile.title': 'Профиль',
            'profile.lang': 'Язык',
            'profile.notAuth': 'Не авторизован',
            'profile.rate': 'Ставка',
            'notfound.title': 'Раздел не найден',
            'offline.badge': 'нет сети'
        },
        uk: {
            'app.name': 'Time Control',
            'nav.home': 'Головна',
            'nav.tasks': 'Завдання',
            'nav.hours': 'Години',
            'nav.reports': 'Звіти',
            'nav.payments': 'Виплати',
            'nav.inventory': 'Інвентар',
            'nav.profile': 'Профіль',
            'loading': 'Завантаження…',
            'network.error': 'Помилка мережі. Перевірте з\'єднання.',
            'coming.soon': 'Розділ у розробці',
            'hello': 'Вітаємо',
            'role.manager': 'Керівник',
            'role.worker': 'Працівник',
            'role.reporter': 'Обліковець',
            'role.unknown': 'Користувач',
            'home.work': 'Робота',
            'home.finance': 'Фінанси',
            'profile.title': 'Профіль',
            'profile.lang': 'Мова',
            'profile.notAuth': 'Не авторизований',
            'profile.rate': 'Ставка',
            'notfound.title': 'Розділ не знайдено',
            'offline.badge': 'немає мережі'
        },
        es: {
            'app.name': 'Time Control',
            'nav.home': 'Inicio',
            'nav.tasks': 'Tareas',
            'nav.hours': 'Horas',
            'nav.reports': 'Informes',
            'nav.payments': 'Pagos',
            'nav.inventory': 'Inventario',
            'nav.profile': 'Perfil',
            'loading': 'Cargando…',
            'network.error': 'Error de red. Compruebe la conexión.',
            'coming.soon': 'Sección en desarrollo',
            'hello': 'Hola',
            'role.manager': 'Gerente',
            'role.worker': 'Trabajador',
            'role.reporter': 'Encargado',
            'role.unknown': 'Usuario',
            'home.work': 'Trabajo',
            'home.finance': 'Finanzas',
            'profile.title': 'Perfil',
            'profile.lang': 'Idioma',
            'profile.notAuth': 'No autenticado',
            'profile.rate': 'Tarifa',
            'notfound.title': 'Sección no encontrada',
            'offline.badge': 'sin conexión'
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
        if (l.indexOf('ru') === 0) return 'ru';
        return CONFIG.defaultLang;
    }

    /* ========================================================
     * 5. Utilities
     * ======================================================== */
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function initials(name) {
        if (!name) return '?';
        const parts = String(name).trim().split(/\s+/).filter(Boolean);
        return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
    }

    function getUserRoleLabel(user) {
        if (!user) return t('role.unknown');
        if (user.is_manager) return t('role.manager');
        if (user.is_reporter) return t('role.reporter');
        return t('role.worker');
    }

    /* ========================================================
     * 6. API client
     * ======================================================== */
    const api = {
        async request(path, options) {
            options = options || {};
            const baseUrl = CONFIG.apiBase.replace(/\/+$/, '');
            const url = baseUrl + path;

            const headers = { 'Content-Type': 'application/json' };
            if (tg && tg.initData) {
                headers['X-Telegram-Init-Data'] = tg.initData;
            }
            if (options.headers) {
                Object.keys(options.headers).forEach((key) => {
                    headers[key] = options.headers[key];
                });
            }

            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller
                ? setTimeout(() => controller.abort(), options.timeout || 15000)
                : null;

            let response;
            try {
                response = await fetch(url, {
                    method: options.method || 'GET',
                    headers: headers,
                    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
                    signal: controller ? controller.signal : undefined
                });
            } catch (err) {
                if (timer) clearTimeout(timer);
                console.error('[api] fetch error:', err);
                throw new Error(t('network.error'));
            }
            if (timer) clearTimeout(timer);

            const text = await response.text();
            let data = null;
            if (text) {
                try { data = JSON.parse(text); } catch (e) { data = text; }
            }

            if (!response.ok) {
                let detail = data && data.detail ? data.detail : 'HTTP ' + response.status;
                if (typeof detail !== 'string') detail = JSON.stringify(detail);
                throw new Error(detail);
            }

            return data;
        },

        // Placeholder endpoint bindings — real logic comes later.
        getMe() { return this.request('/users/me'); },
        getTasks() { return this.request('/tasks'); },
        getHours() { return this.request('/work-entries'); }
    };

    /* ========================================================
     * 7. Rendering helpers
     * ======================================================== */
    const $ = (sel) => document.querySelector(sel);

    function showScreen(name) {
        document.querySelectorAll('.screen').forEach((s) => {
            s.hidden = s.getAttribute('data-screen-name') !== name;
        });
        document.querySelectorAll('.nav-item').forEach((b) => {
            b.classList.toggle('is-active', b.getAttribute('data-nav-target') === name);
        });
        state.view = name;
    }

    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
    }

    function renderHome(user) {
        $('#screenLoading').hidden = true;
        $('#screenDashboard').hidden = false;
        const hello = $('#statActiveTasks');
        if (hello) hello.textContent = user && user.full_name ? user.full_name : '';
    }

    function renderError(message) {
        $('#screenLoading').hidden = true;
        $('#screenLogin').hidden = false;
        $('#screenLogin').querySelector('[data-i18n="loginSubtitle"]').textContent = message;
    }

    /* ========================================================
     * 8. Startup
     * ======================================================== */
    async function init() {
        applyI18n();
        showScreen('loading');

        if (!tg || !tg.initData) {
            renderError(t('profile.notAuth'));
            return;
        }

        try {
            const me = await api.getMe();
            state.user = me;
            renderHome(me);
        } catch (err) {
            renderError(err.message || t('network.error'));
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
