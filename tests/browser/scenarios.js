// Браузерные сценарии. Запуск: node tests/browser/scenarios.js <имя>
// Окружение: BASE_URL, BOT_TOKEN, SEED (JSON из tests/browser/seed.py).
// Обычно запускаются через pytest: BROWSER_TESTS=1 pytest tests/test_browser.py
'use strict';
const { openApp, visibleScreens, text, norm, monthBounds, expect, run } = require('./harness');

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

  /* ---------- Этап 0, срез «мелкие поломки» (ТЗ п. 1, 2, 7, 8, 9) ---------- */

  // П. 1: после записи у работника нет кнопки «Редактировать» (бэкенд её всё равно запрещает).
  // Вместо неё — плашка [data-testid="today-done"] «✓ Записано 8 ч» и подсказка,
  // что исправить может руководитель.
  async worker_recorded_card(data) {
    const { page } = await openApp(SEED.worker.tg_id);
    await page.click('[data-action="enter-hours"][data-id="' + SEED.task_harvest + '"]');
    await page.click('#whQuick [data-wh="8"]');
    await page.click('#whSave');
    await page.waitForTimeout(1200);
    expect(await page.locator('#screenToday [data-action="fix-hours"]').count() === 0,
      'у работника осталась кнопка fix-hours');
    const done = page.locator('#screenToday [data-testid="today-done"]');
    expect(await done.count() >= 1, 'нет плашки [data-testid="today-done"]');
    const doneText = norm(await done.first().innerText());
    data.done = doneText;
    expect(/8 ч/.test(doneText), 'на плашке нет «8 ч»: ' + doneText);
    const body = await text(page, '#screenToday');
    expect(/руководител/i.test(body), 'нет подсказки, что исправить может руководитель');
  },

  // П. 7: у работника деньги с валютой и запятой: «30,00 €» (50,00 заработано − 20,00 аванс).
  async worker_money_format(data) {
    const { page } = await openApp(SEED.worker.tg_id);
    const body = await text(page, '#screenToday');
    data.body = body.slice(0, 600);
    expect(body.includes('30,00 €'), 'на «Сегодня» работника нет «30,00 €»');
    expect(!/\d\.\d\d(?!\d)/.test(body), 'на «Сегодня» работника есть число вида 0.00');
  },

  // П. 8: «Мой инвентарь» из ☰ работника — свой список в шторке, экран руководителя не открывается,
  // после закрытия шторки работник на «Сегодня».
  async worker_inventory(data) {
    const { page } = await openApp(SEED.worker.tg_id);
    await page.click('#btnWorkerMenu');
    await page.click('[data-action="open-inventory"]');
    await page.waitForTimeout(800);
    const screens = await visibleScreens(page);
    data.screens = screens;
    expect(!screens.includes('screenTeam'), 'у работника открылся screenTeam');
    const inv = await text(page, '[data-testid="my-inventory"]');
    data.inv = inv;
    expect(inv.includes('Секатор №3'), 'в [data-testid="my-inventory"] нет «Секатор №3»');
    await page.click('[data-testid="my-inventory"] [data-action="close-sheet"]');
    await page.waitForTimeout(500);
    expect((await visibleScreens(page)).includes('screenToday'), 'после закрытия не виден screenToday');
  },

  // П. 9: сбой сети при запуске — отдельный экран ошибки с «Повторить», не экран «Вход».
  async network_error_retry(data) {
    let fail = true;
    const { page } = await openApp(SEED.worker.tg_id, {
      beforeGoto: async (pg) => {
        await pg.route('**/api/**', (r) => (fail ? r.abort('failed') : r.continue()));
      },
    });
    let screens = await visibleScreens(page);
    data.before = screens;
    expect(screens.includes('screenError'), 'при сбое сети не виден screenError, видно ' + screens);
    expect(!screens.includes('screenLogin'), 'при сбое сети показан screenLogin');
    fail = false;
    await page.click('#btnRetry');
    await page.waitForFunction(() => {
      const s = document.getElementById('screenToday');
      return s && !s.hidden;
    }, null, { timeout: 8000 }).catch(() => {});
    screens = await visibleScreens(page);
    data.after = screens;
    expect(screens.includes('screenToday'), 'после «Повторить» не виден screenToday, видно ' + screens);
    expect(!screens.includes('screenError'), 'после «Повторить» остался screenError');
  },

  /* ---------- Этап 0, срез «Деньги руководителя» (ТЗ п. 3, 4, 5, 6) ---------- */

  // П. 3: таблица из /api/payroll/preview: Человек · Часы · Заработано · Авансы · К выплате + итог.
  // Сид: Пётр 4 ч, 50,00 €, аванс 20,00 €, к выплате 30,00 €; Олег 6 ч, 60,00 €, 0,00 €, 60,00 €.
  async manager_money_table(data) {
    const { page } = await openApp(SEED.manager.tg_id);
    await page.click('.bottom-nav__item[data-nav-target="money"]');
    await page.waitForSelector('#screenMoney [data-testid="pay-table"]', { timeout: 5000 });
    const p = await text(page, '#screenMoney [data-testid="pay-row"][data-user="' + SEED.worker.id + '"]');
    const o = await text(page, '#screenMoney [data-testid="pay-row"][data-user="' + SEED.worker2.id + '"]');
    const total = await text(page, '#screenMoney [data-testid="pay-total"]');
    const period = await text(page, '#screenMoney [data-testid="pay-period"]');
    Object.assign(data, { p, o, total, period });
    for (const s of ['Пётр Сидоров', '4 ч', '50,00 €', '20,00 €', '30,00 €']) {
      expect(p.includes(s), 'строка Петра без «' + s + '»: ' + p);
    }
    for (const s of ['Олег Иванов', '6 ч', '60,00 €', '0,00 €']) {
      expect(o.includes(s), 'строка Олега без «' + s + '»: ' + o);
    }
    expect(total.includes('90,00 €'), 'итог без «90,00 €»: ' + total);
    expect(period.length > 0, 'не показан период [data-testid="pay-period"]');
    for (const sel of ['[data-period="month"]', '[data-period="prev"]']) {
      expect(await page.locator('#screenMoney ' + sel).count() === 1, 'нет кнопки периода ' + sel);
    }
    // П. 6: отчёты не на этом экране, ☰ на экране есть.
    expect(await page.locator('#screenMoney [data-action="open-reports"]').count() === 0,
      '«Отчёты» всё ещё на экране «Деньги»');
    expect(await page.locator('#screenMoney .screen-header .icon-btn:visible').count() >= 1,
      'на экране «Деньги» нет кнопки ☰');
  },

  // П. 5: «Выдать аванс» — форма Кому · Сумма · Дата; после сохранения таблица обновилась.
  async manager_advance(data) {
    const { page } = await openApp(SEED.manager.tg_id);
    await page.click('.bottom-nav__item[data-nav-target="money"]');
    await page.waitForSelector('#screenMoney [data-testid="pay-table"]', { timeout: 5000 });
    await page.click('[data-action="pay-advance-open"]');
    await page.selectOption('#advUser', String(SEED.worker.id));
    await page.fill('#advAmount', '15');
    const date = await page.inputValue('#advDate');
    expect(date === SEED.today, 'дата аванса по умолчанию не сегодня: ' + date);
    await page.click('[data-action="pay-advance"]');
    await page.waitForTimeout(1200);
    const p = await text(page, '#screenMoney [data-testid="pay-row"][data-user="' + SEED.worker.id + '"]');
    data.p = p;
    expect(p.includes('35,00 €'), 'после аванса у Петра авансы не 35,00 €: ' + p);
    expect(p.includes('15,00 €'), 'после аванса у Петра к выплате не 15,00 €: ' + p);
  },

  // П. 4: «Закрыть расчёт» — подтверждение Telegram с датами, числом людей и суммой; закрытие периода месяца.
  async manager_close(data) {
    const { page } = await openApp(SEED.manager.tg_id);
    await page.click('.bottom-nav__item[data-nav-target="money"]');
    await page.waitForSelector('#screenMoney [data-testid="pay-table"]', { timeout: 5000 });
    await page.click('[data-action="pay-close"]');
    await page.waitForTimeout(1500);
    const calls = await page.evaluate(() => window.__tgCalls.filter((c) => c.name === 'showConfirm'));
    data.calls = calls;
    expect(calls.length === 1, 'не было ровно одного showConfirm: ' + JSON.stringify(calls));
    const msg = norm(calls[0].args[0]);
    expect(msg.includes('90,00 €'), 'в подтверждении нет суммы 90,00 €: ' + msg);
    expect(/\b2\b/.test(msg), 'в подтверждении нет числа людей 2: ' + msg);
    expect(/\d/.test(msg.replace(/90,00|\b2\b/g, '')), 'в подтверждении нет дат: ' + msg);
    data.month = monthBounds();
  },

  // П. 6: «Отчёты» открываются из ☰ руководителя, экран называется не «Деньги».
  async manager_reports_menu(data) {
    const { page } = await openApp(SEED.manager.tg_id);
    await page.click('#btnManagerMenu3');
    await page.click('[data-action="open-reports"]');
    await page.waitForTimeout(800);
    const screens = await visibleScreens(page);
    data.screens = screens;
    expect(screens.includes('screenReports'), 'из меню не открылся screenReports');
    const title = await text(page, '#screenReports h2');
    data.title = title;
    expect(title && title !== 'Деньги', 'экран отчётов называется «' + title + '»');
  },
};

const name = process.argv[2];
if (!scenarios[name]) {
  console.log(JSON.stringify({ ok: false, error: 'нет сценария ' + name + '; есть: ' + Object.keys(scenarios).join(', ') }));
  process.exit(2);
}
run((data) => scenarios[name](data));

