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

