    /* ========================================================
     * 10. Список заданий (вкладка руководителя)
     * ======================================================== */
    async function loadTasks() {
        showScreen('tasks');
        // v5 §3.2: сегменты Активные | Завершённые
        if (!state.tasksSeg) state.tasksSeg = 'active';
        document.querySelectorAll('#tasksSegment .segment__btn').forEach((b) => {
            b.classList.toggle('is-active',
                b.getAttribute('data-tasks-seg') === state.tasksSeg);
        });
        try {
            state.tasks = await (state.tasksSeg === 'active'
                ? api.getTasks() : api.getAllTasks());
            renderTasks();
        } catch (err) {
            setList('tasksList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>');
        }
    }

    function renderTasks() {
        let tasks = state.tasks || [];
        // v5: фильтр по сегменту (getAllTasks отдаёт все статусы)
        if (state.tasksSeg === 'active') {
            tasks = tasks.filter((tk) => tk.status === 'active');
        } else {
            tasks = tasks.filter((tk) => tk.status === 'done');
        }
        tasks = sortTasksByTitle(tasks);
        const newBtn = '<button type="button" class="btn btn--primary btn--block tasks-new" data-action="new-task">' +
            escapeHtml(t('tasksNewPlus')) + '</button>';
        if (!tasks.length) {
            setList('tasksList', '<div class="empty"><div class="empty__text">' +
                escapeHtml(t('tasksNone')) + '</div>' +
                '<button type="button" class="btn btn--primary" data-action="new-task">' +
                escapeHtml(t('tasksCreate')) + '</button></div>');
            return;
        }
        setList('tasksList', newBtn + tasks.map((tk) =>
            taskCardHtml(tk, { canEnter: true, hideStatus: state.tasksSeg === 'active' })).join(''));
    }

