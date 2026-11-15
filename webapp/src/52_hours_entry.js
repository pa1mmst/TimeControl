    /* ========================================================
     * 12. ЭКРАН «ЧАСЫ ЗА РАБОТУ» (полноэкранный; только руководитель,
     *     у работника ввод в bottom sheet, см. 13b)
     * ======================================================== */
    async function openHoursEntry(taskId, opts) {
        closeSheet();
        showScreen('hours-entry');
        $('#heError').hidden = true;
        $('#heReasonField').hidden = true;
        $('#heSame').checked = false;
        opts = opts || {};
        const heDay = opts.date || todayIso();
        $('#heDate').value = heDay;
        $('#heDateBtn').textContent = (heDay === todayIso() ? t('today') + ', ' : '') +
            fmtDateHuman(heDay);
        $('#heTaskTitle').textContent = '...';

        try {
            const [task, entries] = await Promise.all([
                api.request('/tasks/' + entry_id(taskId)),
                api.taskEntries(taskId)
            ]);
            state.heCtx = { task: task, entries: entries, onlyUser: opts.userId || null };
            $('#heTaskTitle').textContent = task.title;
            renderHoursEntry();
        } catch (err) {
            $('#heError').textContent = err.message;
            $('#heError').hidden = false;
        }
    }

    function renderHoursEntry() {
        const ctx = state.heCtx;
        if (!ctx) return;
        const same = $('#heSame').checked;
        const date = $('#heDate').value;
        const existing = {};
        (ctx.entries || []).forEach((e) => {
            if (e.work_date === date) existing[e.user_id] = num(e.hours);
        });
        ctx.existing = existing;

        const people = (ctx.task.assignments || []).map((a) => a.user)
            .filter((u) => !ctx.onlyUser || u.id === ctx.onlyUser);
        const box = $('#hePeople');
        if (!people.length) {
            box.innerHTML = '<p class="screen-message">' + escapeHtml(t('empty')) + '</p>';
            return;
        }
        const sameVal = $('#heSameVal') ? num($('#heSameVal').value) : 8;
        box.innerHTML = people.map((u) => {
            const has = existing[u.id] !== undefined;
            const badge = has
                ? '<span class="badge badge--wait">' + escapeHtml(t('alreadyEntered', { n: fmtHours(existing[u.id]) })) + '</span>'
                : '';
            const field = same
                ? '<span class="he-val he-val--grey">' + escapeHtml(fmtHours(sameVal)) + '</span>'
                : '<div class="he-input-wrap"><input class="he-input" inputmode="decimal" ' +
                  'data-user="' + u.id + '" data-was="' + (has ? existing[u.id] : '') + '" ' +
                  'value="" placeholder="—"><span class="he-unit">' + escapeHtml(t('hoursUnit')) + '</span></div>';
            return '<div class="row-line he-row">' + avatarHtml(u.id, u.name) +
                '<span class="row-line__name">' + escapeHtml(u.name) + badge + '</span>' + field +
                '</div>';
        }).join('');
        updateSaveState();
    }

    function heValues() {
        const same = $('#heSame').checked;
        if (same) {
            const v = $('#heSameVal') ? num($('#heSameVal').value) : 0;
            return { same: true, value: v };
        }
        const vals = {};
        document.querySelectorAll('#hePeople .he-input').forEach((inp) => {
            const raw = inp.value.trim().replace(',', '.');
            if (raw !== '') vals[parseInt(inp.getAttribute('data-user'), 10)] = parseFloat(raw);
        });
        return { same: false, values: vals };
    }

    function heHasChanges() {
        const ctx = state.heCtx;
        if (!ctx) return false;
        const v = heValues();
        if (v.same) return v.value > 0;
        return Object.keys(v.values).some((uid) => {
            const was = ctx.existing[uid];
            return was === undefined || num(was) !== v.values[uid];
        });
    }

    function heNeedsReason() {
        const ctx = state.heCtx;
        if (!ctx) return false;
        const v = heValues();
        if (v.same) return false; // групповой ввод — только новые записи
        return Object.keys(v.values).some((uid) => {
            const was = ctx.existing[uid];
            return was !== undefined && num(was) !== v.values[uid];
        });
    }

    function updateSaveState() {
        const save = $('#heSave');
        const hint = $('#heHint');
        const reasonField = $('#heReasonField');
        const needReason = heNeedsReason();
        reasonField.hidden = !needReason;
        const hasAny = heHasChanges();
        const reasonOk = !needReason || $('#heReason').value.trim().length > 0;
        save.disabled = !(hasAny && reasonOk);
        hint.textContent = save.disabled
            ? (hasAny ? t('hoursHintReason') : t('hoursHintEmpty'))
            : '';
    }

    async function submitHoursEntry() {
        const ctx = state.heCtx;
        if (!ctx) return;
        const errEl = $('#heError');
        errEl.hidden = true;
        const date = $('#heDate').value;
        const reason = $('#heReason').value.trim() || null;
        const v = heValues();
        const btn = $('#heSave');
        btn.disabled = true;

        try {
            if (v.same) {
                if (!(v.value > 0 && v.value <= 24)) throw new Error(t('hoursBad'));
                // Руководитель вносит одну цифру каждому назначенному.
                const people = (ctx.task.assignments || []).map((a) => a.user);
                for (const u of people) {
                    const was = ctx.existing[u.id];
                    if (was !== undefined && num(was) !== v.value) {
                        const mine = (ctx.entries || []).find(
                            (e) => e.user_id === u.id && e.work_date === date);
                        await api.updateEntry(mine.id, {
                            hours: v.value.toFixed(2), reason: reason
                        });
                    } else if (was === undefined) {
                        await api.createEntry({
                            task_id: ctx.task.id, work_date: date,
                            hours: v.value.toFixed(2), user_id: u.id
                        });
                    }
                }
            } else {
                for (const uid of Object.keys(v.values)) {
                    const hours = v.values[uid];
                    if (!(hours > 0 && hours <= 24)) throw new Error(t('hoursBad'));
                    const was = ctx.existing[uid];
                    if (was !== undefined) {
                        if (num(was) === hours) continue;
                        if (!reason) throw new Error(t('hoursHintReason'));
                        const mine = (ctx.entries || []).find(
                            (e) => e.user_id === Number(uid) && e.work_date === date);
                        await api.updateEntry(mine.id, {
                            hours: hours.toFixed(2), reason: reason
                        });
                    } else {
                        await api.createEntry({
                            task_id: ctx.task.id, work_date: date,
                            hours: hours.toFixed(2), user_id: Number(uid)
                        });
                    }
                }
            }
            toast(t('hoursSaved'), 'success');
            state.tasks = null;
            // Возврат туда, откуда пришли (экран задания или список); экран
            // перерисовывается и только потом, если нужно, открывается лист
            // задания — без гонки с showScreen -> closeSheet.
            const stack = state.navStack;
            if (stack[stack.length - 1] === 'hours-entry') await navBack();
            else { state.heCtx = null; await Promise.resolve(goBackHome()); }
            state.heCtx = null;
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
            btn.disabled = false;
            updateSaveState();
        }
    }

