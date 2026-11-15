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
