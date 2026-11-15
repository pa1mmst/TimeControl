    /* ========================================================
     * 6. Bottom sheets
     * ======================================================== */
    function openSheet(html, onClose) {
        const root = $('#sheetRoot');
        root.innerHTML =
            '<div class="sheet__backdrop"></div>' +
            '<div class="sheet" role="dialog">' +
            '<div class="sheet__handle"></div>' + html + '</div>';
        const backdrop = root.querySelector('.sheet__backdrop');
        backdrop.addEventListener('click', closeSheet);
        state._sheetClose = onClose || null;
        return root.querySelector('.sheet');
    }

    function closeSheet() {
        const root = $('#sheetRoot');
        root.innerHTML = '';
        const cb = state._sheetClose;
        state._sheetClose = null;
        if (cb) cb();
    }

    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && $('#sheetRoot').innerHTML) closeSheet();
    });

