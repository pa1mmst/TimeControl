// Локальный браузерный e2e: real DOM + real backend, Telegram initData подделана.
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8077';
const TG_ID = 555000111;
const envFile = fs.readFileSync('D:/TimeControl/.env', 'utf8');
const mt = envFile.match(/^BOT_TOKEN=(.*)$/m);
const BOT_TOKEN = mt ? mt[1].trim().replace(/^["']|["']$/g, '') : '';

function signedInitData() {
  const pairs = [
    ['auth_date', String(Math.floor(Date.now() / 1000))],
    ['query_id', 'AAF' + Math.random().toString(36).slice(2, 10)],
    ['user', JSON.stringify({ id: TG_ID, first_name: 'Test', language_code: 'ru' })],
  ];
  const dcs = pairs.map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') + '&hash=' + hash;
}

const initData = signedInitData();
const stub = `(() => {
  const data = {
    initData: ${JSON.stringify(initData)},
    initDataUnsafe: { user: { id: ${TG_ID}, first_name: 'Test', language_code: 'ru' } },
    themeParams: {}, colorScheme: 'light', viewportHeight: 780, viewportStableHeight: 780,
    isExpanded: true, platform: 'web', version: '7.0'
  };
  function mk() { const f = function () { return px; }; const px = new Proxy(f, { get(t, p) { if (p === 'then') return undefined; return px; }, apply() { return px; } }); return px; }
  const wa = new Proxy(data, { get(t, p) { if (typeof p === 'string' && p in t) return t[p]; return mk(); } });
  window.Telegram = { WebApp: wa };
})();`;

(async () => {
  const logs = [];
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.log('LAUNCH FAILED: ' + e.message);
    return;
  }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await ctx.route('**/telegram-web-app.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* blocked */' }));
  await ctx.addInitScript(stub);
  const page = await ctx.newPage();
  page.on('console', (m) => logs.push('CONSOLE[' + m.type() + ']: ' + m.text().slice(0, 400)));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + String(e.message).slice(0, 400)));
  page.on('requestfailed', (r) => logs.push('REQFAILED: ' + r.url().slice(0, 120) + ' ' + ((r.failure() || {}).errorText || '')));
  page.on('response', async (r) => {
    if (!r.url().includes('/api/')) return;
    let body = '';
    try { body = (await r.text()).slice(0, 300); } catch (e) { body = '<?>'; }
    logs.push('API ' + r.status() + ' ' + r.request().method() + ' ' + r.url().replace(BASE, '') + ' -> ' + body);
  });

  const vis = () => page.evaluate(() => Array.from(document.querySelectorAll('.screen')).filter((e) => !e.hidden && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden').map((e) => e.id).join(',') || '(none)');

  try {
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    logs.push('SCREEN after init: ' + (await vis()));
    logs.push('btnNewTask hidden=' + JSON.stringify(await page.evaluate(() => { const b = document.getElementById('btnNewTask'); return b ? b.hidden : 'missing'; })));

    await page.click('.nav-item[data-nav-target="tasks"]', { timeout: 5000 }).catch((e) => logs.push('CLICK nav tasks FAIL: ' + e.message));
    await page.waitForTimeout(1000);
    logs.push('SCREEN after nav=tasks: ' + (await vis()));
    await page.click('#btnNewTask', { timeout: 5000 }).catch((e) => logs.push('CLICK #btnNewTask FAIL: ' + e.message));
    await page.waitForTimeout(600);
    logs.push('SCREEN after btnNewTask: ' + (await vis()));
    logs.push('clients in #ntClient=' + JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('#ntClient option')).map((o) => o.value + ':' + o.textContent.trim()))));
    logs.push('locations boxes=' + JSON.stringify(await page.evaluate(() => document.querySelectorAll('#ntLocations input[type=checkbox]').length)));
    logs.push('workers boxes=' + JSON.stringify(await page.evaluate(() => document.querySelectorAll('#ntWorkers input[type=checkbox]').length)));

    await page.fill('#ntTitle', 'Browser Test Task').catch((e) => logs.push('fill title FAIL: ' + e.message));
    await page.selectOption('#ntClient', { index: 1 }).catch((e) => logs.push('select client FAIL: ' + e.message));
    await page.evaluate(() => {
      const tick = (sel) => { const c = document.querySelector(sel + ' input[type=checkbox]'); if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } return !!c; };
      return { loc: tick('#ntLocations'), w: tick('#ntWorkers') };
    });
    await page.waitForTimeout(300);
    logs.push('SUBMIT clicked');
    await page.click('#ntSubmit', { timeout: 5000 }).catch((e) => logs.push('CLICK #ntSubmit FAIL: ' + e.message));
    await page.waitForTimeout(3000);

    logs.push('SCREEN after submit: ' + (await vis()));
    logs.push('ntError=' + JSON.stringify(await page.evaluate(() => { const e = document.getElementById('ntError'); return e && !e.hidden ? e.textContent : null; })));
    logs.push('visible toasts=' + JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent.trim()))));
    logs.push('tasksList text=' + JSON.stringify(await page.evaluate(() => { const e = document.getElementById('tasksList'); return e ? e.innerText.slice(0, 300) : 'missing'; })));
    logs.push('form still visible=' + JSON.stringify(await page.evaluate(() => { const f = document.getElementById('newTaskForm'); return f ? !!(f.offsetParent || f.getClientRects().length) : 'missing'; })));
  } catch (e) {
    logs.push('FATAL: ' + e.message);
  }
  console.log(logs.join('\n'));
  await browser.close();
})();
