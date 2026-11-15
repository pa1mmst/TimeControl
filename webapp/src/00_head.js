/* ============================================================
 * Time Control — Telegram Mini App
 * File: webapp/app.js  (v=6)
 *
 * Экраны по ролям, bottom sheet'ы, ввод часов из задания.
 * Все тексты — только через словари I18N (ru/uk/es).
 * API base относительный ("/api"); роутер work_entries смонтирован
 * без префикса /api, пути /work-entries чинятся в api.request.
 * ============================================================ */

(function () {
    'use strict';

    /* ========================================================
     * 1. Telegram WebApp bridge
     * ======================================================== */
    const tg = window.Telegram ? window.Telegram.WebApp : null;

    /* ========================================================
     * 2. Configuration
     * ======================================================== */
    const CONFIG = {
        apiBase: (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api',
        defaultLang: 'ru',
        // username бота для кнопки «Открыть бота» (без @); можно переопределить
        // через window.APP_CONFIG.botUsername, вписав в index.html перед app.js
        botUsername: (window.APP_CONFIG && window.APP_CONFIG.botUsername) || 'agrofirmbot'
    };

    /* ========================================================
     * 3. Application state
     * ======================================================== */
    const state = {
        lang: CONFIG.defaultLang,
        user: null,
        view: 'loading',
        tasks: null,        // активные задания (TaskShortOut)
        entries: null,      // мои записи часов
        clients: null,
        users: null,
        inventory: null,
        reportsTab: 'summary',
        detailTask: null,   // задание в открытом листе
        sheetTaskId: null,
        heCtx: null,        // контекст экрана ввода часов
        histRange: null,    // [from, to] для экрана История
        matrixTaskId: null, // задание открытой матрицы
        summaryUserId: null, // сотрудник открытой карточки
        teamTab: 'people',  // активный сегмент экрана «Сотрудники»
        navStack: []        // стек экранов для Telegram BackButton
    };

