// Сценарии «сети безопасности» перед рефакторингом (этап 2 ТЗ): обход экранов
// руководителя и работника, правка часов, деньги, офлайн-очередь, языки.
// Подключаются из scenarios.js. Сид — tests/browser/seed.py:
//   Пётр (worker) 4 ч и Олег (worker2) 6 ч на «Поливе» сегодня, аванс Петру 20 €,
//   у Петра «Секатор №3», Иван (worker3) назначен на «Сбор урожая — томаты» без часов.
'use strict';
const { openApp, visibleScreens, text, norm, expect } = require('./harness');

const SEEDED_TEXT = [
  'Сбор урожая — томаты', 'Полив', 'Ферма Солнечная', 'Поле 1 (север)', 'Поле 2',
  'Секатор №3', 'Анна Руководитель', 'Пётр Сидоров', 'Олег Иванов', 'Иван Петров',
];

/* ---------- общие помощники ---------- */

const NAV = { dash: 'manager-dash', tasks: 'tasks', money: 'money' };

async function waitVisible(page, sel, timeout) {
  await page.waitForSelector(sel, { state: 'visible', timeout: timeout || 6000 });
}

// Перейти на корневую вкладку руководителя и дождаться её экрана.
async function managerTab(page, tab) {
  await page.click('.bottom-nav__item[data-nav-target="' + NAV[tab] + '"]');
  const screen = { dash: '#screenManagerDash', tasks: '#screenTasks', money: '#screenMoney' }[tab];
  await page.waitForSelector(screen + ':not([hidden])', { timeout: 6000 });
}

// ☰ -> пункт меню. Сначала на корневую вкладку «Сегодня», где есть ☰.
async function managerMenu(page, action, readySel) {
  await managerTab(page, 'dash');
  await page.click('#btnManagerMenu3');
  await page.click('.sheet [data-action="' + action + '"]');
  await waitVisible(page, readySel);
}

// Весь видимый текст приложения: шапка, открытый экран, шторка, нижняя навигация, тосты.
async function pageText(page) {
  const s = await page.evaluate(() => {
    // инициалы в аватарках («ПС») — не текст интерфейса
    const av = Array.from(document.querySelectorAll('.avatar'));
    av.forEach((a) => { a.dataset.d = a.style.display; a.style.display = 'none'; });
    const sels = ['.app-header', '.screen:not([hidden])', '#sheetRoot', '#bottomNav:not([hidden])', '#toastRoot'];
    const out = sels.map((q) => Array.from(document.querySelectorAll(q))
      .map((e) => e.innerText || '').join('\n')).join('\n');
    av.forEach((a) => { a.style.display = a.dataset.d; });
    return out;
  });
  return norm(s.replace(/\n+/g, ' \n '));
}

// Сырые ключи i18n: camelCase («moneyColNet») или с точкой («status.done»).
function rawKeys(s) {
  const out = [];
  for (const tok of s.split(/[\s·—–/()«»,:;!?›‹←→✓⏳"'=−+]+/)) {
    const w = tok.replace(/\.+$/, '');
    if (!w) continue;
    if (/^[a-z]+[A-Z][A-Za-z]+$/.test(w) || /^[a-z]+(\.[a-z]+)+$/.test(w)) out.push(w);
  }
  return out;
}

function stripSeeded(s) {
  let r = s;
  for (const w of SEEDED_TEXT) r = r.split(w).join(' ');
  return r;
}

// Проверка языка интерфейса на открытом сейчас экране/шторке.
async function checkLang(page, lang, where, data) {
  const s = await pageText(page);
  const raw = rawKeys(s);
  expect(raw.length === 0, where + ': сырые ключи i18n: ' + raw.join(', '));
  const rest = stripSeeded(s);
  const cyr = (rest.match(/[А-Яа-яЁёІіЇїЄєҐґ]+/g) || []).filter((w) => !['РУ', 'УК'].includes(w));
  if (lang === 'es') {
    expect(cyr.length === 0, where + ': русский текст на es-экране: ' + cyr.join(', '));
  } else {
    // украинский: русские буквы ы э ъ ё встречаться не должны
    const ru = cyr.filter((w) => /[ыэъёЫЭЪЁ]/.test(w));
    expect(ru.length === 0, where + ': русские слова на uk-экране: ' + ru.join(', '));
  }
  (data.checked = data.checked || []).push(where);
}

async function dismissHints(page) {
  const b = page.locator('.screen:not([hidden]) [data-action="hint-dismiss"]').first();
  if (await b.count()) await b.click();
}

// Закрыть шторку, если она открыта (шторки закрываются и при смене экрана).
async function closeAnySheet(page) {
  if (!(await page.locator('.sheet').count())) return;
  const b = page.locator('.sheet [data-action="close-sheet"]').first();
  if (await b.count()) await b.click();
  else await page.locator('.sheet__backdrop').click({ position: { x: 5, y: 5 } });
  await page.waitForFunction(() => !document.querySelector('.sheet'), null, { timeout: 3000 });
}

const OFFLINE_KEY = 'tc_offline_queue';

async function recordOffline(page, taskId) {
  await page.context().setOffline(true);
  await page.click('[data-action="enter-hours"][data-id="' + taskId + '"]');
  await page.click('#whQuick [data-wh="8"]');
  await page.click('#whSave');
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k) || '[]').length === 1,
    OFFLINE_KEY, { timeout: 5000 });
}

