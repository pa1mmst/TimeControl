    /* ========================================================
     * 16. ЗАКАЗЧИКИ (руководитель): строка тапается -> лист с локациями
     * ======================================================== */
    async function loadClients() {
        showScreen('clients');
        $('#btnAddClient').hidden = false;
        try {
            state.clients = await api.getClients();
            renderClients();
        } catch (err) {
            setList('clientsList', '<p class="screen-message">' + escapeHtml(err.message) + '</p>');
        }
    }

    function renderClients() {
        const clients = state.clients || [];
        if (!clients.length) {
            setList('clientsList', '<div class="empty"><div class="empty__text">' +
                escapeHtml(t('empty')) + '</div></div>');
            return;
        }
        setList('clientsList', clients.map((c) =>
            '<div class="card card--tap" data-client-id="' + c.id + '" role="button" tabindex="0">' +
            '<div class="card-title">' + escapeHtml(c.name) + '</div>' +
            ((c.locations || []).length
                ? '<div class="card-sub"><span>' +
                  c.locations.map((l) => escapeHtml(l.name)).join(', ') + '</span></div>'
                : '') +
            '</div>'
        ).join(''));
    }

    function openClientSheet(clientId) {
        const c = (state.clients || []).find((x) => x.id === clientId);
        if (!c) return;
        const sheet = openSheet(
            '<form id="clientEditForm" class="form">' +
            '<label class="form-field"><span class="form-label">' + escapeHtml(t('clientName')) + '</span>' +
            '<input type="text" id="ceName" value="' + escapeHtml(c.name) + '" required></label>' +
            '<h3 class="sheet__h3">' + escapeHtml(t('taskLocations')) + '</h3>' +
            '<div id="ceLocations"></div>' +
            '<button type="button" class="btn btn--ghost btn--block" data-action="add-location" data-id="' + c.id + '">' +
            escapeHtml(t('addLocation')) + '</button>' +
            '<p class="form-error" id="ceError" hidden></p>' +
            '<button type="submit" class="btn btn--primary btn--block">' + escapeHtml(t('save')) + '</button>' +
            '</form>');
        const locBox = sheet.querySelector('#ceLocations');
        const renderLocs = (locs) => {
            locBox.innerHTML = (locs || []).length
                ? locs.map((l) =>
                    '<div class="row-line"><span>' + escapeHtml(l.name) + '</span>' +
                    '<button type="button" class="btn btn-small" data-action="del-location" data-client="' +
                    c.id + '" data-id="' + l.id + '">' + escapeHtml(t('locationDelete')) + '</button></div>'
                ).join('')
                : '<p class="screen-message">' + escapeHtml(t('noLocations')) + '</p>';
        };
        renderLocs(c.locations);

        sheet.querySelector('[data-action="add-location"]').addEventListener('click', async () => {
            const name = prompt(t('locationName'), '');
            if (!name) return;
            try {
                await api.createLocation(c.id, { name: name });
                toast(t('locationAdded'), 'success');
                const locs = await api.request('/clients/' + c.id + '/locations');
                c.locations = locs;
                renderLocs(locs);
                state.clients = null;
            } catch (err) {
                toast(err.message, 'error');
            }
        });

        locBox.addEventListener('click', async (ev) => {
            const btn = ev.target.closest('[data-action="del-location"]');
            if (!btn) return;
            try {
                await api.deleteLocation(
                    parseInt(btn.getAttribute('data-client'), 10),
                    parseInt(btn.getAttribute('data-id'), 10));
                toast(t('locationDeleted'), 'success');
                const locs = await api.request('/clients/' + c.id + '/locations');
                c.locations = locs;
                renderLocs(locs);
                state.clients = null;
            } catch (err) {
                toast(err.message, 'error');
            }
        });

        sheet.querySelector('#clientEditForm').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const errEl = sheet.querySelector('#ceError');
            errEl.hidden = true;
            try {
                await api.updateClient(c.id, {
                    name: sheet.querySelector('#ceName').value.trim()
                });
                toast(t('clientSaved'), 'success');
                closeSheet();
                loadClients();
            } catch (err) {
                errEl.textContent = err.message;
                errEl.hidden = false;
            }
        });
    }

    async function submitClientAdd(event) {
        event.preventDefault();
        const errEl = $('#clError');
        errEl.hidden = true;
        const name = $('#clName').value.trim();
        if (!name) return;
        const btn = $('#clSubmit');
        btn.disabled = true;
        try {
            await api.createClient({
                name: name,
                notes: $('#clNotes').value.trim() || null
            });
            $('#clientAddForm').hidden = true;
            $('#clName').value = ''; $('#clNotes').value = '';
            btn.disabled = false;
            toast(t('saved'), 'success');
            loadClients();
        } catch (e) {
            btn.disabled = false;
            errEl.textContent = e.message;
            errEl.hidden = false;
        }
    }

