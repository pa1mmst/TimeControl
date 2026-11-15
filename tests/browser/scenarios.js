// Браузерные сценарии. Запуск: node tests/browser/scenarios.js <имя>
// Окружение: BASE_URL, BOT_TOKEN, SEED (JSON из tests/browser/seed.py).
// Обычно запускаются через pytest: BROWSER_TESTS=1 pytest tests/test_browser.py
'use strict';
const { openApp, visibleScreens, text, expect, run } = require('./harness');

const SEED = JSON.parse(process.env.SEED || '{}');

const scenarios = {
  // Работник открывает приложение: виден экран «Сегодня», без JS-ошибок.
  async smoke_worker(data) {
    const { page } = await openApp(SEED.worker.tg_id);
    const screens = await visibleScreens(page);
    data.screens = screens;
    expect(screens.includes('screenToday'), 'работник: не виден screenToday, видно ' + screens);
    const body = await text(page, '#screenToday');
    expect(body.includes('Сбор урожая'), 'работник: нет задания «Сбор урожая» на «Сегодня»');
  },

  // Руководитель: «Сегодня», затем вкладки «Задания» и «Деньги», без JS-ошибок.
  async smoke_manager(data) {
    const { page } = await openApp(SEED.manager.tg_id);
    let screens = await visibleScreens(page);
    expect(screens.includes('screenManagerDash'), 'руководитель: не виден screenManagerDash, видно ' + screens);
    for (const [tab, screen] of [['tasks', 'screenTasks'], ['money', 'screenMoney']]) {
      await page.click('.bottom-nav__item[data-nav-target="' + tab + '"]');
      await page.waitForTimeout(700);
      screens = await visibleScreens(page);
      expect(screens.includes(screen), 'вкладка ' + tab + ': не виден ' + screen + ', видно ' + screens);
    }
    data.ok = true;
  },

  // Работник записывает 8 ч на «Сбор урожая»: после сохранения карточка в состоянии «записано».
  // Запись в базе проверяет pytest.
  async worker_record_hours(data) {
    const { page } = await openApp(SEED.worker.tg_id);
    const btn = page.locator('[data-action="enter-hours"][data-id="' + SEED.task_harvest + '"]');
    expect(await btn.count() === 1, 'нет кнопки записи часов для задания ' + SEED.task_harvest);
    await btn.click();
    await page.click('#whQuick [data-wh="8"]');
    await page.click('#whSave');
    await page.waitForTimeout(1200);
    const body = await text(page, '#screenToday');
    data.today = body.slice(0, 400);
    expect(await page.locator('[data-action="enter-hours"][data-id="' + SEED.task_harvest + '"]').count() === 0,
      'после сохранения кнопка «Записать часы» осталась');
    expect(/8/.test(body), 'после сохранения на экране нет «8»');
  },
};

const name = process.argv[2];
if (!scenarios[name]) {
  console.log(JSON.stringify({ ok: false, error: 'нет сценария ' + name + '; есть: ' + Object.keys(scenarios).join(', ') }));
  process.exit(2);
}
run((data) => scenarios[name](data));

