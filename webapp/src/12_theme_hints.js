    /* ========================================================
     * Тёмная тема Telegram + подсказки первого запуска
     * ======================================================== */
    function hexToRgb(h) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
        if (!m) return null;
        const n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function rgbToHex(c) {
        return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    }
    function relLum(c) {
        const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    }
    function contrastOf(a, b) {
        const la = relLum(a), lb = relLum(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }
    function mixRgb(a, b, k) { return a.map((v, i) => v + (b[i] - v) * k); }

    const THEME_VARS = ['--bg', '--surface', '--surface-2', '--text', '--muted', '--accent', '--accent-ink'];

    // Цвета из tg.themeParams поверх тёмной палитры; слабые по контрасту — отбрасываем.
    function applyTheme() {
        const root = document.documentElement;
        THEME_VARS.forEach((v) => root.style.removeProperty(v));
        const dark = !!(tg && tg.colorScheme === 'dark');
        if (!dark) {
            delete root.dataset.theme;
        } else {
            root.dataset.theme = 'dark';
            const p = (tg && tg.themeParams) || {};
            const base = { bg: [0x17, 0x21, 0x2B], surface: [0x1F, 0x2C, 0x3A], text: [0xF1, 0xF5, 0xF9] };
            let bg = hexToRgb(p.bg_color);
            if (!bg || relLum(bg) > 0.2) bg = null;
            const eff = bg || base.bg;
            const set = (name, c) => root.style.setProperty(name, rgbToHex(c));
            if (bg) set('--bg', bg);
            let text = hexToRgb(p.text_color);
            if (text && contrastOf(text, eff) >= 7) set('--text', text); else text = base.text;
            let surf = hexToRgb(p.secondary_bg_color);
            if (surf && relLum(surf) <= 0.2 && contrastOf(surf, eff) < 1.6) {
                set('--surface', surf);
            } else if (bg) {
                surf = mixRgb(bg, text, 0.06); set('--surface', surf);
            } else surf = base.surface;
            const surf2 = mixRgb(surf, text, 0.08);
            if (bg) set('--surface-2', surf2);
            const hint = hexToRgb(p.hint_color);
            const s2 = bg ? surf2 : [0x2A, 0x3A, 0x4B];
            if (hint && contrastOf(hint, eff) >= 4.5 && contrastOf(hint, surf) >= 4.5 &&
                contrastOf(hint, s2) >= 4.5) set('--muted', hint);
            const btn = hexToRgb(p.button_color);
            const btnInk = hexToRgb(p.button_text_color);
            if (btn && btnInk && contrastOf(btn, eff) >= 4.5 && contrastOf(btn, s2) >= 4.5 &&
                contrastOf(btnInk, btn) >= 4.5) {
                set('--accent', btn); set('--accent-ink', btnInk);
            }
        }
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#FFFFFF');
    }

    const hintsSeenMem = {};
    function hintRole() { return isManager() ? 'manager' : 'worker'; }
    function hintsSeen(role) {
        if (hintsSeenMem[role]) return true;
        try { return localStorage.getItem('hintsSeen:' + role) === '1'; } catch (e) { return false; }
    }
    function markHintsSeen(role) {
        hintsSeenMem[role] = true;
        try { localStorage.setItem('hintsSeen:' + role, '1'); } catch (e) { /* нет storage */ }
    }
    function hintsHtml() {
        const role = hintRole();
        if (hintsSeen(role)) return '';
        const texts = role === 'manager'
            ? [t('hint.m1'), t('hint.m2'), t('hint.m3')]
            : [t('hint.w1'), t('hint.w2'), t('hint.w3')];
        return '<div class="hints" data-testid="hints">' +
            texts.map((s) => '<p class="hint" data-testid="hint">' + escapeHtml(s) + '</p>').join('') +
            '<button type="button" class="btn btn--ghost" data-action="hint-dismiss">' +
            escapeHtml(t('hint.dismiss')) + '</button></div>';
    }

    // Всплывающее сообщение (тост). Автоскрытие через 3.5с.
    let toastTimer = null;
    function toast(message, kind) {
        const root = $('#toastRoot');
        let el = document.getElementById('toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast';
            el.className = 'toast';
            root.appendChild(el);
        }
        el.textContent = message;
        el.className = 'toast' + (kind ? ' toast--' + kind : '');
        el.hidden = false;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
    }

