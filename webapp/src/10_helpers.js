    /* ========================================================
     * 5. Utilities
     * ======================================================== */
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function $(sel) { return document.querySelector(sel); }

    function setList(id, html) {
        const el = $('#' + id);
        if (el) el.innerHTML = html;
    }

    function isManager() {
        return !!(state.user && state.user.is_manager);
    }

    function roleLabel(user) {
        if (!user) return t('role.unknown');
        return user.is_manager ? t('role.manager') : t('role.worker');
    }

    function statusLabel(status) { return t('status.' + status); }

    function num(v) {
        const n = parseFloat(v);
        return isNaN(n) ? 0 : n;
    }

    // Число часов без единицы, с точкой: для value полей ввода и для API.
    function fmtHours(v) {
        const n = num(v);
        return (n % 1 === 0) ? String(n) : n.toFixed(2).replace(/0$/, '');
    }

    function localeTag() {
        return state.lang === 'uk' ? 'uk-UA' : state.lang === 'es' ? 'es-ES' : 'ru-RU';
    }

    // Деньги для показа: «1 234,50 €» (разделители по языку интерфейса).
    function fmtMoney(v) {
        return num(v).toLocaleString(localeTag(), {
            minimumFractionDigits: 2, maximumFractionDigits: 2
        }) + ' €';
    }

    // Часы для показа: «8 ч», «7,5 ч».
    function fmtHoursUnit(v) {
        return num(v).toLocaleString(localeTag(), { maximumFractionDigits: 2 }) +
            ' ' + t('hoursUnit');
    }

    function todayIso() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function fmtDateHuman(iso) {
        if (!iso) return '';
        const loc = state.lang === 'uk' ? 'uk-UA'
            : state.lang === 'es' ? 'es-ES' : 'ru-RU';
        try {
            return new Date(iso + 'T00:00:00').toLocaleDateString(loc, {
                day: 'numeric', month: 'short'
            });
        } catch (e) { return iso; }
    }

    function fmtDateRange(a, b) {
        if (a && b && a !== b) return fmtDateHuman(a) + ' — ' + fmtDateHuman(b);
        if (a) return fmtDateHuman(a);
        return '';
    }

    function initials(name) {
        const parts = String(name || '?').trim().split(/\s+/);
        let s = parts[0].charAt(0) + (parts[1] ? parts[1].charAt(0) : '');
        return s.toUpperCase();
    }

    const AVATAR_COLORS = ['#4ADE80', '#60A5FA', '#FBBF24', '#F472B6', '#A78BFA', '#34D399', '#FB923C'];
    function avatarColor(id) {
        return AVATAR_COLORS[Math.abs(id || 0) % AVATAR_COLORS.length];
    }

    function avatarHtml(id, name) {
        return '<span class="avatar" style="background:' + avatarColor(id) + '">' +
            escapeHtml(initials(name)) + '</span>';
    }

