    /* ========================================================
     * 13. Форма «Новое задание»
     * ======================================================== */
    function ntError(message) {
        const el = $('#ntError');
        el.textContent = message || '';
        el.hidden = !message;
    }

    function chipHtml(kind, id, name, on) {
        return '<button type="button" class="chip' + (on ? ' chip--on' : '') +
            '" data-chip="' + kind + '" data-id="' + id + '">' + escapeHtml(name) + '</button>';
    }

    function chipIds(kind) {
        return Array.from(document.querySelectorAll(
            '#ntLocations [data-chip="' + kind + '"], #ntWorkers [data-chip="' + kind + '"]'
        )).filter((c) => c.classList.contains('chip--on'))
            .map((c) => parseInt(c.getAttribute('data-id'), 10));
    }

    async function openNewTask() {
        ntError('');
        showScreen('new-task');
        $('#ntDateStart').value = todayIso();
        $('#ntMultiDay').checked = false;
        $('#ntDateEndField').hidden = true;
        $('#ntDateEnd').value = '';
        try {
            const [clients, users] = await Promise.all([
                state.clients || api.getClients(),
                state.users || api.getUsers()
            ]);
            state.clients = clients;
            state.users = users;
            $('#ntClient').innerHTML = '<option value="">' + escapeHtml(t('empty')) + '</option>' +
                clients.map((c) =>
                    '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>').join('');
            const active = (users || []).filter((u) => u.is_active);
            $('#ntWorkers').innerHTML = active.length
                ? active.map((u) => chipHtml('worker', u.id, u.name, false)).join('')
                : '<p class="screen-message">' + escapeHtml(t('noWorkers')) + '</p>';
            $('#ntLocationsField').hidden = true;
            $('#ntLocations').innerHTML = '';
        } catch (err) {
            ntError(err.message);
        }
    }

    async function onClientChange() {
        const clientId = parseInt($('#ntClient').value, 10);
        if (!clientId) {
            $('#ntLocationsField').hidden = true;
            $('#ntLocations').innerHTML = '';
            return;
        }
        try {
            const locations = await api.request('/clients/' + clientId + '/locations');
            $('#ntLocationsField').hidden = false;
            $('#ntLocations').innerHTML = locations.length
                ? locations.map((l) => chipHtml('location', l.id, l.name, false)).join('')
                : '<p class="screen-message">' + escapeHtml(t('noLocations')) + '</p>';
        } catch (err) {
            ntError(err.message);
        }
    }

    async function submitNewTask(event) {
        event.preventDefault();
        ntError('');
        const title = $('#ntTitle').value.trim();
        const clientId = parseInt($('#ntClient').value, 10);
        if (!title) { ntError(t('taskNeedsTitle')); return; }
        if (!clientId) { ntError(t('taskNeedsClient')); return; }

        const locationIds = chipIds('location');
        const workerIds = chipIds('worker');

        const btn = $('#ntSubmit');
        btn.disabled = true;
        btn.textContent = t('saving');
        try {
            const multi = $('#ntMultiDay').checked;
            const dateStart = $('#ntDateStart').value || null;
            const dateEnd = multi ? ($('#ntDateEnd').value || null) : null;
            const task = await api.createTask({
                title: title,
                description: $('#ntDescr').value.trim() || null,
                client_id: clientId,
                location_ids: locationIds,
                date_start: dateStart,
                date_end: dateEnd,
                status: 'active',
                created_by: state.user.id
            });
            for (const uid of workerIds) {
                await api.assignUser(task.id, uid);
            }
            state.tasks = null;
            btn.disabled = false;
            btn.textContent = t('create');
            toast(t('taskCreated'), 'success');
            goBackHome();
        } catch (err) {
            btn.disabled = false;
            btn.textContent = t('create');
            ntError(err.message);
        }
    }

