    /* ========================================================
     * 20. Events
     * ======================================================== */
    function bindEvents() {
        if (tg && tg.BackButton) tg.BackButton.onClick(navBack);
        document.querySelectorAll('.bottom-nav__item[data-nav-target]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-nav-target');
                if (target === 'tasks') loadTasks();
                else if (target === 'reports') loadReports();
                else if (target === 'team') loadTeam();
                else if (target === 'clients') loadClients();
                // v4
                else if (target === 'today') loadToday();
                else if (target === 'history') loadHistory('week');
                else if (target === 'money') loadMoney();
                else if (target === 'manager-dash') loadManagerDash();
            });
        });

        // Кнопка «Открыть бота» на экране логина (незарегистрированный пользователь)
        const btnRetry = $('#btnRetry');
        if (btnRetry) btnRetry.addEventListener('click', () => { location.reload(); });
        const btnOpenBot = $('#btnOpenBot');
        if (btnOpenBot) {
            btnOpenBot.addEventListener('click', () => {
                const username = (CONFIG.botUsername || 'agrofirmbot').replace('@', '');
                const url = 'https://t.me/' + username;
                if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
                else window.open(url, '_blank');
            });
        }

        // Делегированные клики по data-action
        document.addEventListener('click', (ev) => {
            const btn = ev.target.closest('[data-action]');
            if (btn) {
                const action = btn.getAttribute('data-action');
                const id = btn.getAttribute('data-id');
                if (action === 'hint-dismiss') {
                    markHintsSeen(hintRole());
                    document.querySelectorAll('.hints').forEach((el) => el.remove());
                }
                else if (action === 'new-task') openNewTask();
                else if (action === 'enter-for') {
                    openEnterForSheet(parseInt(btn.getAttribute('data-user'), 10));
                }
                else if (action === 'enter-hours') {
                    if (isManager()) openHoursEntry(parseInt(id, 10));
                    else openWorkerHoursSheet(parseInt(id, 10), false);
                }
                else if (action === 'fix-hours') openWorkerHoursSheet(parseInt(id, 10), true);
                else if (action === 'open-history') { closeSheet(); loadHistory('week'); }
                else if (action === 'open-money') { closeSheet(); loadMoney(); }
                else if (action === 'open-inventory') { closeSheet(); loadInventoryMine(); }
                else if (action === 'open-team') { closeSheet(); loadTeam(); }
                else if (action === 'open-clients') { closeSheet(); loadClients(); }
                else if (action === 'open-reports') { closeSheet(); loadReports(); }
                else if (action === 'pay-advance-open') openAdvanceSheet();
                else if (action === 'mx-enter-hours') openHoursEntry(parseInt(id, 10));
                else if (action === 'mx-finish') finishTaskFromScreen(parseInt(id, 10));
                else if (action === 'finish-task') finishTask(parseInt(id, 10));
                else if (action === 'finish-task-yes') doFinishTask(parseInt(id, 10));
                else if (action === 'edit-task') editTaskSheet(parseInt(id, 10));
                else if (action === 'close-sheet') closeSheet();
                else if (action === 'pay-preview') refreshPayPreview();
                else if (action === 'pay-close') closePayroll();
                else if (action === 'pay-advance') createAdvance();
                else if (action === 'assign-item') openAssignSheet(parseInt(id, 10));
                else if (action === 'assign-to') {
                    assignTo(parseInt(btn.getAttribute('data-item'), 10),
                        parseInt(btn.getAttribute('data-user'), 10));
                }
                else if (action === 'return-item') returnItem(parseInt(id, 10));
                // v4
                else if (action === 'open-matrix') openMatrix(parseInt(id, 10));
                else if (action === 'open-user-summary') {
                    openUserSummary(parseInt(btn.getAttribute('data-user'), 10));
                }
                return;
            }

            // Тап по ячейке «человек × день» на экране задания
            const mxCell = ev.target.closest('[data-mx-user]');
            if (mxCell && state.matrixTaskId) {
                openHoursEntry(state.matrixTaskId, {
                    date: mxCell.getAttribute('data-mx-date'),
                    userId: parseInt(mxCell.getAttribute('data-mx-user'), 10)
                });
                return;
            }
            // Тап по карточке задания (кроме кнопки внутри)
            const taskCard = ev.target.closest('[data-task-id]');
            if (taskCard && !ev.target.closest('[data-action]')) {
                const cardTid = parseInt(taskCard.getAttribute('data-task-id'), 10);
                if (isManager()) openMatrix(cardTid, state.view);
                else openTaskSheet(cardTid);
                return;
            }
            const userCard = ev.target.closest('[data-user-id]');
            if (userCard && !ev.target.closest('[data-action]')) {
                openUserSheet(parseInt(userCard.getAttribute('data-user-id'), 10));
                return;
            }
            const clientCard = ev.target.closest('[data-client-id]');
            if (clientCard && !ev.target.closest('[data-action]')) {
                openClientSheet(parseInt(clientCard.getAttribute('data-client-id'), 10));
                return;
            }
            // v4: тап по работнику в дашборде руководителя -> карточка
            const dashWorker = ev.target.closest('[data-dash-user]');
            if (dashWorker && !ev.target.closest('[data-action]')) {
                openUserSummary(parseInt(dashWorker.getAttribute('data-dash-user'), 10));
            }
        });

        // v4: сегменты истории
        document.querySelectorAll('#histSegment .segment__btn').forEach((b) => {
            b.addEventListener('click', () => loadHistory(b.getAttribute('data-hist')));
        });
        const histApply = $('#histApply');
        if (histApply) histApply.addEventListener('click', () => {
            const from = $('#histFrom').value, to = $('#histTo').value;
            if (!from || !to) return;
            state.histRange = [from, to];
            refreshHistory(from, to);
        });
        // v4: назад из матрицы и карточки
        const backMatrix = $('#btnBackMatrix');
        if (backMatrix) backMatrix.addEventListener('click', navBack);
        const backSummary = $('#btnBackSummary');
        if (backSummary) backSummary.addEventListener('click', navBack);

        // Чипы формы нового задания
        document.addEventListener('click', (ev) => {
            const chip = ev.target.closest('[data-chip]');
            if (!chip) return;
            const kind = chip.getAttribute('data-chip');
            chip.classList.toggle('chip--on');
        });

        // v5: меню ☰ работника
        const workerMenuBtn = $('#btnWorkerMenu');
        if (workerMenuBtn) workerMenuBtn.addEventListener('click', openWorkerMenu);
        // v5: меню ☰ руководителя (на трёх его экранах)
        ['#btnManagerMenu', '#btnManagerMenu2', '#btnManagerMenu3', '#btnManagerMenu4'].forEach((sel) => {
            const btn = $(sel);
            if (btn) btn.addEventListener('click', openManagerMenu);
        });
        // v5: сегменты «Активные | Завершённые» на «Заданиях»
        document.querySelectorAll('#tasksSegment .segment__btn').forEach((b) => {
            b.addEventListener('click', () => {
                state.tasksSeg = b.getAttribute('data-tasks-seg');
                loadTasks();
            });
        });

        // Экран ввода часов
        $('#heSame').addEventListener('change', () => {
            const same = $('#heSame').checked;
            $('#heSameHint').hidden = !same;
            if (same && !$('#heSameVal')) {
                const inp = document.createElement('div');
                inp.className = 'he-input-wrap he-input-wrap--top';
                inp.innerHTML = '<input class="he-input" id="heSameVal" inputmode="decimal" value="8">' +
                    '<span class="he-unit">' + escapeHtml(t('hoursUnit')) + '</span>';
                $('#heQuick').before(inp);
                inp.querySelector('#heSameVal').addEventListener('input', renderHoursEntry);
            } else if (!same) {
                const top = document.querySelector('.he-input-wrap--top');
                if (top) top.remove();
            }
            renderHoursEntry();
        });
        $('#heQuick').addEventListener('click', (ev) => {
            const chip = ev.target.closest('[data-quick]');
            if (!chip) return;
            const v = chip.getAttribute('data-quick');
            if ($('#heSame').checked) {
                const top = $('#heSameVal');
                if (top) { top.value = v; renderHoursEntry(); }
            } else {
                const focused = document.activeElement;
                if (focused && focused.classList.contains('he-input')) focused.value = v;
                updateSaveState();
            }
        });
        $('#hePeople').addEventListener('input', (ev) => {
            if (ev.target.classList.contains('he-input')) updateSaveState();
        });
        $('#heReason').addEventListener('input', updateSaveState);
        $('#heDate').addEventListener('change', () => {
            $('#heDateBtn').textContent =
                ($('#heDate').value === todayIso() ? t('today') + ', ' : '') +
                fmtDateHuman($('#heDate').value);
            renderHoursEntry();
        });
        $('#heDateBtn').addEventListener('click', () => $('#heDate').showPicker && $('#heDate').showPicker());
        $('#heSave').addEventListener('click', submitHoursEntry);
        const backHe = $('#btnBackHoursEntry');
        if (backHe) backHe.addEventListener('click', navBack);

        // Форма нового задания
        const form = $('#newTaskForm');
        if (form) form.addEventListener('submit', submitNewTask);
        const clientSel = $('#ntClient');
        if (clientSel) clientSel.addEventListener('change', onClientChange);
        const multi = $('#ntMultiDay');
        if (multi) multi.addEventListener('change', () => {
            $('#ntDateEndField').hidden = !$('#ntMultiDay').checked;
        });

        // Вкладки отчётов
        document.querySelectorAll('#reportsSegment .segment__btn').forEach((b) => {
            b.addEventListener('click', () => {
                state.reportsTab = b.getAttribute('data-reports-tab');
                document.querySelectorAll('#reportsSegment .segment__btn').forEach((x) => {
                    x.classList.toggle('is-active', x === b);
                });
                renderReportsBody();
            });
        });
        // Смена периода в отчётах
        document.addEventListener('change', (ev) => {
            if (ev.target.id === 'repStart' || ev.target.id === 'repEnd') {
                if (state.reportsTab === 'payouts') refreshPayPreview();
                else refreshManagerSummary();
            }
        });

        // v4: сегменты «Люди · Инвентарь» на экране «Сотрудники»
        document.querySelectorAll('#teamSegment .segment__btn').forEach((b) => {
            b.addEventListener('click', () => setTeamTab(b.getAttribute('data-team-tab')));
        });

        // Кнопки шапок экранов
        const newTaskBtn = $('#btnNewTask');
        if (newTaskBtn) newTaskBtn.addEventListener('click', openNewTask);
        const backNew = $('#btnBackNewTask');
        if (backNew) backNew.addEventListener('click', navBack);
        const addWorkerBtn = $('#btnAddWorker');
        if (addWorkerBtn) addWorkerBtn.addEventListener('click', () => {
            const f = $('#teamAddForm');
            if (f) f.hidden = !f.hidden;
        });
        const teamForm = $('#teamAddForm');
        if (teamForm) teamForm.addEventListener('submit', submitTeamAdd);
        const addClientBtn = $('#btnAddClient');
        if (addClientBtn) addClientBtn.addEventListener('click', () => {
            const f = $('#clientAddForm');
            if (f) f.hidden = !f.hidden;
        });
        const clientForm = $('#clientAddForm');
        if (clientForm) clientForm.addEventListener('submit', submitClientAdd);
        const addInvBtn = $('#btnAddItem');
        if (addInvBtn) addInvBtn.addEventListener('click', () => {
            const f = $('#invAddForm');
            if (f) f.hidden = !f.hidden;
        });
        const invForm = $('#invAddForm');
        if (invForm) invForm.addEventListener('submit', submitItemAdd);

    }

