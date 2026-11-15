    /* ========================================================
     * 7. API client (initData — единственный способ авторизации)
     * ======================================================== */
    function entry_id(value) {
        const n = parseInt(value, 10);
        if (!n || n < 1) throw new Error('bad id');
        return n;
    }

    const api = {
        async request(path, options) {
            options = options || {};
            const base = CONFIG.apiBase.replace(/\/+$/, '');
            const url = (path.indexOf('/work-entries') === 0)
                ? base.replace(/\/api$/, '') + path
                : base + path;
            const headers = { 'Content-Type': 'application/json' };
            if (tg && tg.initData) headers['X-Telegram-Init-Data'] = tg.initData;
            if (options.headers) Object.assign(headers, options.headers);

            let response;
            try {
                response = await fetch(url, {
                    method: options.method || 'GET',
                    headers: headers,
                    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
                });
            } catch (err) {
                toast(t('network.error'), 'error');
                throw new Error(t('network.error'));
            }
            const text = await response.text();
            let data = null;
            if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
            if (!response.ok) {
                let detail = data && data.detail ? data.detail : 'HTTP ' + response.status;
                if (typeof detail !== 'string') detail = JSON.stringify(detail);
                const err = new Error(detail);
                // код ошибки от API (напр. 401 not_registered/deactivated)
                if (data && data.detail && typeof data.detail === 'object' && data.detail.code) {
                    err.code = data.detail.code;
                }
                err.status = response.status;
                throw err;
            }
            return data;
        },
        getMe() { return this.request('/users/me'); },
        setLang(lang) {
            return this.request('/me/lang', { method: 'PATCH', body: { lang: lang } });
        },
        getTasks() { return this.request('/tasks?status=active'); },
        getAllTasks() { return this.request('/tasks'); },
        getEntries(params) {
            return this.request('/work-entries' + (params ? '?' + params : ''));
        },
        getUsers() { return this.request('/users'); },
        getClients() { return this.request('/clients'); },
        getInventory() { return this.request('/inventory'); },
        getPayouts() { return this.request('/payroll/payouts'); },
        createTask(body) { return this.request('/tasks', { method: 'POST', body: body }); },
        assignUser(taskId, userId) {
            return this.request('/tasks/' + entry_id(taskId) + '/assignments',
                { method: 'POST', body: { user_id: entry_id(userId) } });
        },
        createEntry(body) { return this.request('/work-entries', { method: 'POST', body: body }); },
        updateEntry(entryId, body) {
            return this.request('/work-entries/' + entry_id(entryId), { method: 'PATCH', body: body });
        },
        taskSummary(taskId) {
            return this.request('/work-entries/task/' + entry_id(taskId) + '/summary');
        },
        taskEntries(taskId) {
            return this.request('/work-entries?task_id=' + entry_id(taskId));
        },
        updateTask(taskId, body) {
            return this.request('/tasks/' + entry_id(taskId), { method: 'PATCH', body: body });
        },
        createUser(body) { return this.request('/users', { method: 'POST', body: body }); },
        updateUser(userId, body) {
            return this.request('/users/' + entry_id(userId), { method: 'PATCH', body: body });
        },
        createClient(body) { return this.request('/clients', { method: 'POST', body: body }); },
        updateClient(clientId, body) {
            return this.request('/clients/' + entry_id(clientId), { method: 'PATCH', body: body });
        },
        createLocation(clientId, body) {
            return this.request('/clients/' + entry_id(clientId) + '/locations',
                { method: 'POST', body: body });
        },
        deleteLocation(clientId, locationId) {
            return this.request('/clients/' + entry_id(clientId) +
                '/locations/' + entry_id(locationId), { method: 'DELETE' });
        },
        createItem(body) { return this.request('/inventory', { method: 'POST', body: body }); },
        updateItem(itemId, body) {
            return this.request('/inventory/' + entry_id(itemId), { method: 'PATCH', body: body });
        },
        payPreview(start, end) {
            return this.request('/payroll/preview?start=' + start + '&end=' + end);
        },
        payClose(body) { return this.request('/payroll/close', { method: 'POST', body: body }); },
        createAdvance(body) { return this.request('/payroll/advances', { method: 'POST', body: body }); },
        // --- v4: агрегатные эндпоинты ---
        meToday() { return this.request('/me/today'); },
        meHistory(from, to) {
            const p = [];
            if (from) p.push('date_from=' + from);
            if (to) p.push('date_to=' + to);
            return this.request('/me/history' + (p.length ? '?' + p.join('&') : ''));
        },
        meMoney() { return this.request('/me/money'); },
        dashboardToday() { return this.request('/dashboard/today'); },
        taskMatrix(taskId) {
            return this.request('/tasks/' + entry_id(taskId) + '/matrix');
        },
        userSummary(userId) {
            return this.request('/users/' + entry_id(userId) + '/summary');
        }
    };

