    /* ========================================================
     * 11. Лист задания (bottom sheet)
     * ======================================================== */
    async function openTaskSheet(taskId) {
        const sheet = openSheet('<p class="screen-message">' + escapeHtml(t('loading')) + '</p>');
        try {
            const [task, summary] = await Promise.all([
                api.request('/tasks/' + entry_id(taskId)),
                api.taskSummary(taskId).catch(() => null)
            ]);
            state.detailTask = task;
            state.sheetTaskId = taskId;

            const manager = isManager();
            // v5: роли «бригадир/учётчик» в UI нет — ввод за других только у руководителя
            const canEnter = manager && task.status === 'active';

            const workers = (task.assignments || []).map((a) => {
                const su = summary && summary.by_user.find(
                    (u) => u.user_id === a.user.id);
                return '<div class="row-line">' + avatarHtml(a.user.id, a.user.name) +
                    '<span class="row-line__name">' + escapeHtml(a.user.name) +
                    '</span>' +
                    (su ? '<span class="row-line__meta">' + escapeHtml(fmtHoursUnit(su.total_hours)) + '</span>' : '') +
                    '</div>';
            }).join('');

            const totalHours = summary ? summary.total_hours : 0;
            const totalEarned = summary
                ? summary.by_user.reduce((s, u) => s + num(u.total_amount), 0) : 0;

            const parts = [];
            if (task.client) parts.push(escapeHtml(task.client.name));
            if (task.locations && task.locations.length) {
                parts.push(task.locations.map((l) => escapeHtml(l.name)).join(', '));
            }

            let html =
                '<div class="card-title sheet__title">' + escapeHtml(task.title) + '</div>' +
                '<div class="card-sub"><span class="badge badge--' + escapeHtml(task.status) + '">' +
                escapeHtml(statusLabel(task.status)) + '</span></div>' +
                (parts.length ? '<div class="card-sub"><span>' + parts.join(' · ') + '</span></div>' : '') +
                ((task.date_start || task.date_end)
                    ? '<div class="card-sub"><span>' + escapeHtml(t('taskDates')) + ': ' +
                      escapeHtml(fmtDateRange(task.date_start, task.date_end)) + '</span></div>' : '') +
                (task.description ? '<div class="card-sub"><span>' + escapeHtml(task.description) + '</span></div>' : '') +
                '<h3 class="sheet__h3">' + escapeHtml(t('whoWorks')) + '</h3>' +
                (workers || '<p class="screen-message">' + escapeHtml(t('empty')) + '</p>') +
                '<div class="sheet__totals">' +
                '<div class="row-line"><span>' + escapeHtml(t('totalHours')) + '</span>' +
                '<span class="row-line__meta">' + escapeHtml(fmtHoursUnit(totalHours)) + '</span></div>' +
                '<div class="row-line"><span>' + escapeHtml(t('totalEarned')) + '</span>' +
                '<span class="row-line__meta">' + escapeHtml(fmtMoney(totalEarned)) + '</span></div>' +
                '</div>' +
                '<div class="sheet__actions">' +
                (canEnter
                    ? '<button class="btn btn--primary btn--block he-save" data-action="enter-hours" data-id="' + task.id + '">' +
                      escapeHtml(t('enterHours')) + '</button>' +
                      (manager
                          ? '<button class="btn btn--ghost btn--block" data-action="finish-task" data-id="' + task.id + '">' +
                            escapeHtml(t('finishTask')) + '</button>'
                          : '')
                    : '') +
                (manager
                    ? '<button class="btn btn--ghost btn--block" data-action="edit-task" data-id="' + task.id + '">' +
                      escapeHtml(t('editTask')) + '</button>'
                    : '') +
                '<button class="btn btn--ghost btn--block" data-action="close-sheet">' + escapeHtml(t('close')) + '</button>' +
                '</div>';
            sheet.innerHTML = html;
        } catch (err) {
            sheet.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>' +
                '<button class="btn btn--ghost btn--block" data-action="close-sheet">' + escapeHtml(t('close')) + '</button>';
        }
    }

    async function finishTask(taskId) {
        const sheet = openSheet(
            '<div class="card-title sheet__title">' + escapeHtml(t('finishTask')) + '</div>' +
            '<p class="screen-message">' + escapeHtml(t('finishConfirm')) + '</p>' +
            '<div class="sheet__actions">' +
            '<button class="btn btn--primary btn--block" data-action="finish-task-yes" data-id="' + taskId + '">' +
            escapeHtml(t('finish')) + '</button>' +
            '<button class="btn btn--ghost btn--block" data-action="close-sheet">' + escapeHtml(t('cancel')) + '</button>' +
            '</div>');
        sheet.setAttribute('data-finish', taskId);
    }

