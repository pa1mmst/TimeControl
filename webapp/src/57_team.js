    /* ========================================================
     * 15. ЛЮДИ: сегменты Люди · Инвентарь (только руководитель)
     * ======================================================== */
    async function loadTeam() {
        showScreen('team');
        // По умолчанию — сегмент «Люди»
        setTeamTab('people');
        try {
            state.users = await api.getUsers();
            renderTeam();
        } catch (err) {
            setList('teamList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>');
        }
    }

    function setTeamTab(tab) {
        const prev = state.teamTab;
        state.teamTab = tab;
        document.querySelectorAll('#teamSegment .segment__btn').forEach((b) => {
            b.classList.toggle('is-active', b.getAttribute('data-team-tab') === tab);
        });
        const peopleBlock = $('#teamPeopleBlock');
        const invBlock = $('#teamInvBlock');
        if (peopleBlock) peopleBlock.hidden = tab !== 'people';
        if (invBlock) invBlock.hidden = tab !== 'inventory';
        $('#btnAddWorker').hidden = tab !== 'people';
        $('#btnAddItem').hidden = tab !== 'inventory';
        // Подгружаем инвентарь при первом переходе на вкладку
        // (prev-гард не даёт loadInventory -> setTeamTab зациклиться)
        if (tab === 'inventory' && prev !== 'inventory' && !state.inventory) loadInventory();
    }

    function renderTeam() {
        const users = state.users || [];
        if (!users.length) {
            setList('teamList', '<div class="empty"><div class="empty__text">' +
                escapeHtml(t('empty')) + '</div></div>');
            return;
        }
        setList('teamList', users.map((u) =>
            '<div class="card card--tap" data-user-id="' + u.id + '" role="button" tabindex="0">' +
            '<div class="row-line">' + avatarHtml(u.id, u.name) +
            '<span class="row-line__name">' + escapeHtml(u.name) + '</span>' +
            '<span class="row-line__meta">' + escapeHtml(String(u.hourly_rate)) + '</span>' +
            '</div>' +
            '<div class="card-sub"><span>' + escapeHtml(roleLabel(u)) + '</span>' +
            '<span>' + escapeHtml(u.is_active ? t('profile.active') : t('profile.inactive')) + '</span></div>' +
            '</div>'
        ).join(''));
    }

    function openUserSheet(userId) {
        const u = (state.users || []).find((x) => x.id === userId);
        if (!u) return;
        const sheet = openSheet(
            '<div class="row-line">' + avatarHtml(u.id, u.name) +
            '<span class="row-line__name">' + escapeHtml(u.name) + '</span></div>' +
            '<form id="userEditForm" class="form">' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('workerName')) + '</span>' +
            '<input type="text" id="ueName" value="' + escapeHtml(u.name) + '" required></label>' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('workerRate')) + '</span>' +
            '<input type="number" id="ueRate" min="0" step="0.01" value="' + escapeHtml(String(u.hourly_rate)) + '"></label>' +
            '<div class="card-sub"><span>' + escapeHtml(t('profile.role')) + ': ' + escapeHtml(roleLabel(u)) + '</span>' +
            '<span>' + escapeHtml(u.is_active ? t('profile.active') : t('profile.inactive')) + '</span></div>' +
            '<button type="button" class="btn btn--ghost btn--block" data-action="open-user-summary" data-user="' + u.id + '">' +
            escapeHtml(t('dashOpenWorker')) + '</button>' +
            '<p class="form-error" id="ueError" hidden></p>' +
            '<button type="submit" class="btn btn--primary btn--block">' + escapeHtml(t('save')) + '</button>' +
            '</form>');
        sheet.querySelector('#userEditForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const errEl = sheet.querySelector('#ueError');
            errEl.hidden = true;
            try {
                await api.updateUser(u.id, {
                    name: sheet.querySelector('#ueName').value.trim(),
                    hourly_rate: sheet.querySelector('#ueRate').value || '0'
                });
                toast(t('rateSaved'), 'success');
                closeSheet();
                loadTeam();
            } catch (err) {
                errEl.textContent = err.message;
                errEl.hidden = false;
            }
        });
    }

    async function submitTeamAdd(event) {
        event.preventDefault();
        const errEl = $('#twError');
        errEl.hidden = true;
        const name = $('#twName').value.trim();
        if (!name) return;
        const btn = $('#twSubmit');
        btn.disabled = true;
        try {
            await api.createUser({
                name: name,
                phone: $('#twPhone').value.trim() || null,
                hourly_rate: $('#twRate').value ? $('#twRate').value : '0'
            });
            $('#teamAddForm').hidden = true;
            $('#twName').value = ''; $('#twPhone').value = ''; $('#twRate').value = '';
            btn.disabled = false;
            toast(t('saved'), 'success');
            loadTeam();
        } catch (e) {
            btn.disabled = false;
            errEl.textContent = e.message;
            errEl.hidden = false;
        }
    }

