// Оффлайн-тест v5: работник записывает часы без сети, очередь, синк при 'online'.
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:8077';
const envFile = fs.readFileSync('D:/TimeControl/.env', 'utf8');
const mt = envFile.match(/^BOT_TOKEN=(.*)$/m);
const BOT_TOKEN = mt ? mt[1].trim().replace(/^["']|["']$/g, '') : '';

function signedInitData(tgId, name) {
  const pairs = [
    ['auth_date', String(Math.floor(Date.now() / 1000))],
    ['query_id', 'AAF' + Math.random().toString(36).slice(2, 10)],
    ['user', JSON.stringify({ id: tgId, first_name: name, language_code: 'ru' })],
  ];
  const dcs = pairs.map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') + '&hash=' + hash;
}

function stubFor(tgId, name) {
  const initData = signedInitData(tgId, name);
  return `(() => {
    const data = {
      initData: ${JSON.stringify(initData)},
      initDataUnsafe: { user: { id: ${tgId}, first_name: ${JSON.stringify(name)}, language_code: 'ru' } },
      themeParams: {}, colorScheme: 'light', viewportHeight: 780, viewportStableHeight: 780,
      isExpanded: true, platform: 'web', version: '7.0'
    };
    function mk() { const f = function () { return px; }; const px = new Proxy(f, { get(t, p) { if (p === 'then') return undefined; return px; }, apply() { return px; } }); return px; }
    const wa = new Proxy(data, { get(t, p) { if (typeof p === 'string' && p in t) return t[p]; return mk(); } });
    window.Telegram = { WebApp: wa };
  })();`;
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.log('LAUNCH FAILED: ' + e.message);
    return;
  }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await ctx.route('**/telegram-web-app.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* blocked */' }));
  await ctx.addInitScript(stubFor(555000222, 'Пётр Сидоров'));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => { errs.push('PAGEERROR: ' + String(e.message).slice(0, 200)); console.log('PAGEERROR: ' + String(e.message).slice(0, 200)); });
  page.on('console', (m) => { if (m.type() === 'error') { errs.push('CONSOLE: ' + m.text().slice(0, 200)); console.log('CONSOLE: ' + m.text().slice(0, 200)); } });

  const dump = async (label) => {
    const st = await page.evaluate(() => {
      const vis = Array.from(document.querySelectorAll('.screen')).filter((e) => !e.hidden && getComputedStyle(e).display !== 'none').map((e) => e.id).join(',');
      const b = document.querySelector('#offlineBanner');
      const btns = Array.from(document.querySelectorAll('[data-action="enter-hours"],[data-action="fix-hours"]')).map((x) => ({
        act: x.getAttribute('data-action'), vis: !!(x.offsetWidth || x.offsetHeight), hidden: x.hidden
      }));
      const sheet = !!document.querySelector('.sheet');
      return { vis, banner: b ? { hidden: b.hidden, text: b.textContent.trim() } : null, btns, sheet, queue: localStorage.getItem('tc_offline_queue') };
    });
    console.log(`[${label}] screens=${st.vis} banner=${JSON.stringify(st.banner)} sheet=${st.sheet} btns=${JSON.stringify(st.btns)} queue=${st.queue}`);
    return st;
  };

  // 1. Загрузка онлайн
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await dump('1 loaded');

  // 2. Оффлайн
  await ctx.setOffline(true);
  console.log('[2] offline set');

  // 3. Клик «Записать часы»
  await page.click('[data-action="enter-hours"]', { timeout: 5000 });
  await page.waitForTimeout(600);
  await page.click('#whQuick .chip[data-wh="8"]', { timeout: 5000 });
  await page.waitForTimeout(200);
  await page.click('#whSave', { timeout: 5000 });
  await page.waitForTimeout(1500);
  await dump('3 after offline save');
  await page.screenshot({ path: 'D:/TimeControl/_shots/v5-offline-queued.png' });

  // 4. Онлайн → синк
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(2500);
  await dump('4 after online sync');
  await page.screenshot({ path: 'D:/TimeControl/_shots/v5-offline-synced.png' });

  // 5. Дубликат (409 «уже есть»): запись уже на сервере — кладём дубль
  // в очередь напрямую и дёргаем 'online': syncQueue должен получить 409
  // и убрать элемент из очереди (не зациклиться).
  await page.evaluate(() => {
    const q = JSON.parse(localStorage.getItem('tc_offline_queue') || '[]');
    q.push({
      id: Date.now() + 1,
      payload: { task_id: 1, work_date: new Date().toISOString().slice(0, 10), hours: '8.00' },
      created_at: new Date().toISOString()
    });
    localStorage.setItem('tc_offline_queue', JSON.stringify(q));
  });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(2000);
  const after409 = await page.evaluate(() => {
    const q = JSON.parse(localStorage.getItem('tc_offline_queue') || '[]');
    const b = document.querySelector('#offlineBanner');
    return { queueLen: q.length, bannerHidden: b ? b.hidden : 'no-el' };
  });
  console.log(`[5] duplicate 409: queueLen=${after409.queueLen} (ожидаем 0) bannerHidden=${after409.bannerHidden}`);

  console.log('JS errors: ' + (errs.length ? errs.length + ' (см. выше)' : 'none'));
  await browser.close();
})().catch((e) => { console.log('FATAL: ' + e.message); process.exit(1); });
