    /* ========================================================
     * 5b. v5: офлайн-очередь самоввода часов (SPEC §22)
     * localStorage может быть недоступен (приватный режим) —
     * тогда очередь просто не работает, обычный путь.
     * ======================================================== */
    const QUEUE_KEY = 'tc_offline_queue';

    function queueLoad() {
        try {
            const arr = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }
    function queueSave(arr) {
        try { localStorage.setItem(QUEUE_KEY, JSON.stringify(arr)); } catch (e) { /* нет storage */ }
    }
    function queueAdd(payload) {
        const arr = queueLoad();
        arr.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            payload: payload,
            created_at: new Date().toISOString()
        });
        queueSave(arr);
    }
    function queueGet() { return queueLoad(); }
    function queueRemove(id) {
        queueSave(queueLoad().filter((it) => it.id !== id));
    }
    function queueCount() { return queueLoad().length; }

    /* сетевая ошибка? (fetch бросил / браузер офлайн) */
    function isNetError(err) {
        return !navigator.onLine || (err && err.message === t('network.error'));
    }

    /* прогон очереди: успех или отказ сервера (409 «уже есть») → убрать,
       сеть недоступна → оставить и прекратить прогон */
    async function syncQueue() {
        if (!queueCount()) { renderOfflineBanner(); return; }
        for (const it of queueGet()) {
            try {
                await api.createEntry(it.payload);
                queueRemove(it.id);
            } catch (err) {
                if (isNetError(err)) break;
                queueRemove(it.id);
            }
        }
        renderOfflineBanner();
        if (state.view === 'today' && !isManager()) {
            state.meToday = null;
            state.money = null;
            await loadToday();
        }
    }

    function renderOfflineBanner() {
        const box = $('#offlineBanner');
        if (!box) return;
        const n = queueCount();
        box.hidden = n === 0;
        if (n) box.textContent = '⏳ ' + t('offlineQueued', { n: n });
    }

