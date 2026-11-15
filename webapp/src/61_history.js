    /* ========================================================
     * 19b. v4: ИСТОРИЯ (работник)
     * ======================================================== */
    async function loadHistory(preset) {
        showScreen('history');
        state.histPreset = preset || 'week';
        document.querySelectorAll('#histSegment .segment__btn').forEach((b) => {
            b.classList.toggle('is-active',
                b.getAttribute('data-hist') === state.histPreset);
        });
        $('#histCustomRange').hidden = state.histPreset !== 'custom';
        let from = null, to = null;
        if (state.histPreset === 'week') {
            const r = weekRange(); from = r[0]; to = r[1];
        } else if (state.histPreset === 'month') {
            const r = monthRange(); from = r[0]; to = r[1];
        } else {
            if (state.histRange) { from = state.histRange[0]; to = state.histRange[1]; }
            else return; // ждём «Применить»
        }
        await refreshHistory(from, to);
    }

    async function refreshHistory(from, to) {
        const box = $('#historyList');
        box.innerHTML = '<div class="skeleton skeleton--card"></div>';
        try {
            const rows = await api.meHistory(from, to);
            if (!rows.length) {
                box.innerHTML = '<div class="empty"><div class="empty__text">' +
                    escapeHtml(t('histEmpty')) + '</div></div>';
                return;
            }
            box.innerHTML = '<div class="card">' + rows.map(historyRowHtml).join('') + '</div>';
        } catch (err) {
            box.innerHTML = '<p class="screen-message">' + escapeHtml(err.message) + '</p>';
        }
    }

