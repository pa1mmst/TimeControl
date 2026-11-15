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

