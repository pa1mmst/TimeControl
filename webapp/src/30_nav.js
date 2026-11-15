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
        const prev = stack[stack.length - 1];
        // с экрана задания (матрицы) лист задания не нужен — он сам итоговый
        const tid = leaving === 'hours-entry' && state.heCtx && prev !== 'matrix'
            ? state.heCtx.task.id : null;
        if (leaving === 'hours-entry') state.heCtx = null;
        const done = Promise.resolve(rerenderScreen(prev));
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

