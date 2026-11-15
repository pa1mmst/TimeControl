    /* ========================================================
     * 9. Общие куски экранов: периоды, карточка задания, плитка итога
     * ======================================================== */
    function weekRange() {
        const d = new Date();
        const day = (d.getDay() + 6) % 7; // Пн=0
        const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
        const sun = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 6);
        return [isoOf(mon), isoOf(sun)];
    }

    function monthRange() {
        const d = new Date();
        const first = new Date(d.getFullYear(), d.getMonth(), 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return [isoOf(first), isoOf(last)];
    }

    function isoOf(d) {
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function taskCardHtml(task, opts) {
        opts = opts || {};
        const hoursToday = num(task.hours_today);
        const parts = [];
        if (task.client_name) parts.push(escapeHtml(task.client_name));
        if (task.location_names && task.location_names.length) {
            parts.push(escapeHtml(task.location_names.join(', ')));
        }
        const sub = parts.join(' · ');
        const workers = (task.workers || []).map((w) =>
            escapeHtml(w.name)
        ).join(', ');
        const canEnter = opts.canEnter && task.status === 'active';
        const enteredLine = canEnter
            ? (hoursToday > 0
                ? '<div class="card-sub"><span>' + escapeHtml(t('enteredToday', { n: fmtHours(hoursToday) })) + '</span></div>'
                : '<div class="card-sub"><span class="muted">' + escapeHtml(t('notEnteredToday')) + '</span></div>')
            : '';
        const enterBtn = canEnter
            ? '<button class="btn btn--primary btn--block card__enter" data-action="enter-hours" data-id="' + task.id + '">' +
              escapeHtml(t('enterHours')) + '</button>'
            : '';
        return '<div class="card card--tap" data-task-id="' + task.id + '" role="button" tabindex="0">' +
            '<div class="card-title">' + escapeHtml(task.title) + '</div>' +
            (sub ? '<div class="card-sub"><span>' + sub + '</span></div>' : '') +
            (workers ? '<div class="card-sub"><span>' + workers + '</span></div>' : '') +
            '<div class="card-sub">' +
            (opts.hideStatus ? '' : '<span class="badge badge--' + escapeHtml(task.status) + '">' +
                escapeHtml(statusLabel(task.status)) + '</span>') +
            (hoursToday > 0
                ? '<span class="card-hours">' + escapeHtml(fmtHours(hoursToday)) + ' ' + escapeHtml(t('hoursUnit')) + '</span>'
                : '') +
            '</div>' +
            enteredLine + enterBtn +
            '</div>';
    }

    /* ========================================================
     * 9b. Возврат на «домашний» экран по роли
     * ======================================================== */
    function goBackHome() {
        if (isManager()) loadManagerDash();
        else loadToday();
    }

    // Плитка-итог с числом (количество заданий в отчёте).
    function statCell(label, count) {
        return '<div class="stat"><span class="stat__value">' + count +
            '</span><span class="stat__label">' + escapeHtml(label) + '</span></div>';
    }

