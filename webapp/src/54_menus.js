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

