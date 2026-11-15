    /* --- ТЗ 11.11 этап 0: «Деньги» руководителя: период, таблица, аванс, закрытие --- */
    function payPeriodBounds(kind) {
        const d = new Date();
        if (kind === 'prev') {
            return [isoOf(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
                isoOf(new Date(d.getFullYear(), d.getMonth(), 0))];
        }
        if (kind === 'since-close' && state.payLastEnd) {
            const e = new Date(state.payLastEnd + 'T00:00:00');
            const start = isoOf(new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1));
            const today = todayIso();
            return [start, start > today ? start : today];
        }
        return monthRange();
    }

    function fmtPayPeriod(a, b) {
        const opt = { day: 'numeric', month: 'short' };
        const optY = { day: 'numeric', month: 'short', year: 'numeric' };
        try {
            const da = new Date(a + 'T00:00:00');
            const db = new Date(b + 'T00:00:00');
            const sameYear = da.getFullYear() === db.getFullYear();
            return da.toLocaleDateString(localeTag(), sameYear ? opt : optY) + ' – ' +
                db.toLocaleDateString(localeTag(), optY);
        } catch (e) { return a + ' – ' + b; }
    }

    async function renderMoneyManager(body) {
        if (!state.payPeriod) state.payPeriod = 'month';
        body.innerHTML = '<div class="skeleton skeleton--card"></div>';
        try {
            const [users, payouts] = await Promise.all([
                state.users || api.getUsers(),
                api.getPayouts()
            ]);
            state.users = users;
            let lastEnd = '';
            (payouts || []).forEach((p) => {
                if (p.period_end && p.period_end > lastEnd) lastEnd = p.period_end;
            });
            state.payLastEnd = lastEnd;
            if (state.payPeriod === 'since-close' && !lastEnd) state.payPeriod = 'month';
        } catch (err) {
            body.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
            showScreen('money');
            return;
        }
        const kinds = [['month', t('moneyPeriodMonth')], ['prev', t('moneyPeriodPrev')]];
        if (state.payLastEnd) kinds.push(['since-close', t('moneyPeriodSince')]);
        body.innerHTML =
            '<div class="segment money-period">' +
            kinds.map((k) =>
                '<button class="segment__btn' + (state.payPeriod === k[0] ? ' is-active' : '') +
                '" data-period="' + k[0] + '">' + escapeHtml(k[1]) + '</button>').join('') +
            '</div>' +
            '<div class="money-period__dates muted" data-testid="pay-period"></div>' +
            '<div id="payTable"></div>' +
            '<div class="money-actions">' +
            '<button class="btn btn--primary btn--block" data-action="pay-advance-open">' +
            escapeHtml(t('moneyGiveAdvance')) + '</button>' +
            '<button class="btn btn--danger btn--block" data-action="pay-close">' +
            escapeHtml(t('moneyCloseBtn')) + '</button>' +
            '</div>';
        body.querySelectorAll('[data-period]').forEach((b) => {
            b.addEventListener('click', () => {
                state.payPeriod = b.getAttribute('data-period');
                body.querySelectorAll('[data-period]').forEach((x) => {
                    x.classList.toggle('is-active', x === b);
                });
                refreshMoneyTable();
            });
        });
        showScreen('money');
        await refreshMoneyTable();
    }

    async function refreshMoneyTable() {
        const box = $('#payTable');
        if (!box) return;
        const [start, end] = payPeriodBounds(state.payPeriod);
        const label = $('#screenMoney [data-testid="pay-period"]');
        if (label) label.textContent = fmtPayPeriod(start, end);
        state.payRows = null;
        state.payRange = [start, end];
        box.innerHTML = '<div class="skeleton skeleton--card"></div>';
        try {
            const rows = await api.payPreview(start, end);
            // за время запроса могли переключить период
            if (!state.payRange || state.payRange[0] !== start || state.payRange[1] !== end) return;
            state.payRows = rows || [];
            if (!state.payRows.length) {
                box.innerHTML = '<p class="screen-message">' + escapeHtml(t('moneyEmptyPeriod')) + '</p>';
                return;
            }
            // Суммы по людям посчитал бэкенд; итога за период API не отдаёт — складываем.
            let h = 0, g = 0, a = 0, n = 0;
            state.payRows.forEach((r) => {
                h += num(r.hours); g += num(r.gross); a += num(r.advances_total); n += num(r.net);
            });
            box.innerHTML =
                '<div class="pay-table-wrap"><table class="pay-table" data-testid="pay-table">' +
                '<thead><tr><th>' + escapeHtml(t('moneyColPerson')) + '</th>' +
                '<th class="num">' + escapeHtml(t('moneyColHours')) + '</th>' +
                '<th class="num">' + escapeHtml(t('moneyColEarned')) + '</th>' +
                '<th class="num">' + escapeHtml(t('moneyColAdv')) + '</th>' +
                '<th class="num">' + escapeHtml(t('moneyColNet')) + '</th></tr></thead><tbody>' +
                state.payRows.map((r) =>
                    '<tr data-testid="pay-row" data-user="' + escapeHtml(r.user_id) +
                    '" data-action="open-user-summary">' +
                    '<td>' + escapeHtml(r.name) + '</td>' +
                    '<td class="num">' + escapeHtml(fmtHoursUnit(r.hours)) + '</td>' +
                    '<td class="num">' + escapeHtml(fmtMoney(r.gross)) + '</td>' +
                    '<td class="num">' + escapeHtml(fmtMoney(r.advances_total)) + '</td>' +
                    '<td class="num"><strong>' + escapeHtml(fmtMoney(r.net)) + '</strong></td></tr>'
                ).join('') +
                '</tbody><tfoot><tr data-testid="pay-total">' +
                '<td>' + escapeHtml(t('moneyTotalRow')) + '</td>' +
                '<td class="num">' + escapeHtml(fmtHoursUnit(h)) + '</td>' +
                '<td class="num">' + escapeHtml(fmtMoney(g)) + '</td>' +
                '<td class="num">' + escapeHtml(fmtMoney(a)) + '</td>' +
                '<td class="num"><strong>' + escapeHtml(fmtMoney(n)) + '</strong></td></tr></tfoot>' +
                '</table></div>';
        } catch (err) {
            box.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
        }
    }

    function openAdvanceSheet() {
        const users = (state.users || []).filter((u) => u.is_active);
        const sheet = openSheet(
            '<h3 class="sheet__title">' + escapeHtml(t('moneyGiveAdvance')) + '</h3>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('advWho')) + '</span>' +
            '<select id="advUser">' +
            users.map((u) => '<option value="' + escapeHtml(u.id) + '">' + escapeHtml(u.name) + '</option>').join('') +
            '</select></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('advAmountLabel')) + '</span>' +
            '<input type="number" id="advAmount" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00"></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('advDateLabel')) + '</span>' +
            '<input type="date" id="advDate" value="' + todayIso() + '"></label>' +
            '<p class="form-error" id="advError" hidden></p>' +
            '<button class="btn btn--primary btn--block" data-action="pay-advance">' + escapeHtml(t('save')) + '</button>');
        return sheet;
    }

    async function createAdvance() {
        const sheet = document.querySelector('#sheetRoot .sheet');
        if (!sheet) return;
        const errBox = sheet.querySelector('#advError');
        const showErr = (msg) => { errBox.textContent = msg; errBox.hidden = false; };
        const userId = parseInt(sheet.querySelector('#advUser').value, 10);
        const amount = parseFloat(sheet.querySelector('#advAmount').value);
        const date = sheet.querySelector('#advDate').value || todayIso();
        if (!userId || !(amount > 0)) { showErr(t('advAmountError')); return; }
        const btn = sheet.querySelector('[data-action="pay-advance"]');
        btn.disabled = true;
        try {
            await api.createAdvance({
                user_id: userId, amount: amount.toFixed(2),
                date: date, created_by: state.user.id
            });
            closeSheet();
            toast(t('advSaved'), 'success');
            await refreshMoneyTable();
        } catch (err) {
            btn.disabled = false;
            showErr(err.message);
        }
    }

    function closePayroll() {
        const rows = state.payRows || [];
        if (!rows.length || !state.payRange) { toast(t('moneyCloseEmpty'), 'error'); return; }
        // Будущие дни не закрываем: иначе часы, записанные после закрытия, но до конца
        // выбранного периода, попали бы в уже закрытый расчёт и не вошли бы ни в одну выплату.
        const today = todayIso();
        const range = [state.payRange[0],
            state.payRange[1] > today ? today : state.payRange[1]];
        // Итог к выплате = сумма готовых net по людям из /payroll/preview.
        const total = rows.reduce((s, r) => s + num(r.net), 0);
        const msg = t('moneyCloseConfirm', {
            period: fmtPayPeriod(range[0], range[1]), n: rows.length, sum: fmtMoney(total)
        });
        const run = async (ok) => {
            if (!ok) return;
            try {
                await api.payClose({
                    period_start: range[0], period_end: range[1], created_by: state.user.id
                });
                toast(t('moneyClosed'), 'success');
                await renderMoneyManager($('#moneyBody'));
            } catch (err) {
                toast(err.message, 'error');
            }
        };
        if (tg && typeof tg.showConfirm === 'function') tg.showConfirm(msg, run);
        else run(window.confirm(msg));
    }

