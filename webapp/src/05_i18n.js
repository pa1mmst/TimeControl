    /* ========================================================
     * 4. i18n — ru / uk / es
     * ======================================================== */
    const I18N = __I18N_JSON__;

    function t(key, vars) {
        const dict = I18N[state.lang] || I18N[CONFIG.defaultLang];
        let s = (dict && dict[key] !== undefined) ? dict[key]
            : (I18N.ru[key] !== undefined ? I18N.ru[key] : key);
        if (vars) {
            Object.keys(vars).forEach((k) => {
                s = s.replace('{' + k + '}', vars[k]);
            });
        }
        return s;
    }

    function normalizeLang(lang) {
        if (!lang) return CONFIG.defaultLang;
        const l = String(lang).toLowerCase();
        if (l.indexOf('uk') === 0) return 'uk';
        if (l.indexOf('es') === 0) return 'es';
        return 'ru';
    }

