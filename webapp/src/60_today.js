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

        body.innerHTML = hintsHtml() + '<div class="list">' + cards + '</div>' +
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

