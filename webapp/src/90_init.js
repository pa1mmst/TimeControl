    function renderError(message, code, forceLogin) {
        if (!forceLogin && code !== 'not_registered' && code !== 'deactivated') {
            document.querySelectorAll('.screen').forEach((sc) => { sc.hidden = true; });
            const errScreen = $('#screenError');
            errScreen.hidden = false;
            $('#errorMessage').textContent = message || t('network.error');
            const nav = $('#bottomNav');
            if (nav) nav.hidden = true;
            navReset();
            return;
        }
        $('#screenLoading').hidden = true;
        const login = $('#screenLogin');
        login.hidden = false;
        login.querySelector('[data-i18n="loginSubtitle"]').textContent = message;
        // Кнопка «Открыть бота» — только для незарегистрированных (заявка через бота)
        const btn = $('#btnOpenBot');
        if (btn) btn.hidden = code !== 'not_registered';
        const steps = $('#loginSteps');
        if (steps) steps.hidden = code !== 'not_registered';
        navReset();
    }

    /* ========================================================
     * 21. Startup
     * ======================================================== */
    async function init() {
        state.lang = normalizeLang(
            (tg && tg.initDataUnsafe && tg.initDataUnsafe.user &&
                tg.initDataUnsafe.user.language_code) || CONFIG.defaultLang);
        applyI18n();
        applyTheme();
        if (tg && typeof tg.onEvent === 'function') tg.onEvent('themeChanged', applyTheme);
        bindEvents();
        showScreen('loading');

        if (!tg || !tg.initData) {
            renderError('Откройте приложение через меню бота в Telegram.', null, true);
            return;
        }

        try {
            state.user = await api.getMe();
        } catch (err) {
            // 401 с кодом: понятное сообщение вместо «Проверка данных...»
            if (err.code === 'not_registered') {
                renderError(t('webapp_not_registered'), 'not_registered');
            } else if (err.code === 'deactivated') {
                renderError(t('webapp_deactivated'), 'deactivated');
            } else {
                renderError(err.message || t('network.error'));
            }
            return;
        }
        try {
            if (state.user.lang) {
                state.lang = normalizeLang(state.user.lang);
                applyI18n();
            }
            renderNav();
            await (isManager() ? loadManagerDash() : loadToday());
            // SPEC §22: офлайн-очередь — прогон при старте и при появлении сети
            if (!isManager()) {
                renderOfflineBanner();
                syncQueue();
                window.addEventListener('online', () => { syncQueue(); });
            }
        } catch (err) {
            renderError(err.message || t('network.error'));
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
