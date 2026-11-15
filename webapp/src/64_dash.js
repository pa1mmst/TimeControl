    /* ========================================================
     * 19d. v4: ДАШБОРД РУКОВОДИТЕЛЯ
     * ======================================================== */
    async function loadManagerDash() {
        showScreen('loading');
        try {
            state.dash = await api.dashboardToday();
            renderManagerDash();
        } catch (err) { renderError(err.message); }
    }

    // Часы для строки-итога: «10», «7,5» (разделитель по языку интерфейса).
    function fmtHoursPlain(v) {
        return num(v).toLocaleString(localeTag(), { maximumFractionDigits: 2 });
    }

    function sortTasksByTitle(tasks) {
        return (tasks || []).slice().sort((x, y) =>
            String(x.title).localeCompare(String(y.title), 'ru'));
    }

    function renderManagerDash() {
        const d = state.dash;
        const body = $('#managerDashBody');
        if (!d) { showScreen('manager-dash'); return; }
        const tasks = sortTasksByTitle(d.tasks);
        // Люди, назначенные на сегодняшние задания; отметились = есть часы хотя бы на одном.
        const people = {};
        const order = [];
        tasks.forEach((tk) => (tk.workers || []).forEach((w) => {
            if (!people[w.user_id]) {
                people[w.user_id] = { id: w.user_id, name: w.name, titles: [], has: false };
                order.push(w.user_id);
            }
            const p = people[w.user_id];
            p.titles.push(tk.title);
            if (num(w.hours_today) > 0) p.has = true;
        }));
        const assigned = order.length;
        const checked = order.filter((id) => people[id].has).length;
        const missing = order.map((id) => people[id]).filter((p) => !p.has);
        const summary = t('dashSummary', {
            a: assigned, b: checked, h: fmtHoursPlain(d.hours_today)
        });
        const list = missing.length
            ? '<h3 class="sheet__h3">' + escapeHtml(t('notCheckedIn')) + '</h3>' +
              '<div class="card nci" data-testid="not-checked-in">' +
              missing.map((p) =>
                  '<div class="nci__row" data-testid="nci-row" data-user="' + p.id + '">' +
                  '<div class="nci__info"><div class="nci__name">' + escapeHtml(p.name) + '</div>' +
                  '<div class="nci__tasks">' + escapeHtml(p.titles.join(', ')) + '</div></div>' +
                  '<button type="button" class="btn btn--primary nci__btn" data-action="enter-for" data-user="' +
                  p.id + '">' + escapeHtml(t('enterFor')) + '</button></div>').join('') +
              '</div>'
            : (assigned
                ? '<p class="screen-message nci-ok" data-testid="all-checked-in">' +
                  escapeHtml(t('allCheckedIn')) + '</p>'
                : '');
        const cards = tasks.map((tk) => {
            const chips = (tk.workers || []).map((w) => {
                const has = num(w.hours_today) > 0;
                return '<span class="chip chip--static' + (has ? ' chip--ok' : '') +
                    '" data-dash-user="' + w.user_id + '">' + escapeHtml(w.name) +
                    (has ? ' ' + escapeHtml(fmtHoursUnit(w.hours_today)) : '') + '</span>';
            }).join('');
            return '<div class="card card--tap" data-task-id="' + tk.id + '" role="button" tabindex="0">' +
                '<div class="card-title">' + escapeHtml(tk.title) + '</div>' +
                '<div class="card-sub"><span>' +
                [tk.client_name, (tk.location_names || []).join(', ')]
                    .filter(Boolean).map(escapeHtml).join(' · ') + '</span></div>' +
                (chips ? '<div class="chip-row">' + chips + '</div>' : '') +
                '</div>';
        }).join('');
        body.innerHTML = hintsHtml() +
            '<p class="dash-summary" data-testid="dash-summary">' + escapeHtml(summary) + '</p>' +
            list +
            '<h3 class="sheet__h3">' + escapeHtml(t('dashActiveTasks')) + '</h3>' +
            '<div class="list">' + (cards || '<div class="empty"><div class="empty__text">' +
                escapeHtml(t('dashNoTasksToday')) + '</div></div>') + '</div>';
        showScreen('manager-dash');
    }

    // «Записать за него»: часы сегодня за человека из списка «Не отметились».
    function openEnterForSheet(userId) {
        const d = state.dash;
        if (!d) return;
        const tasks = sortTasksByTitle(d.tasks).filter((tk) =>
            (tk.workers || []).some((w) => w.user_id === userId));
        if (!tasks.length) return;
        const who = tasks[0].workers.find((w) => w.user_id === userId);
        let taskId = tasks[0].id;
        let picked = '';
        const sheet = openSheet(
            '<h3 class="sheet__title">' + escapeHtml(t('enterForTitle', { name: who.name })) + '</h3>' +
            (tasks.length > 1
                ? '<div class="chip-row" id="efTasks">' + tasks.map((tk, i) =>
                    '<button type="button" class="chip' + (i === 0 ? ' chip--on' : '') +
                    '" data-ef-task="' + tk.id + '">' + escapeHtml(tk.title) + '</button>').join('') + '</div>'
                : '<p class="muted">' + escapeHtml(tasks[0].title) + '</p>') +
            '<div class="he-quick" id="whQuick">' +
            ['4', '6', '8', '10', '12'].map((v) =>
                '<button type="button" class="chip" data-wh="' + v + '">' + v + '</button>').join('') +
            '<button type="button" class="chip" data-wh="more">' + escapeHtml(t('hoursMore')) + '</button>' +
            '</div>' +
            '<div class="form-field" id="whCustomField" hidden>' +
            '<span class="form-label">' + escapeHtml(t('hoursCustom')) + '</span>' +
            '<input type="text" id="whCustom" inputmode="decimal" placeholder="—"></div>' +
            '<p class="form-error" id="whError" hidden></p>' +
            '<button type="button" class="btn btn--primary btn--block" id="whSave" disabled>' +
            escapeHtml(t('save')) + '</button>');
        const errEl = sheet.querySelector('#whError');
        const customField = sheet.querySelector('#whCustomField');
        const custom = sheet.querySelector('#whCustom');
        const save = sheet.querySelector('#whSave');
        const value = () => {
            const raw = customField.hidden ? picked : custom.value.trim().replace(',', '.');
            return raw === '' ? 0 : parseFloat(raw);
        };
        const efTasks = sheet.querySelector('#efTasks');
        if (efTasks) efTasks.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-ef-task]');
            if (!b) return;
            taskId = parseInt(b.getAttribute('data-ef-task'), 10);
            efTasks.querySelectorAll('.chip').forEach((c) => c.classList.toggle('chip--on', c === b));
        });
        sheet.querySelector('#whQuick').addEventListener('click', (ev) => {
            const chip = ev.target.closest('[data-wh]');
            if (!chip) return;
            const v = chip.getAttribute('data-wh');
            if (v === 'more') {
                customField.hidden = false;
                custom.focus();
            } else {
                customField.hidden = true;
                picked = v;
                custom.value = v;
            }
            sheet.querySelectorAll('#whQuick .chip').forEach((c) =>
                c.classList.toggle('chip--on', c.getAttribute('data-wh') === v && v !== 'more'));
            save.disabled = !(value() > 0);
        });
        custom.addEventListener('input', () => { save.disabled = !(value() > 0); });
        save.addEventListener('click', async () => {
            errEl.hidden = true;
            const hours = value();
            if (!(hours > 0 && hours <= 24)) {
                errEl.textContent = t('hoursBad');
                errEl.hidden = false;
                return;
            }
            save.disabled = true;
            try {
                await api.createEntry({
                    task_id: taskId, work_date: d.date || todayIso(),
                    hours: hours.toFixed(2), user_id: userId
                });
                closeSheet();
                toast(t('recorded'), 'success');
                state.tasks = null;
                state.dash = await api.dashboardToday();
                renderManagerDash();
            } catch (err) {
                errEl.textContent = err.message || t('error');
                errEl.hidden = false;
                save.disabled = false;
            }
        });
    }