const EXPECT = {
  uk: { enter: 'Записати години', tasks: 'Завдання' },
  es: { enter: 'Registrar horas', tasks: 'Tareas' },
};

module.exports = (SEED) => {
  /* ---------- обход экранов на языке ---------- */

  async function langWorker(data, lang) {
    const { page } = await openApp(SEED.worker.tg_id);
    await page.click('#btnWorkerMenu');
    await page.selectOption('#menuLang', lang);
    await page.waitForFunction((s) => {
      const b = document.querySelector('[data-action="enter-hours"]');
      return b && b.innerText.trim() === s;
    }, EXPECT[lang].enter, { timeout: 6000 });
    await page.waitForFunction(() => !document.querySelector('#todayHistList .skeleton'), null, { timeout: 5000 });
    await checkLang(page, lang, 'Сегодня (с подсказками)', data);
    await dismissHints(page);
    await checkLang(page, lang, 'Сегодня', data);
    // меню ☰
    await page.click('#btnWorkerMenu');
    await waitVisible(page, '.sheet #menuLang');
    await checkLang(page, lang, 'Меню', data);
    // История и её сегменты
    await page.click('.sheet [data-action="open-history"]');
    await waitVisible(page, '#historyList [data-testid="history-row"]');
    await checkLang(page, lang, 'История', data);
    await page.click('#histSegment [data-hist="custom"]');
    await waitVisible(page, '#histCustomRange');
    await checkLang(page, lang, 'История: свой период', data);
    await page.evaluate(() => window.__tgPress('BackButton'));
    await page.waitForSelector('#screenToday:not([hidden])', { timeout: 5000 });
    // Деньги
    await page.click('#btnWorkerMenu');
    await page.click('.sheet [data-action="open-money"]');
    await waitVisible(page, '#moneyBody .stat');
    await checkLang(page, lang, 'Мои деньги', data);
    await page.evaluate(() => window.__tgPress('BackButton'));
    await page.waitForSelector('#screenToday:not([hidden])', { timeout: 5000 });
    // Мой инвентарь
    await page.click('#btnWorkerMenu');
    await page.click('.sheet [data-action="open-inventory"]');
    await page.waitForFunction(() => {
      const e = document.querySelector('[data-testid="my-inventory"]');
      return e && /Секатор/.test(e.innerText);
    }, null, { timeout: 5000 });
    await checkLang(page, lang, 'Мой инвентарь', data);
    await page.click('[data-testid="my-inventory"] [data-action="close-sheet"]');
    // Лист ввода часов
    await page.click('[data-action="enter-hours"][data-id="' + SEED.task_harvest + '"]');
    await waitVisible(page, '#whQuick');
    await checkLang(page, lang, 'Ввод часов', data);
  }

  async function langManager(data, lang) {
    const { page } = await openApp(SEED.manager.tg_id);
    await page.click('#btnManagerMenu3');
    await page.selectOption('#menuLang', lang);
    await page.waitForFunction((s) => {
      const l = document.querySelector('.bottom-nav__item[data-nav-target="tasks"] .nav-label');
      return l && l.innerText.trim() === s;
    }, EXPECT[lang].tasks, { timeout: 6000 });
    await page.waitForSelector('#screenManagerDash:not([hidden]) [data-testid="dash-summary"]', { timeout: 6000 });
    await checkLang(page, lang, 'Сегодня руководителя (с подсказками)', data);
    await dismissHints(page);
    await page.click('#btnManagerMenu3');
    await waitVisible(page, '.sheet #menuLang');
    await checkLang(page, lang, 'Меню', data);
    await closeAnySheet(page);
    // «Записать за него»
    await page.click('[data-action="enter-for"]');
    await waitVisible(page, '#whQuick');
    await checkLang(page, lang, 'Записать за него', data);
    await closeAnySheet(page);
    // Задания
    await managerTab(page, 'tasks');
    await waitVisible(page, '#tasksList [data-task-id]');
    await checkLang(page, lang, 'Задания: активные', data);
    await page.click('#tasksSegment [data-tasks-seg="done"]');
    await waitVisible(page, '#tasksList .empty');
    await checkLang(page, lang, 'Задания: завершённые', data);
    await page.click('#tasksSegment [data-tasks-seg="active"]');
    await waitVisible(page, '#tasksList [data-task-id]');
    // матрица
    await page.click('#tasksList [data-task-id="' + SEED.task_water + '"] .card-title');
    await waitVisible(page, '#screenMatrix table.matrix');
    await checkLang(page, lang, 'Матрица', data);
    await page.click('#btnBackMatrix');
    await page.waitForSelector('#screenTasks:not([hidden])');
    // ввод часов руководителем (с полем причины)
    await page.click('#tasksList [data-task-id="' + SEED.task_water + '"] [data-action="enter-hours"]');
    const inp = '#hePeople .he-input[data-user="' + SEED.worker.id + '"]';
    await waitVisible(page, inp);
    await page.fill(inp, '5');
    await page.dispatchEvent(inp, 'input');
    await waitVisible(page, '#heReasonField');
    await checkLang(page, lang, 'Ввод часов руководителем', data);
    await managerTab(page, 'tasks');
    // новое задание
    await page.click('[data-action="new-task"]');
    await waitVisible(page, '#newTaskForm');
    await checkLang(page, lang, 'Новое задание', data);
    await managerTab(page, 'tasks');
    // Деньги
    await managerTab(page, 'money');
    await waitVisible(page, '#screenMoney [data-testid="pay-table"]');
    await checkLang(page, lang, 'Деньги', data);
    await page.click('[data-action="pay-advance-open"]');
    await waitVisible(page, '#advUser');
    await checkLang(page, lang, 'Аванс', data);
    await closeAnySheet(page);
    // Люди
    await managerMenu(page, 'open-team', '#screenTeam #teamList [data-user-id]');
    await checkLang(page, lang, 'Люди', data);
    await page.click('#btnAddWorker');
    await waitVisible(page, '#teamAddForm');
    await checkLang(page, lang, 'Люди: добавить', data);
    await page.click('#teamList [data-user-id="' + SEED.worker.id + '"]');
    await waitVisible(page, '#userEditForm');
    await checkLang(page, lang, 'Люди: шторка человека', data);
    await page.click('.sheet [data-action="open-user-summary"]');
    await waitVisible(page, '#userSummaryBody .stat');
    await checkLang(page, lang, 'Карточка работника', data);
    await page.click('#btnBackSummary');
    await waitVisible(page, '#teamList [data-user-id]');
    await page.click('#teamSegment [data-team-tab="inventory"]');
    await page.waitForFunction(() => /Секатор №3/.test(document.getElementById('inventoryList').innerText),
      null, { timeout: 5000 });
    await checkLang(page, lang, 'Инвентарь', data);
    await page.click('#inventoryList [data-action="assign-item"]');
    await waitVisible(page, '.sheet [data-action="assign-to"]');
    await checkLang(page, lang, 'Инвентарь: выдать', data);
    await closeAnySheet(page);
    // Заказчики
    await managerMenu(page, 'open-clients', '#screenClients #clientsList [data-client-id]');
    await checkLang(page, lang, 'Заказчики', data);
    await page.click('#clientsList [data-client-id]');
    await waitVisible(page, '#ceLocations .row-line');
    await checkLang(page, lang, 'Заказчик: карточка', data);
    await closeAnySheet(page);
    // Отчёты
    await managerMenu(page, 'open-reports', '#screenReports');
    await page.waitForFunction(() => /Пётр Сидоров/.test(document.getElementById('reportsBody').innerText),
      null, { timeout: 6000 });
    await checkLang(page, lang, 'Отчёты: выплаты', data);
    await page.click('#reportsSegment [data-reports-tab="summary"]');
    await page.waitForFunction(() => /Ферма Солнечная/.test(document.getElementById('reportsBody').innerText),
      null, { timeout: 6000 });
    await checkLang(page, lang, 'Отчёты: сводка', data);
  }

  // вкладка «Выплаты» рисует людей, «Отчёты» — заказчиков
  const reportsReady = (page, re) => page.waitForFunction(
    (src) => new RegExp(src).test(document.getElementById('reportsBody').innerText),
    (re || /Пётр Сидоров/).source, { timeout: 6000 });

  return {
    /* ---------- Руководитель: ☰ -> Люди ---------- */

    // Список людей, карточка работника (имя, часы, деньги, инвентарь) и вкладка «Инвентарь».
    async manager_team(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerMenu(page, 'open-team', '#screenTeam #teamList [data-user-id]');
      const list = await text(page, '#teamList');
      data.list = list;
      for (const n of ['Анна Руководитель', 'Пётр Сидоров', 'Олег Иванов', 'Иван Петров']) {
        expect(list.includes(n), 'в списке людей нет «' + n + '»: ' + list);
      }
      await page.click('#teamList [data-user-id="' + SEED.worker.id + '"]');
      await waitVisible(page, '#userEditForm');
      await page.click('.sheet [data-action="open-user-summary"]');
      await waitVisible(page, '#userSummaryBody .stat');
      const card = await text(page, '#userSummaryBody');
      data.card = card;
      for (const s of ['Пётр Сидоров', '4 ч', '50,00 €', '12,50 €/ч', 'Секатор №3', 'Полив · Поле 2']) {
        expect(card.includes(s), 'в карточке работника нет «' + s + '»: ' + card);
      }
      // назад -> «Люди»; сегмент «Инвентарь»
      await page.click('#btnBackSummary');
      await waitVisible(page, '#teamList [data-user-id]');
      await page.click('#teamSegment [data-team-tab="inventory"]');
      await page.waitForFunction(() => /Секатор №3/.test(document.getElementById('inventoryList').innerText),
        null, { timeout: 5000 });
      const inv = await text(page, '#inventoryList');
      data.inv = inv;
      expect(inv.includes('Пётр Сидоров'), 'в инвентаре не указан держатель Пётр: ' + inv);
    },

    // Руководитель выдаёт «Секатор №3» Олегу (holder_id проверяет pytest).
    async manager_inventory_handover(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerMenu(page, 'open-team', '#screenTeam #teamList [data-user-id]');
      await page.click('#teamSegment [data-team-tab="inventory"]');
      await waitVisible(page, '#inventoryList [data-action="assign-item"]');
      await page.click('#inventoryList [data-action="assign-item"]');
      await page.click('.sheet [data-action="assign-to"][data-user="' + SEED.worker2.id + '"]');
      await page.waitForFunction(() => /Олег Иванов/.test(document.getElementById('inventoryList').innerText),
        null, { timeout: 5000 });
      data.afterAssign = await text(page, '#inventoryList');
    },

    // Руководитель возвращает «Секатор №3» на склад (holder_id IS NULL проверяет pytest).
    async manager_inventory_return(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerMenu(page, 'open-team', '#screenTeam #teamList [data-user-id]');
      await page.click('#teamSegment [data-team-tab="inventory"]');
      await waitVisible(page, '#inventoryList [data-action="return-item"]');
      await page.click('#inventoryList [data-action="return-item"]');
      await page.waitForFunction(() => /на складе/.test(document.getElementById('inventoryList').innerText),
        null, { timeout: 5000 });
      expect(await page.locator('#inventoryList [data-action="return-item"]').count() === 0,
        'после возврата осталась кнопка возврата');
      data.afterReturn = await text(page, '#inventoryList');
    },

    /* ---------- Руководитель: ☰ -> Заказчики ---------- */

    async manager_clients(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerMenu(page, 'open-clients', '#screenClients #clientsList [data-client-id]');
      const list = await text(page, '#clientsList');
      expect(list.includes('Ферма Солнечная'), 'нет «Ферма Солнечная»: ' + list);
      await page.click('#clientsList [data-client-id]');
      await waitVisible(page, '#ceLocations .row-line');
      const locs = await text(page, '#ceLocations');
      data.locs = locs;
      for (const l of ['Поле 1 (север)', 'Поле 2']) {
        expect(locs.includes(l), 'в карточке заказчика нет «' + l + '»: ' + locs);
      }
      expect(await page.inputValue('#ceName') === 'Ферма Солнечная', 'в форме заказчика другое имя');
    },

    /* ---------- Руководитель: ☰ -> Отчёты ---------- */

    // Обе вкладки отчётов рисуются, показывают людей, часы с «ч» и числа; смена периода работает.
    async manager_reports_tabs(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerMenu(page, 'open-reports', '#screenReports');
      await reportsReady(page);
      const pay = await text(page, '#reportsBody');
      data.payouts = pay;
      for (const s of ['Пётр Сидоров', 'Олег Иванов', '4 ч', '6 ч']) {
        expect(pay.includes(s), 'вкладка «Выплаты» без «' + s + '»: ' + pay);
      }
      expect(/\d+[.,]\d\d/.test(pay), 'во вкладке «Выплаты» нет денежных сумм: ' + pay);
      await page.click('#reportsSegment [data-reports-tab="summary"]');
      await reportsReady(page, /Ферма Солнечная/);
      const sum = await text(page, '#reportsBody');
      data.summary = sum;
      for (const s of ['4 ч', '6 ч', '10 ч', 'Ферма Солнечная']) {
        expect(sum.includes(s), 'вкладка «Отчёты» без «' + s + '»: ' + sum);
      }
      expect(await page.locator('#reportsBody .stat').count() >= 5, 'в сводке мало плиток-итогов');
      // другой период: пусто
      await page.fill('#repStart', '2020-01-01');
      await page.fill('#repEnd', '2020-01-07');
      await page.dispatchEvent('#repEnd', 'change');
      await page.waitForFunction(() => {
        const d = document.getElementById('repData');
        return d && !d.querySelector('.skeleton') && !/10 ч/.test(d.innerText);
      }, null, { timeout: 6000 });
      // и обратно на «Выплаты»
      await page.click('#reportsSegment [data-reports-tab="payouts"]');
      await reportsReady(page);
    },

    // «По людям» в сводке показывает имена, а не «#2».
    async manager_reports_names(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerMenu(page, 'open-reports', '#screenReports');
      await page.click('#reportsSegment [data-reports-tab="summary"]');
      await reportsReady(page, /Ферма Солнечная/);
      const sum = await text(page, '#reportsBody');
      data.summary = sum;
      expect(!/#\d+/.test(sum), 'в «По людям» вместо имён номера: ' + sum);
      for (const n of ['Пётр Сидоров', 'Олег Иванов']) {
        expect(sum.includes(n), 'в «По людям» нет «' + n + '»: ' + sum);
      }
    },

    // Деньги в отчётах — с валютой в том же формате, что везде («30,00 €»).
    async manager_reports_money_format(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerMenu(page, 'open-reports', '#screenReports');
      await reportsReady(page);
      const bad = [];
      const scan = async (tab) => {
        const s = await text(page, '#reportsBody');
        for (const m of s.matchAll(/\d+[.,]\d{2}(?!\d)(?! €)/g)) bad.push(tab + ': ' + m[0]);
      };
      await scan('payouts');
      await page.click('#reportsSegment [data-reports-tab="summary"]');
      await reportsReady(page, /Ферма Солнечная/);
      await scan('summary');
      data.bad = bad;
      expect(bad.length === 0, 'суммы без « €»: ' + bad.join('; '));
    },

    /* ---------- Руководитель: задание ---------- */

    // Тап по карточке «Полив» -> матрица «Часы по дням»: Пётр 4, Олег 6.
    async manager_task_matrix(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerTab(page, 'tasks');
      await page.click('#tasksList [data-task-id="' + SEED.task_water + '"] .card-title');
      await waitVisible(page, '#screenMatrix table.matrix');
      const rows = await page.$$eval('#matrixBody tr', (trs) =>
        trs.map((tr) => Array.from(tr.children).map((c) => c.innerText.trim())));
      data.rows = rows;
      const p = rows.find((r) => r[0] === 'Пётр Сидоров');
      const o = rows.find((r) => r[0] === 'Олег Иванов');
      expect(p && p.slice(1).includes('4'), 'в матрице у Петра нет 4: ' + JSON.stringify(rows));
      expect(o && o.slice(1).includes('6'), 'в матрице у Олега нет 6: ' + JSON.stringify(rows));
      expect((await text(page, '#matrixBody')).includes('Полив'), 'в матрице нет названия задания');
      await page.click('#btnBackMatrix');
      await page.waitForSelector('#screenTasks:not([hidden])', { timeout: 4000 });
    },

    // Экран задания: тап по ячейке Петра за сегодня -> ввод часов (4 -> 5 с причиной) -> назад на экран задания.
    async manager_task_cell_edit(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerTab(page, 'tasks');
      await page.click('#tasksList [data-task-id="' + SEED.task_water + '"] .card-title');
      await waitVisible(page, '#screenMatrix table.matrix');
      const cell = '#matrixBody td[data-mx-user="' + SEED.worker.id + '"][data-mx-date="' + SEED.today + '"]';
      expect((await text(page, cell)).trim() === '4', 'в ячейке Петра за сегодня не 4');
      await page.click(cell);
      const inp = '#hePeople .he-input[data-user="' + SEED.worker.id + '"]';
      await waitVisible(page, inp);
      expect(await page.locator('#hePeople .he-input').count() === 1, 'в форме не только Пётр');
      await page.fill(inp, '5');
      await page.dispatchEvent(inp, 'input');
      await waitVisible(page, '#heReasonField');
      await page.fill('#heReason', 'Ошибся при записи');
      await page.dispatchEvent('#heReason', 'input');
      await page.click('#heSave');
      await waitVisible(page, '#screenMatrix table.matrix');
      await page.waitForFunction((c) => {
        const el = document.querySelector(c);
        return el && el.innerText.trim() === '5';
      }, cell, { timeout: 5000 });
      await page.waitForTimeout(800);
      expect(await page.locator('.sheet').count() === 0, 'после правки открылся лист');
      expect((await visibleScreens(page)).includes('screenMatrix'), 'не вернулись на экран задания');
    },

    // Экран задания: «Завершить задание» -> подтверждение Telegram -> задание завершено, список «Задания».
    async manager_task_finish_screen(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerTab(page, 'tasks');
      await page.click('#tasksList [data-task-id="' + SEED.task_water + '"] .card-title');
      await waitVisible(page, '#screenMatrix [data-action="mx-enter-hours"]');
      await page.click('#screenMatrix [data-action="mx-finish"]');
      await page.waitForSelector('#screenTasks:not([hidden])', { timeout: 5000 });
      await page.waitForFunction((id) => !document.querySelector('#tasksList [data-task-id="' + id + '"]'),
        SEED.task_water, { timeout: 5000 });
      const calls = await page.evaluate(() => window.__tgCalls.filter((c) => c.name === 'showConfirm').length);
      expect(calls === 1, 'showConfirm вызван ' + calls + ' раз');
    },

    // Правка часов Петра на «Поливе» 4 -> 5: без причины кнопка заблокирована, с причиной — сохраняется
    // и открывается лист задания с итогом 11 ч (БД и аудит проверяет pytest).
    async manager_edit_hours(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerTab(page, 'tasks');
      await page.click('#tasksList [data-task-id="' + SEED.task_water + '"] [data-action="enter-hours"]');
      const inp = '#hePeople .he-input[data-user="' + SEED.worker.id + '"]';
      await waitVisible(page, inp);
      const people = await text(page, '#hePeople');
      expect(/внесено/i.test(people), 'нет пометки «уже внесено»: ' + people);
      await page.fill(inp, '5');
      await page.dispatchEvent(inp, 'input');
      await waitVisible(page, '#heReasonField');
      expect(await page.isDisabled('#heSave'), 'без причины кнопка «Сохранить» не заблокирована');
      const hint = await text(page, '#heHint');
      expect(/причин/.test(hint), 'нет подсказки про причину: ' + hint);
      await page.fill('#heReason', 'Ошибся при записи');
      await page.dispatchEvent('#heReason', 'input');
      expect(!(await page.isDisabled('#heSave')), 'с причиной кнопка «Сохранить» осталась заблокированной');
      await page.click('#heSave');
      await page.waitForFunction(() => /Часы сохранены/.test(document.getElementById('toastRoot').innerText),
        null, { timeout: 5000 });
      // после сохранения теперь стабильно открыт лист задания — закрываем его
      await waitVisible(page, '.sheet [data-action="close-sheet"]');
      await page.click('.sheet [data-action="close-sheet"]');
      // новое значение видно в матрице задания
      await managerTab(page, 'tasks');
      await page.click('#tasksList [data-task-id="' + SEED.task_water + '"] .card-title');
      await waitVisible(page, '#screenMatrix table.matrix');
      const rows = await page.$$eval('#matrixBody tr', (trs) =>
        trs.map((tr) => Array.from(tr.children).map((c) => c.innerText.trim())));
      data.rows = rows;
      const p = rows.find((r) => r[0] === 'Пётр Сидоров');
      expect(p && p.slice(1).includes('5') && !p.slice(1).includes('4'),
        'в матрице у Петра не 5: ' + JSON.stringify(rows));
    },

    // После сохранения правки руководитель должен остаться на листе задания с новыми итогами (11 ч).
    async manager_edit_hours_sheet(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerTab(page, 'tasks');
      await page.click('#tasksList [data-task-id="' + SEED.task_water + '"] [data-action="enter-hours"]');
      const inp = '#hePeople .he-input[data-user="' + SEED.worker.id + '"]';
      await waitVisible(page, inp);
      await page.fill(inp, '5');
      await page.dispatchEvent(inp, 'input');
      await page.fill('#heReason', 'Ошибся при записи');
      await page.dispatchEvent('#heReason', 'input');
      await page.click('#heSave');
      await page.waitForFunction(() => /Часы сохранены/.test(document.getElementById('toastRoot').innerText),
        null, { timeout: 5000 });
      await page.waitForTimeout(1200);
      const sheet = await text(page, '.sheet');
      data.sheet = sheet;
      expect(sheet.includes('Полив') && sheet.includes('11 ч'),
        'после сохранения нет листа задания с итогом 11 ч: «' + sheet + '»');
    },

    // Причина не заполнена: сохранить нельзя, экран остаётся (БД не меняется — проверяет pytest).
    async manager_edit_hours_no_reason(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerTab(page, 'tasks');
      await page.click('#tasksList [data-task-id="' + SEED.task_water + '"] [data-action="enter-hours"]');
      const inp = '#hePeople .he-input[data-user="' + SEED.worker.id + '"]';
      await waitVisible(page, inp);
      await page.fill(inp, '7');
      await page.dispatchEvent(inp, 'input');
      expect(await page.isDisabled('#heSave'), 'без причины кнопка не заблокирована');
      await page.locator('#heSave').click({ force: true, timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(500);
      const screens = await visibleScreens(page);
      expect(screens.includes('screenHoursEntry'), 'экран ввода часов закрылся без причины: ' + screens);
      expect(await page.locator('.sheet').count() === 0, 'без причины открылся лист задания');
    },

    // Завершить задание: правка часов -> лист задания -> «Завершить» (status=done проверяет pytest).
    async manager_finish_task(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerTab(page, 'tasks');
      await page.click('#tasksList [data-task-id="' + SEED.task_water + '"] [data-action="enter-hours"]');
      const inp = '#hePeople .he-input[data-user="' + SEED.worker.id + '"]';
      await waitVisible(page, inp);
      await page.fill(inp, '5');
      await page.dispatchEvent(inp, 'input');
      // «← Назад» с экрана ввода открывает лист задания с кнопкой «Завершить задание»
      await page.click('#btnBackHoursEntry');
      await waitVisible(page, '.sheet [data-action="finish-task"]');
      await page.click('.sheet [data-action="finish-task"]');
      await waitVisible(page, '.sheet [data-action="finish-task-yes"]');
      await page.click('.sheet [data-action="finish-task-yes"]');
      await page.waitForFunction(() => !document.querySelector('.sheet'), null, { timeout: 5000 });
      await page.waitForFunction((id) => !document.querySelector('#tasksList [data-task-id="' + id + '"]'),
        SEED.task_water, { timeout: 5000 });
      await page.click('#tasksSegment [data-tasks-seg="done"]');
      await waitVisible(page, '#tasksList [data-task-id="' + SEED.task_water + '"]');
      expect((await text(page, '#tasksList')).includes('Полив'), 'во вкладке «Завершённые» нет «Полив»');
    },

    /* ---------- Руководитель: Деньги ---------- */

    // Периоды «Прошлый месяц» и обратно «Этот месяц».
    async manager_money_periods(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerTab(page, 'money');
      await waitVisible(page, '#screenMoney [data-testid="pay-table"]');
      const monthLabel = await text(page, '#screenMoney [data-testid="pay-period"]');
      expect(await page.locator('#screenMoney [data-period="since-close"]').count() === 0,
        'до первого закрытия есть кнопка «С последнего закрытия»');
      await page.click('#screenMoney [data-period="prev"]');
      await page.waitForFunction(() => {
        const b = document.querySelector('#screenMoney [data-period="prev"]');
        return b && b.classList.contains('is-active') && !document.querySelector('#payTable .skeleton');
      }, null, { timeout: 5000 });
      const prevLabel = await text(page, '#screenMoney [data-testid="pay-period"]');
      data.labels = [monthLabel, prevLabel];
      expect(prevLabel && prevLabel !== monthLabel, 'период не сменился: ' + prevLabel);
      const prevBody = await text(page, '#payTable');
      expect(prevBody.includes('нет часов') && !prevBody.includes('Пётр'),
        'за прошлый месяц ждали «нет часов и авансов»: ' + prevBody);
      await page.click('#screenMoney [data-period="month"]');
      await waitVisible(page, '#screenMoney [data-testid="pay-table"]');
      expect(await text(page, '#screenMoney [data-testid="pay-period"]') === monthLabel,
        'после возврата на «Этот месяц» период не вернулся');
      expect((await text(page, '#screenMoney [data-testid="pay-total"]')).includes('90,00 €'), 'итог не 90,00 €');
    },

    // После «Закрыть расчёт» появляется «С последнего закрытия», он открывается и рисует период.
    async manager_money_since_close(data) {
      const { page } = await openApp(SEED.manager.tg_id);
      await managerTab(page, 'money');
      await waitVisible(page, '#screenMoney [data-testid="pay-table"]');
      await page.click('[data-action="pay-close"]');
      await waitVisible(page, '#screenMoney [data-period="since-close"]');
      const calls = await page.evaluate(() => window.__tgCalls.filter((c) => c.name === 'showConfirm').length);
      expect(calls === 1, 'подтверждение закрытия показано ' + calls + ' раз');
      const active = (k) => page.waitForFunction((p) => {
        const b = document.querySelector('#screenMoney [data-period="' + p + '"]');
        return b && b.classList.contains('is-active') && !document.querySelector('#payTable .skeleton');
      }, k, { timeout: 5000 });
      await page.click('#screenMoney [data-period="since-close"]');
      await active('since-close');
      const label = await text(page, '#screenMoney [data-testid="pay-period"]');
      data.label = label;
      expect(label.length > 0, 'у периода «С последнего закрытия» нет дат');
      const body = await text(page, '#payTable');
      expect(body.length > 0, 'период «С последнего закрытия» ничего не нарисовал');
      expect(!body.includes('90,00 €'), 'после закрытия в «С последнего закрытия» остались старые деньги: ' + body);
      for (const p of ['prev', 'month', 'since-close']) {
        await page.click('#screenMoney [data-period="' + p + '"]');
        await active(p);
      }
    },

    /* ---------- Работник: история и деньги ---------- */

    // ☰ -> «Вся история»: строки «дата · задание · место · N ч»; сегменты «Месяц» и «Свой».
    async worker_history(data) {
      const { page } = await openApp(SEED.worker.tg_id);
      await page.click('#btnWorkerMenu');
      await page.click('.sheet [data-action="open-history"]');
      await waitVisible(page, '#historyList [data-testid="history-row"]');
      const rows = await page.$$eval('#historyList [data-testid="history-row"]',
        (els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ')));
      data.rows = rows;
      expect(rows.length === 1, 'в истории Петра ждали 1 запись: ' + JSON.stringify(rows));
      expect(/^\S.* · Полив · Поле 2 · 4 ч$/.test(rows[0]), 'формат строки истории: ' + rows[0]);
      await page.click('#histSegment [data-hist="month"]');
      await page.waitForFunction(() => {
        const b = document.querySelector('#histSegment [data-hist="month"]');
        return b && b.classList.contains('is-active') && !document.querySelector('#historyList .skeleton')
          && document.querySelector('#historyList [data-testid="history-row"]');
      }, null, { timeout: 5000 });
      await page.click('#histSegment [data-hist="custom"]');
      await page.fill('#histFrom', SEED.today);
      await page.fill('#histTo', SEED.today);
      await page.click('#histApply');
      await page.waitForFunction(() => document.querySelector('#historyList [data-testid="history-row"]'),
        null, { timeout: 5000 });
      await page.fill('#histFrom', '2020-01-01');
      await page.fill('#histTo', '2020-01-02');
      await page.click('#histApply');
      await page.waitForFunction(() => !document.querySelector('#historyList [data-testid="history-row"]')
        && !document.querySelector('#historyList .skeleton'), null, { timeout: 5000 });
      expect((await text(page, '#historyList')).length > 0, 'для пустого периода нет сообщения');
    },

    // ☰ -> «Мои деньги»: заработано, аванс, к выплате — всё с «€»; часы с «ч».
    async worker_my_money(data) {
      const { page } = await openApp(SEED.worker.tg_id);
      await page.click('#btnWorkerMenu');
      await page.click('.sheet [data-action="open-money"]');
      await waitVisible(page, '#screenMoney #moneyBody .stat');
      const stats = await page.$$eval('#moneyBody .stat',
        (els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ')));
      data.stats = stats;
      const joined = norm(stats.join(' | '));
      for (const s of ['4 ч', '50,00 €', '20,00 €', '30,00 €']) {
        expect(joined.includes(s), 'в «Мои деньги» нет «' + s + '»: ' + joined);
      }
      const body = await text(page, '#moneyBody');
      expect(body.includes('12,50 €/ч'), 'нет ставки «12,50 €/ч»: ' + body);
      expect(body.includes('Секатор №3'), 'нет инвентаря «Секатор №3»');
      expect(!/\d\.\d\d(?!\d)/.test(body), 'есть число вида 0.00: ' + body);
    },

    /* ---------- Работник: офлайн-очередь ---------- */

    // Запись без сети -> плашка очереди -> сеть вернулась (событие online) -> очередь пуста (в БД ровно одна запись).
    async worker_offline_queue(data) {
      const { page } = await openApp(SEED.worker.tg_id);
      await recordOffline(page, SEED.task_harvest);
      const banner = await text(page, '#offlineBanner');
      data.banner = banner;
      expect(await page.isVisible('#offlineBanner') && /^⏳ 1 /.test(banner), 'нет плашки очереди: ' + banner);
      expect(/8/.test(await text(page, '#screenToday')), 'на «Сегодня» не видно локально отмеченных 8 ч');
      await page.context().setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k) || '[]').length === 0,
        OFFLINE_KEY, { timeout: 6000 });
      await page.waitForFunction(() => document.getElementById('offlineBanner').hidden, null, { timeout: 4000 });
      // дубль (сервер ответит 409): очередь всё равно очищается, лишней записи нет
      await page.evaluate(([k, taskId, day]) => {
        localStorage.setItem(k, JSON.stringify([{
          id: Date.now(), payload: { task_id: taskId, work_date: day, hours: '8.00' },
          created_at: new Date().toISOString(),
        }]));
        window.dispatchEvent(new Event('online'));
      }, [OFFLINE_KEY, SEED.task_harvest, SEED.today]);
      await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k) || '[]').length === 0,
        OFFLINE_KEY, { timeout: 6000 });
    },

    // То же, но очередь уходит при следующем запуске приложения (перезагрузка страницы).
    async worker_offline_reload(data) {
      const { page } = await openApp(SEED.worker.tg_id);
      await recordOffline(page, SEED.task_harvest);
      await page.context().setOffline(false);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k) || '[]').length === 0,
        OFFLINE_KEY, { timeout: 8000 });
      await page.waitForFunction(() => {
        const l = document.getElementById('screenLoading');
        return l && l.hidden;
      }, null, { timeout: 8000 });
    },

    /* ---------- Языки ---------- */

    async lang_worker_uk(data) { return langWorker(data, 'uk'); },
    async lang_worker_es(data) { return langWorker(data, 'es'); },
    async lang_manager_uk(data) { return langManager(data, 'uk'); },
    async lang_manager_es(data) { return langManager(data, 'es'); },
  };
};
