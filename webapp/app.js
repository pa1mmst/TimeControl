/* Time Control — Telegram Mini App (первая рабочая версия) */
(function () {
    'use strict';

    const tg = window.Telegram ? window.Telegram.WebApp : null;

    // ---------- Авторизация ----------
    function getInitData() {
        return tg && tg.initData ? tg.initData : '';
    }

    async function fetchMe() {
        const initData = getInitData();
        if (!initData) throw new Error('NO_INIT_DATA');
        const resp = await fetch('/api/users/me', {
            headers: { 'X-Telegram-Init-Data': initData },
        });
        if (resp.status === 401) throw new Error('NOT_REGISTERED');
        if (!resp.ok) throw new Error('SERVER_ERROR');
        return resp.json();
    }

    // ---------- Рендер ----------
    const app = document.getElementById('app');

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function renderHome(me) {
        const role = me.is_manager ? 'Руководитель' : 'Сотрудник';
        return `
            <h2>Привет, ${esc(me.name)}!</h2>
            <p class="hint">${esc(role)}</p>
            <div class="stats">
                <div class="stat">
                    <div class="num">${esc(me.total_hours)}</div>
                    <div class="label">часов всего</div>
                </div>
                <div class="stat">
                    <div class="num">${esc(me.total_earned)}</div>
                    <div class="label">заработано</div>
                </div>
            </div>
            <h3>Мои задания</h3>
            <div id="tasks">${'<div class="loading">Загрузка…</div>'}</div>
        `;
    }

    async function loadTasks() {
        const box = document.getElementById('tasks');
        if (!box) return;
        try {
            const resp = await fetch('/api/tasks?status=active');
            const tasks = await resp.json();
            box.innerHTML = tasks.length
                ? tasks.map(t => `
                    <div class="card">
                        <div class="title">${esc(t.title)}</div>
                        <div class="sub">${esc(t.date_start)}${t.date_end ? ' — ' + esc(t.date_end) : ''}</div>
                    </div>`).join('')
                : '<p class="hint">Пока нет активных заданий</p>';
        } catch (e) {
            box.innerHTML = '<p class="error">Не удалось загрузить задания</p>';
        }
    }

    function renderError(kind) {
        const msgs = {
            NO_INIT_DATA: 'Откройте приложение через Telegram (кнопку в боте).',
            NOT_REGISTERED: 'Вы не зарегистрированы. Напишите руководителю, чтобы он добавил вас в систему.',
            SERVER_ERROR: 'Ошибка сервера. Попробуйте позже.',
        };
        return `<h2>Не удалось войти</h2><p class="error">${esc(msgs[kind] || msgs.SERVER_ERROR)}</p>`;
    }

    // ---------- Старт ----------
    async function start() {
        if (tg) {
            tg.ready();
            tg.expand();
        }
        try {
            const me = await fetchMe();
            app.innerHTML = renderHome(me);
            loadTasks();
        } catch (e) {
            app.innerHTML = renderError(e.message);
        }
    }

    start();
})();
