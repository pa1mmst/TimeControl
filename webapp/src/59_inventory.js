    /* ========================================================
     * 17. ИНВЕНТАРЬ: сегмент экрана «Люди» (руководитель)
     *     и лист «Мой инвентарь» (работник)
     * ======================================================== */
    // v5: «Мой инвентарь» из меню ☰ работника — лист снизу. /inventory доступен
    // только руководителю, поэтому свой список берётся из /me/money.
    async function loadInventoryMine() {
        const sheet = openSheet('<div data-testid="my-inventory"><p class="screen-message">' +
            escapeHtml(t('loading')) + '</p></div>');
        try {
            const mine = await api.meMoney();
            const items = (mine && mine.inventory) || [];
            const list = (items || []).length
                ? items.map((i) =>
                    '<div class="row-line"><span>' + escapeHtml(i.name) + '</span></div>').join('')
                : '<p class="screen-message">' + escapeHtml(t('moneyNoInventory')) + '</p>';
            sheet.innerHTML = '<div class="sheet__handle"></div><div data-testid="my-inventory">' +
                '<div class="card-title sheet__title">' + escapeHtml(t('myInventory')) + '</div>' +
                list +
                '<button class="btn btn--ghost btn--block" data-action="close-sheet">' +
                escapeHtml(t('close')) + '</button></div>';
        } catch (err) {
            sheet.innerHTML = '<div class="sheet__handle"></div><div data-testid="my-inventory">' +
                '<p class="screen-message">' + escapeHtml(err.message) + '</p>' +
                '<button class="btn btn--ghost btn--block" data-action="close-sheet">' +
                escapeHtml(t('close')) + '</button></div>';
        }
    }

    async function loadInventory() {
        // Рендерим внутри screenTeam: активный сегмент «Инвентарь»
        showScreen('team');
        setTeamTab('inventory');
        try {
            state.inventory = await api.getInventory();
            renderInventory();
        } catch (err) {
            setList('inventoryList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>');
        }
    }

    function renderInventory() {
        const items = state.inventory || [];
        if (!items.length) {
            setList('inventoryList', '<div class="empty"><div class="empty__text">' +
                escapeHtml(t('inventoryEmpty')) + '</div></div>');
            return;
        }
        setList('inventoryList', items.map((i) =>
            '<div class="card">' +
            '<div class="card-title">' + escapeHtml(i.name) + '</div>' +
            '<div class="card-sub"><span>' + escapeHtml(t('holder')) + ': ' +
            (i.holder ? escapeHtml(i.holder.name) : escapeHtml(t('onStock'))) + '</span></div>' +
            '<div class="card-sub">' +
            '<button class="btn btn-small" data-action="assign-item" data-id="' + i.id + '">' +
            escapeHtml(t('assign')) + '</button>' +
            (i.holder
                ? '<button class="btn btn-small" data-action="return-item" data-id="' + i.id + '">' +
                  escapeHtml(t('returnStock')) + '</button>'
                : '') +
            '</div>' +
            '</div>'
        ).join(''));
    }

    function openAssignSheet(itemId) {
        const item = (state.inventory || []).find((x) => x.id === itemId);
        if (!item) return;
        const users = (state.users || []).filter((u) => u.is_active);
        const sheet = openSheet(
            '<div class="card-title sheet__title">' + escapeHtml(item.name) + '</div>' +
            '<p class="screen-message">' + escapeHtml(t('pickHolder')) + '</p>' +
            '<div class="list">' +
            users.map((u) =>
                '<button class="row-line row-line--btn" data-action="assign-to" data-item="' + item.id +
                '" data-user="' + u.id + '">' + avatarHtml(u.id, u.name) +
                '<span class="row-line__name">' + escapeHtml(u.name) + '</span></button>').join('') +
            '</div>' +
            '<button class="btn btn--ghost btn--block" data-action="close-sheet">' + escapeHtml(t('cancel')) + '</button>');
    }

    async function assignTo(itemId, userId) {
        try {
            await api.updateItem(itemId, { holder_id: userId });
            toast(t('itemSaved'), 'success');
            closeSheet();
            state.inventory = null;
            await loadInventory();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function returnItem(itemId) {
        try {
            await api.updateItem(itemId, { holder_id: null });
            toast(t('itemSaved'), 'success');
            state.inventory = null;
            await loadInventory();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function submitItemAdd(event) {
        event.preventDefault();
        const errEl = $('#invError');
        errEl.hidden = true;
        const name = $('#invName').value.trim();
        if (!name) return;
        const btn = $('#invSubmit');
        btn.disabled = true;
        try {
            await api.createItem({
                name: name,
                notes: $('#invNotes').value.trim() || null,
                holder_id: null
            });
            $('#invAddForm').hidden = true;
            $('#invName').value = ''; $('#invNotes').value = '';
            btn.disabled = false;
            toast(t('itemSaved'), 'success');
            loadInventory();
        } catch (e) {
            btn.disabled = false;
            errEl.textContent = e.message;
            errEl.hidden = false;
        }
    }

