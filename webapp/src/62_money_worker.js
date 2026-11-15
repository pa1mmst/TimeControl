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

