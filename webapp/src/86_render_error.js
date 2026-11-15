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

