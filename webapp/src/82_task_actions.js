    async function doFinishTask(taskId) {
        try {
            await api.updateTask(taskId, { status: 'done' });
            toast(t('taskFinished'), 'success');
            closeSheet();
            state.tasks = null;
            if (state.view === 'manager-dash') loadManagerDash();
            else if (state.view === 'tasks') loadTasks();
            else if (state.view === 'today') loadToday();
            else goBackHome();
        } catch (err) {
            closeSheet();
            toast(err.message, 'error');
        }
    }

    // Завершение задания с экрана задания: подтверждение Telegram -> «Задания»
    function finishTaskFromScreen(taskId) {
        const msg = t('finishConfirm');
        const run = async (ok) => {
            if (!ok) return;
            try {
                await api.updateTask(taskId, { status: 'done' });
                toast(t('taskFinished'), 'success');
                state.tasks = null;
                await loadTasks();
            } catch (err) {
                toast(err.message, 'error');
            }
        };
        if (tg && typeof tg.showConfirm === 'function') tg.showConfirm(msg, run);
        else run(window.confirm(msg));
    }

    function editTaskSheet(taskId) {
        const task = state.detailTask;
        if (!task || task.id !== taskId) return;
        const sheet = openSheet(
            '<form id="taskEditForm" class="form">' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('taskTitle')) + '</span>' +
            '<input type="text" id="teTitle" value="' + escapeHtml(task.title) + '" required></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('taskDescr')) + '</span>' +
            '<textarea id="teDescr" rows="2">' + escapeHtml(task.description || '') + '</textarea></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('taskDateStart')) + '</span>' +
            '<input type="date" id="teStart" value="' + escapeHtml(task.date_start || '') + '"></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('taskDateEnd')) + '</span>' +
            '<input type="date" id="teEnd" value="' + escapeHtml(task.date_end || '') + '"></label>' +
            '<p class="form-error" id="teError" hidden></p>' +
            '<button type="submit" class="btn btn--primary btn--block">' + escapeHtml(t('save')) + '</button>' +
            '</form>');
        sheet.querySelector('#taskEditForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const errEl = sheet.querySelector('#teError');
            errEl.hidden = true;
            try {
                await api.updateTask(task.id, {
                    title: sheet.querySelector('#teTitle').value.trim(),
                    description: sheet.querySelector('#teDescr').value.trim() || null,
                    date_start: sheet.querySelector('#teStart').value || null,
                    date_end: sheet.querySelector('#teEnd').value || null
                });
                toast(t('saved'), 'success');
                closeSheet();
                state.tasks = null;
                await openTaskSheet(task.id);
            } catch (err) {
                errEl.textContent = err.message;
                errEl.hidden = false;
            }
        });
    }

