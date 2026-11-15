    /* ========================================================
     * 19e. ЭКРАН ЗАДАНИЯ «Часы по дням» (руководитель)
     * ======================================================== */
    async function openMatrix(taskId) {
        state.matrixTaskId = taskId;
        const body = $('#matrixBody');
        body.innerHTML = '<div class="skeleton skeleton--card"></div>';
        showScreen('matrix');
        try {
            const [m, task] = await Promise.all([
                api.taskMatrix(taskId), api.request('/tasks/' + entry_id(taskId))
            ]);
            if (!m.rows.length || !m.dates.length) {
                body.innerHTML = '<div class="empty"><div class="empty__text">' +
                    escapeHtml(t('matrixEmpty')) + '</div></div>';
                return;
            }
            const head = '<tr><th></th>' + m.dates.map((d) =>
                '<th>' + escapeHtml(fmtDateHuman(d)) + '</th>').join('') + '</tr>';
            const rows = m.rows.map((r) =>
                '<tr><th>' + escapeHtml(r.name) + '</th>' +
                m.dates.map((d) => {
                    const v = r.cells[d];
                    const tap = d <= todayIso()
                        ? ' matrix-cell--tap" data-mx-user="' + r.user_id + '" data-mx-date="' + d
                        : '';
                    return v === null || v === undefined
                        ? '<td class="matrix-cell matrix-cell--empty' + tap + '">·</td>'
                        : '<td class="matrix-cell' + tap + '">' + escapeHtml(fmtHours(v)) + '</td>';
                }).join('') + '</tr>').join('');
            body.innerHTML =
                '<p class="muted my-hours">' + escapeHtml(m.title) + '</p>' +
                '<div class="matrix-wrap"><table class="matrix">' +
                '<thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' +
                (task.status === 'active'
                    ? '<div class="sheet__actions">' +
                      '<button class="btn btn--primary btn--block he-save" data-action="mx-enter-hours" data-id="' +
                      task.id + '">' + escapeHtml(t('enterHours')) + '</button>' +
                      '<button class="btn btn--ghost btn--block" data-action="mx-finish" data-id="' +
                      task.id + '">' + escapeHtml(t('finishTask')) + '</button></div>'
                    : '');
        } catch (err) {
            body.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
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

