    /* ========================================================
     * 13b. v5: ввод часов работника — bottom sheet (§3.4)
     * ======================================================== */
    function openWorkerHoursSheet(taskId, fixMode) {
        const data = state.meToday;
        const task = data && (data.tasks || []).find((tk) => tk.id === taskId);
        if (!task) return;
        const existing = num(task.my_hours_today);
        const fix = !!fixMode && existing > 0;
        let picked = fix ? String(fmtHours(existing)) : '';

        const sheet = openSheet(
            '<h3 class="sheet__title">' +
            escapeHtml(fix ? t('hoursSheetFixTitle') : t('hoursSheetTitle')) + '</h3>' +
            '<div class="he-quick" id="whQuick">' +
            ['4', '6', '8', '10', '12'].map((v) =>
                '<button type="button" class="chip' + (picked === v ? ' chip--on' : '') +
                '" data-wh="' + v + '">' + v + '</button>').join('') +
            '<button type="button" class="chip" data-wh="more">' +
            escapeHtml(t('hoursMore')) + '</button>' +
            '</div>' +
            '<div class="form-field" id="whCustomField" hidden>' +
            '<span class="form-label">' + escapeHtml(t('hoursCustom')) + '</span>' +
            '<input type="text" id="whCustom" inputmode="decimal" value="' +
            escapeHtml(picked) + '" placeholder="—">' +
            '</div>' +
            (fix
                ? '<div class="form-field"><span class="form-label">' +
                  escapeHtml(t('hoursReason')) + '</span>' +
                  '<input type="text" id="whReason" data-i18n-placeholder="hoursReasonHint"></div>'
                : '') +
            '<p class="form-error" id="whError" hidden></p>' +
            '<button type="button" class="btn btn--primary btn--block" id="whSave">' +
            escapeHtml(t('save')) + '</button>');

        const errEl = sheet.querySelector('#whError');
        const customField = sheet.querySelector('#whCustomField');
        const custom = sheet.querySelector('#whCustom');
        const save = sheet.querySelector('#whSave');

        function value() {
            const raw = (customField.hidden ? picked : custom.value.trim().replace(',', '.'));
            return raw === '' ? 0 : parseFloat(raw);
        }
        function refresh() {
            sheet.querySelectorAll('#whQuick .chip').forEach((c) => {
                const v = c.getAttribute('data-wh');
                c.classList.toggle('chip--on',
                    v !== 'more' && !customField.hidden === false && v === String(value()));
            });
            save.disabled = !(value() > 0);
        }

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
            sheet.querySelectorAll('#whQuick .chip').forEach((c) => {
                c.classList.toggle('chip--on',
                    c.getAttribute('data-wh') === v && v !== 'more');
            });
            save.disabled = !(value() > 0);
        });
        custom.addEventListener('input', () => {
            save.disabled = !(value() > 0);
        });

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
                if (fix) {
                    // API: правка часов — только руководитель
                    // (app/services/work_entries.py:212). Работник получает 403 —
                    // показываем его текст как есть, ничего не выдумываем.
                    const entries = await api.taskEntries(taskId);
                    const mine = (entries || []).find(
                        (e) => e.work_date === todayIso() &&
                            Number(e.user_id) === Number(state.user.id));
                    if (!mine) throw new Error(t('error'));
                    const reason = sheet.querySelector('#whReason');
                    const r = reason ? reason.value.trim() : '';
                    if (!r) throw new Error(t('fixNoReason'));
                    await api.updateEntry(mine.id, {
                        hours: hours.toFixed(2), reason: r
                    });
                } else {
                    const payload = {
                        task_id: taskId, work_date: todayIso(),
                        hours: hours.toFixed(2)
                    };
                    try {
                        await api.createEntry(payload);
                    } catch (netErr) {
                        if (isNetError(netErr)) {
                            // SPEC §22: офлайн-запись — в очередь, уйдёт при появлении сети
                            queueAdd(payload);
                            closeSheet();
                            toast(t('offlineSaved'), 'success');
                            // Сети нет — с сервера перечитать нельзя (упадёт на
                            // логин). Отмечаем часы локально, экран остаётся.
                            const data = state.meToday;
                            if (data && data.tasks) {
                                const tk = data.tasks.find((x) => x.id === taskId);
                                if (tk) tk.my_hours_today = num(tk.my_hours_today) + hours;
                            }
                            renderToday();
                            renderOfflineBanner();
                            return;
                        }
                        throw netErr;
                    }
                }
                closeSheet();
                toast(t('recorded'), 'success');
                state.meToday = null;
                state.money = null;
                await loadToday();
            } catch (err) {
                errEl.textContent = err.message || t('error');
                errEl.hidden = false;
                save.disabled = false;
            }
        });
    }

