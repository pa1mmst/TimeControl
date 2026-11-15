    /* ========================================================
     * 14. ДЕНЬГИ РУКОВОДИТЕЛЯ: вкладки (Выплаты | Отчёты)
     * ======================================================== */
    async function loadReports() {
        showScreen('reports');
        state.reportsTab = 'payouts';
        document.querySelectorAll('#reportsSegment .segment__btn').forEach((b) => {
            b.classList.toggle('is-active', b.getAttribute('data-reports-tab') === 'payouts');
        });
        renderReportsBody();
    }

    function renderReportsBody() {
        const body = $('#reportsBody');
        body.innerHTML = '<div class="skeleton skeleton--card"></div>';
        if (state.reportsTab === 'payouts') renderPayoutsTab(body);
        else renderManagerSummary(body);
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
                const u = users.find((x) => x.id === Number(id));
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
                '<div class="stat"><span class="stat__value">' + escapeHtml(fmtHoursUnit(hours)) + '</span>' +
                '<span class="stat__label">' + escapeHtml(t('repHoursTotal')) + '</span></div>' +
                '</div>' +
                '<div class="stat"><span class="stat__value">' + escapeHtml(fmtMoney(payroll)) + '</span>' +
                '<span class="stat__label">' + escapeHtml(t('repPayroll')) + '</span></div>' +
                '<h3 class="sheet__h3">' + escapeHtml(t('repByWorker')) + '</h3>' +
                (Object.keys(byUser).length
                    ? Object.keys(byUser).map((uid) =>
                        '<div class="row-line"><span>' + escapeHtml(nameOf(uid)) + '</span>' +
                        '<span class="row-line__meta">' + escapeHtml(fmtHoursUnit(byUser[uid])) +
                        '</span></div>').join('')
                    : '<p class="screen-message">' + escapeHtml(t('repEmpty')) + '</p>') +
                '<h3 class="sheet__h3">' + escapeHtml(t('repByClient')) + '</h3>' +
                (Object.keys(byClient).length
                    ? Object.keys(byClient).map((cn) =>
                        '<div class="row-line"><span>' + escapeHtml(cn) + '</span>' +
                        '<span class="row-line__meta">' + escapeHtml(fmtHoursUnit(byClient[cn])) +
                        '</span></div>').join('')
                    : '<p class="screen-message">' + escapeHtml(t('repEmpty')) + '</p>') +
                (myHours > 0
                    ? '<p class="muted my-hours">' + escapeHtml(t('repMyHours', { n: fmtHours(myHours) })) + '</p>'
                    : '');
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
            '</div>' +
            '<div id="payData"></div>';
        await refreshPayPreview();
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
            const kv = (label, val, strong) =>
                '<div class="row-line"><span class="muted">' + escapeHtml(label) + '</span>' +
                '<span class="row-line__meta">' +
                (strong ? '<strong>' + escapeHtml(val) + '</strong>' : escapeHtml(val)) +
                '</span></div>';
            box.innerHTML = rows.map((r) =>
                '<div class="card"><div class="card-title">' + escapeHtml(r.name) + '</div>' +
                kv(t('moneyHours'), fmtHoursUnit(r.hours)) +
                kv(t('payRowEarned'), fmtMoney(r.gross)) +
                kv(t('payRowAdvances'), fmtMoney(r.advances_total)) +
                kv(t('payRowToPay'), fmtMoney(r.net), true) +
                '</div>'
            ).join('');
        } catch (err) {
            box.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
        }
    }

