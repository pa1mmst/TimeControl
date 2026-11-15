// Сценарии этапа 1 ТЗ 11.11.2026 («понятность»). Подключаются из scenarios.js.
// Сид (tests/browser/seed.py): Пётр (worker) и Олег (worker2) сегодня отметились на «Поливе»
// (4 ч и 6 ч), Иван (worker3) назначен на «Сбор урожая — томаты» и сегодня часов не записал.
'use strict';
const { openApp, visibleScreens, text, norm, expect } = require('./harness');

const ROLE_WORDS = /Сотрудник|Руководитель|Пользователь|Работник/;

// Цвет «красный»: заметно больше красного, чем зелёного и синего.
function isRed(rgb) {
  const m = String(rgb).match(/\d+/g);
  if (!m) return false;
  const [r, g, b] = m.map(Number);
  return r > 170 && g < 110 && b < 110;
}

async function gotoTab(page, tab) {
  await page.click('.bottom-nav__item[data-nav-target="' + tab + '"]');
  await page.waitForTimeout(700);
}

async function cardTitles(page, screenSel) {
  return page.$$eval(screenSel + ' .card-title', (els) => els.map((e) => e.innerText.trim()));
}

async function readabilityCheck(data, scheme) {
    const { page } = await openApp(SEED_REF.worker.tg_id, { colorScheme: scheme });
    const r = await page.evaluate(() => {
      const lum = (c) => {
        const [r, g, b] = (c.match(/[\d.]+/g) || [255, 255, 255]).slice(0, 3).map(Number).map((v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const bgOf = (el) => {
        for (let e = el; e; e = e.parentElement) {
          const c = getComputedStyle(e).backgroundColor;
          if (c && !/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent') return c;
        }
        return 'rgb(255, 255, 255)';
      };
      const contrast = (el) => {
        const a = lum(getComputedStyle(el).color);
        const b = lum(bgOf(el));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      const vis = (el) => el.offsetParent !== null && el.innerText.trim() !== '';
      const body = parseFloat(getComputedStyle(document.body).fontSize);
      const small = Array.from(document.querySelectorAll('#screenToday *'))
        .filter((e) => vis(e) && e.children.length === 0)
        .map((e) => ({ t: e.innerText.trim().slice(0, 40), fs: parseFloat(getComputedStyle(e).fontSize) }))
        .filter((x) => x.fs < 14);
      const lowContrast = Array.from(document.querySelectorAll('#screenToday *'))
        .filter((e) => vis(e) && e.children.length === 0)
        .map((e) => ({ t: e.innerText.trim().slice(0, 40), c: Math.round(contrast(e) * 100) / 100 }))
        .filter((x) => x.c < 4.5);
      const lowButtons = Array.from(document.querySelectorAll('#screenToday .btn, .bottom-nav__item'))
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ t: e.innerText.trim().slice(0, 30), h: e.getBoundingClientRect().height }))
        .filter((x) => x.h < 44);
      const bgLum = Math.round(lum(bgOf(document.body)) * 1000) / 1000;
      return { body, small, lowContrast, lowButtons, bgLum };
    });
    Object.assign(data, r);
    expect(r.body >= 16, 'шрифт body ' + r.body + 'px < 16');
    expect(r.small.length === 0, 'текст мельче 14px: ' + JSON.stringify(r.small));
    expect(r.lowContrast.length === 0, 'контраст < 4.5:1: ' + JSON.stringify(r.lowContrast));
    expect(r.lowButtons.length === 0, 'кнопки ниже 44px: ' + JSON.stringify(r.lowButtons));
}

let SEED_REF = null;

module.exports = (SEED) => (SEED_REF = SEED, {
  /* ---------- 4.2 Шапка + 4.4 читаемость ---------- */

  // Шапка: в ней нет выбора языка и подписи роли; ☰ на каждом главном экране; язык — в меню ☰.
  async header_clean(data) {
    for (const who of ['worker', 'manager']) {
      const { page } = await openApp(SEED[who].tg_id);
      expect(!(await page.isVisible('#langSelect')), who + ': выбор языка виден в шапке');
      const meta = await text(page, '.app-header');
      data[who + '_header'] = meta;
      expect(!ROLE_WORDS.test(meta), who + ': в шапке подпись роли: ' + meta);
      const screens = who === 'worker'
        ? [[null, 'screenToday']]
        : [[null, 'screenManagerDash'], ['tasks', 'screenTasks'], ['money', 'screenMoney']];
      for (const [tab, screen] of screens) {
        if (tab) await gotoTab(page, tab);
        const n = await page.locator('#' + screen + ' .screen-header .icon-btn:visible').count();
        expect(n >= 1, who + ': нет ☰ на ' + screen);
      }
      await page.locator('.screen:not([hidden]) .screen-header .icon-btn:visible').first().click();
      await page.waitForTimeout(400);
      expect(await page.locator('.sheet #menuLang, #menuLang').count() >= 1, who + ': в меню ☰ нет выбора языка');
    }
  },

  // 4.4: основной текст от 16 px, кнопки от 44 px, второстепенный текст контрастный (>= 4.5:1).
  async readability(data) { return readabilityCheck(data, 'light'); },

  // 4.4: тёмная тема Telegram (colorScheme=dark): тёмный фон и те же требования к тексту.
  async readability_dark(data) {
    await readabilityCheck(data, 'dark');
    expect(data.bgLum < 0.2, 'в тёмной теме фон не тёмный, яркость ' + data.bgLum);
  },

  // 4.3: первый запуск — 2–3 подсказки на роль; «Понятно» их убирает, после перезапуска их нет.
  async first_run_hints(data) {
    for (const who of ['worker', 'manager']) {
      const { page } = await openApp(SEED[who].tg_id);
      const hints = page.locator('.screen:not([hidden]) [data-testid="hint"]');
      const n = await hints.count();
      data[who] = n;
      expect(n >= 2 && n <= 3, who + ': подсказок ' + n + ', ждём 2–3');
      await page.locator('.screen:not([hidden]) [data-action="hint-dismiss"]').first().click();
      await page.waitForTimeout(400);
      expect(await hints.count() === 0, who + ': «Понятно» не убрал подсказки');
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('screenLoading').hidden, null, { timeout: 10000 });
      await page.waitForTimeout(500);
      expect(await page.locator('[data-testid="hint"]').count() === 0, who + ': подсказки вернулись после перезапуска');
    }
  },

  /* ---------- 4.2 Работник, «Сегодня» ---------- */

  // Три строки денег с подписями; без пояснения про минус, если минуса нет.
  async worker_today_money(data) {
    const { page } = await openApp(SEED.worker.tg_id);
    const rows = {
      earned: ['Заработано', '50,00 €'], advances: ['Авансы', '20,00 €'], topay: ['К выплате', '30,00 €'],
    };
    for (const [k, [label, sum]] of Object.entries(rows)) {
      const tx = await text(page, '#screenToday [data-testid="pay-' + k + '"]');
      data[k] = tx;
      expect(tx.includes(label) && tx.includes(sum), 'pay-' + k + ': ждём «' + label + '» и «' + sum + '», есть: ' + tx);
    }
    expect(await page.locator('#screenToday [data-testid="pay-negative-note"]').count() === 0,
      'пояснение про минус при плюсовом остатке');
  },

  // Аванс больше заработка: пояснение текстом, сумма обычным цветом (pytest добавляет аванс 100 €).
  async worker_today_negative(data) {
    const { page } = await openApp(SEED.worker.tg_id);
    const note = await text(page, '#screenToday [data-testid="pay-negative-note"]');
    data.note = note;
    expect(note.includes('Аванс больше заработка на 70,00 €'), 'нет пояснения про минус: ' + note);
    const color = await page.$eval('#screenToday [data-testid="pay-topay"]', (e) => getComputedStyle(e).color);
    data.color = color;
    expect(!isRed(color), 'строка «К выплате» красная: ' + color);
  },

  // Коллеги — простой текст «С вами: …», не кнопки и не чипы.
  async worker_coworkers(data) {
    const { page } = await openApp(SEED.worker.tg_id);
    const card = page.locator('#screenToday .card', { hasText: 'Сбор урожая' }).first();
    const tx = norm(await card.locator('[data-testid="coworkers"]').innerText().catch(() => ''));
    data.coworkers = tx;
    expect(/^С вами: /.test(tx), 'нет строки «С вами: …»: ' + tx);
    for (const n of ['Олег Иванов', 'Иван Петров']) expect(tx.includes(n), 'в «С вами» нет ' + n);
    expect(!tx.includes('Пётр Сидоров'), 'в «С вами» указан сам работник');
    expect(await card.locator('[data-testid="coworkers"] button, [data-testid="coworkers"] .chip').count() === 0,
      'коллеги оформлены как кнопки/чипы');
  },

  // История в одном формате: «15 нояб. · Полив · Поле 2 · 4 ч».
  async worker_history_format(data) {
    const { page } = await openApp(SEED.worker.tg_id);
    const rows = await page.$$eval('#screenToday [data-testid="history-row"]',
      (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').replace(/[  ]/g, ' ').trim()));
    data.rows = rows;
    expect(rows.length >= 1, 'нет строк истории [data-testid="history-row"]');
    const water = rows.find((r) => r.includes('Полив'));
    expect(water && /^\d{1,2} \S+ · Полив · Поле 2 · 4 ч$/.test(water), 'строка истории не в формате: ' + water);
  },

  // 4.3: быстрые кнопки часов 4, 6, 8, 10, 12 у работника (у руководителя — в manager_enter_for).
  async worker_quick_hours(data) {
    const { page } = await openApp(SEED.worker.tg_id);
    await page.click('[data-action="enter-hours"][data-id="' + SEED.task_harvest + '"]');
    const vals = await page.$$eval('#whQuick [data-wh]', (els) => els.map((e) => e.dataset.wh));
    data.vals = vals;
    expect(JSON.stringify(vals.filter((v) => v !== 'more')) === '["4","6","8","10","12"]', 'быстрые часы: ' + vals);
  },

  /* ---------- 4.2 Руководитель, «Сегодня» ---------- */

  // Одна строка-итог вместо трёх плиток.
  async manager_dash_summary(data) {
    const { page } = await openApp(SEED.manager.tg_id);
    const s = await text(page, '#screenManagerDash [data-testid="dash-summary"]');
    data.summary = s;
    expect(s === 'Назначено 3 · Отметились 2 · Часов 10', 'строка-итог: ' + s);
    expect(await page.locator('#screenManagerDash .fab, #screenManagerDash [data-action="new-task"]').count() === 0,
      'кнопка нового задания всё ещё на «Сегодня»');
    const chips = await page.$$eval('#screenManagerDash .chip', (els) => els.map((e) => e.innerText.trim()));
    data.chips = chips;
    expect(!chips.some((c) => /—\s*$/.test(c)), 'чипы с прочерком «Имя —»: ' + chips);
    const redNames = await page.$$eval('#screenManagerDash *', (els) => els
      .filter((e) => e.children.length === 0 && /Иван Петров|Пётр Сидоров|Олег Иванов/.test(e.innerText || ''))
      .map((e) => getComputedStyle(e).color));
    expect(!redNames.some(isRed), 'имена людей красным: ' + redNames);
  },

  // Список «Не отметились» с «Записать за него» (быстрые часы те же: 4…12). pytest проверяет запись.
  async manager_enter_for(data) {
    const { page } = await openApp(SEED.manager.tg_id);
    const row = page.locator('#screenManagerDash [data-testid="not-checked-in"] [data-testid="nci-row"][data-user="' + SEED.worker3.id + '"]');
    expect(await row.count() === 1, 'нет строки Ивана в «Не отметились»');
    const rowText = norm(await row.innerText());
    data.row = rowText;
    expect(rowText.includes('Иван Петров') && rowText.includes('Сбор урожая'), 'строка: ' + rowText);
    const others = await page.locator('#screenManagerDash [data-testid="nci-row"]').count();
    expect(others === 1, 'в «Не отметились» ' + others + ' строк, ждём 1 (Иван)');
    const btn = row.locator('[data-action="enter-for"]');
    expect(norm(await btn.innerText()) === 'Записать за него', 'текст кнопки: ' + (await btn.innerText()));
    await btn.click();
    const vals = await page.$$eval('#whQuick [data-wh]', (els) => els.map((e) => e.dataset.wh));
    data.vals = vals;
    expect(JSON.stringify(vals.filter((v) => v !== 'more')) === '["4","6","8","10","12"]', 'быстрые часы руководителя: ' + vals);
    await page.click('#whQuick [data-wh="8"]');
    await page.click('#whSave');
    await page.waitForTimeout(1500);
    expect(await page.locator('#screenManagerDash [data-testid="nci-row"][data-user="' + SEED.worker3.id + '"]').count() === 0,
      'Иван остался в «Не отметились» после записи');
  },

  /* ---------- 4.2 Руководитель, «Задания» + 4.3 пустые экраны ---------- */

  async manager_tasks_list(data) {
    const { page } = await openApp(SEED.manager.tg_id);
    const dash = await cardTitles(page, '#screenManagerDash');
    await gotoTab(page, 'tasks');
    const tasks = await cardTitles(page, '#screenTasks');
    const sorted = tasks.slice().sort((a, b) => a.localeCompare(b, 'ru'));
    Object.assign(data, { dash, tasks });
    expect(tasks.length === 2, 'на «Заданиях» не 2 задания: ' + tasks);
    expect(JSON.stringify(tasks) === JSON.stringify(sorted), 'задания не по названию: ' + tasks);
    expect(JSON.stringify(dash) === JSON.stringify(tasks), 'порядок на «Сегодня» и «Заданиях» разный');
    const badges = await page.$$eval('#screenTasks .badge', (els) => els.map((e) => e.innerText.trim()));
    expect(!badges.some((b) => /актив/i.test(b)), 'бейдж «Активно» на вкладке «Активные»: ' + badges);
    expect(!badges.some((b) => /учётчик|старш/i.test(b)), 'бейдж учётчика: ' + badges);
    await page.locator('#screenTasks .card', { hasText: 'Полив' }).first().click();
    await page.waitForTimeout(800);
    const opened = await visibleScreens(page);
    expect(opened.includes('screenMatrix'), 'карточка задания не открыла экран задания: ' + opened);
    const mt = await text(page, '#screenMatrix');
    expect(mt.includes('Часы по дням'), 'экран задания без заголовка «Часы по дням»');
    await gotoTab(page, 'tasks');
    const nb = page.locator('#screenTasks [data-action="new-task"]:visible');
    expect(await nb.count() >= 1, 'на «Заданиях» нет кнопки нового задания');
    expect(/Новое задание/.test(await nb.first().innerText()), 'текст кнопки: ' + (await nb.first().innerText()));
    await nb.first().click();
    await page.waitForTimeout(600);
    expect((await visibleScreens(page)).includes('screenNewTask'), 'кнопка не открыла форму задания');
  },

  async manager_tasks_empty(data) {
    const { page } = await openApp(SEED.manager.tg_id);
    await gotoTab(page, 'tasks');
    await page.click('#tasksSegment [data-tasks-seg="done"]');
    await page.waitForTimeout(700);
    const list = await text(page, '#tasksList');
    data.list = list;
    expect(/Заданий нет/.test(list), 'пустой список без «Заданий нет»: ' + list);
    expect(await page.locator('#tasksList [data-action="new-task"]').count() === 1, 'в пустом списке нет «Создать задание»');
  },

  // Решение владельца 15.11: роли учётчика в интерфейсе нет. Новое задание создаётся без выбора учётчика.
  async manager_new_task_no_reporter(data) {
    const { page } = await openApp(SEED.manager.tg_id);
    await gotoTab(page, 'tasks');
    await page.locator('#screenTasks [data-action="new-task"]:visible').first().click();
    await page.waitForTimeout(500);
    await page.fill('#ntTitle', 'Обрезка винограда');
    await page.selectOption('#ntClient', { index: 1 });
    await page.waitForTimeout(400);
    await page.locator('#ntLocations [data-chip]').first().click();
    await page.locator('#ntWorkers [data-chip][data-id="' + SEED.worker.id + '"]').click();
    await page.waitForTimeout(300);
    const formText = await text(page, '#screenNewTask');
    data.form = formText;
    expect(!/учётчик|Старш/i.test(formText), 'в форме есть учётчик/старший');
    expect(!(await page.isVisible('#ntReporterField')), 'поле учётчика видно');
    await page.click('#ntSubmit');
    await page.waitForTimeout(1500);
    const err = await text(page, '#ntError');
    expect(!err || !(await page.isVisible('#ntError')), 'ошибка формы: ' + err);
  },

  /* ---------- 4.2 Навигация и вход ---------- */

  // Экран из ☰ («Люди») — вложенный: Telegram BackButton показан и возвращает на «Сегодня».
  async nav_back_manager(data) {
    const { page } = await openApp(SEED.manager.tg_id);
    const backVisible = () => page.evaluate(() => window.Telegram.WebApp.BackButton.isVisible);
    expect(!(await backVisible()), 'BackButton виден на корневом экране');
    await page.click('#btnManagerMenu3');
    await page.click('#sheetRoot [data-action="open-team"]');
    await page.waitForTimeout(800);
    data.opened = await visibleScreens(page);
    expect(data.opened.includes('screenTeam'), 'из ☰ не открылись «Люди»: ' + data.opened);
    expect(await backVisible(), 'на «Людях» нет BackButton');
    await page.evaluate(() => window.__tgPress('BackButton'));
    await page.waitForTimeout(700);
    const screens = await visibleScreens(page);
    data.after = screens;
    expect(screens.includes('screenManagerDash'), 'BackButton не вернул на «Сегодня»: ' + screens);
    expect(!(await backVisible()), 'BackButton остался на корневом экране');
  },

  async nav_back_worker(data) {
    const { page } = await openApp(SEED.worker.tg_id);
    await page.click('#btnWorkerMenu');
    await page.click('#sheetRoot [data-action="open-history"]');
    await page.waitForTimeout(800);
    expect((await visibleScreens(page)).includes('screenHistory'), 'не открылась история');
    expect(await page.evaluate(() => window.Telegram.WebApp.BackButton.isVisible), 'на истории нет BackButton');
    await page.evaluate(() => window.__tgPress('BackButton'));
    await page.waitForTimeout(700);
    const screens = await visibleScreens(page);
    data.after = screens;
    expect(screens.includes('screenToday'), 'BackButton не вернул на «Сегодня»: ' + screens);
  },

  // Незарегистрированный: три пронумерованных шага с именем бота и кнопка.
  async login_steps(data) {
    const { page } = await openApp(555000999);
    expect((await visibleScreens(page)).includes('screenLogin'), 'не показан экран входа');
    const steps = await page.$$eval('#screenLogin [data-testid="login-steps"] li', (els) => els.map((e) => e.innerText.trim()));
    data.steps = steps;
    expect(steps.length === 3, 'шагов не 3: ' + steps);
    expect(/@\w+/.test(steps[0]), 'в первом шаге нет имени бота: ' + steps[0]);
    expect(await page.isVisible('#btnOpenBot'), 'нет кнопки «Открыть бота»');
  },

  // 4.3: язык хранится на сервере — выбор в ☰ переживает перезапуск, даже если Telegram говорит «ru».
  async worker_lang_persist(data) {
    let { page, browser } = await openApp(SEED.worker.tg_id);
    await page.click('#btnWorkerMenu');
    await page.selectOption('#menuLang', 'es');
    await page.waitForTimeout(1200);
    await browser.close();
    ({ page } = await openApp(SEED.worker.tg_id, { lang: 'ru' }));
    const btn = await text(page, '[data-action="enter-hours"]');
    data.btn = btn;
    expect(btn === 'Registrar horas', 'после перезапуска не испанский: ' + btn);
  },
});
