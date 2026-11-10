// Скриншоты светлой темы + проверка 401-кодов (настоящая подпись initData).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:8077';
const envFile = fs.readFileSync('D:/TimeControl/.env', 'utf8');
const mt = envFile.match(/^BOT_TOKEN=(.*)$/m);
const BOT_TOKEN = mt ? mt[1].trim().replace(/^["']|["']$/g, '') : '';

function signedInitData(tgId, name) {
  const pairs = [
    ['auth_date', String(Math.floor(Date.now() / 1000))],
    ['user', JSON.stringify({ id: Number(tgId), first_name: name, language_code: 'ru' })],
  ];
  const dcs = pairs.map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') + '&hash=' + hash;
}

function findChrome() {
  const cache = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (!fs.existsSync(cache)) return null;
  const dirs = fs.readdirSync(cache).filter(d => d.startsWith('chromium'));
  for (const d of dirs) {
    for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe']) {
      const p = path.join(cache, d, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

async function shoot(page, name) {
  await page.screenshot({ path: 'D:/TimeControl/_shots/' + name });
  console.log('shot:', name);
}

(async () => {
  const exe = findChrome();
  if (!exe) { console.error('NO CHROME'); process.exit(1); }
  const browser = await chromium.launch({ executablePath: exe });
  const errors = [];

  async function openAs(tgId, name) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('**/telegram-web-app.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* blocked */' }));
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    const initData = signedInitData(tgId, name);
    await page.addInitScript(({ initData, id, fn }) => {
      window.Telegram = { WebApp: {
        initData: initData,
        initDataUnsafe: { user: { id: Number(id), first_name: fn, language_code: 'ru' } },
        ready: () => {}, expand: () => {}, close: () => {},
        colorScheme: 'light', themeParams: {}, isExpanded: true,
        setHeaderColor: () => {}, setBackgroundColor: () => {},
        showAlert: (m) => window.__lastAlert = m,
        HapticFeedback: { impactOccurred: () => {} },
        MainButton: { hide: () => {}, show: () => {}, setText: () => {}, onClick: () => {} },
        BackButton: { hide: () => {}, show: () => {}, onClick: () => {} },
        openLink: () => {}, openTelegramLink: () => {},
      }};
    }, { initData, id: tgId, fn: name });
    await page.goto(BASE + '/app/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    return page;
  }

  // Работник
  const w = await openAs('555000222', 'Пётр');
  const bg = await w.evaluate(() => getComputedStyle(document.body).backgroundColor);
  console.log('worker body bg:', bg);
  await shoot(w, 'light-worker.png');

  // Руководитель: вкладки
  const m = await openAs('555000111', 'Иван');
  await shoot(m, 'light-manager-today.png');
  const tabs = await m.$$('nav button, .nav button');
  for (const t of tabs) {
    const vis = await t.isVisible().catch(() => false);
    if (!vis) continue;
    const label = (await t.textContent()).trim();
    if (['Задания', 'Деньги'].includes(label)) {
      await t.click();
      await m.waitForTimeout(900);
      await shoot(m, 'light-manager-' + (label === 'Задания' ? 'tasks' : 'money') + '.png');
    }
  }

  // Незарегистрированный: экран логина с новым текстом
  const u = await openAs('999999999', 'Гость');
  await u.waitForTimeout(1200);
  const loginText = await u.evaluate(() => {
    const el = document.querySelector('#screenLogin [data-i18n="loginSubtitle"]');
    return el ? el.textContent : '(no login screen)';
  });
  const btnVisible = await u.evaluate(() => {
    const b = document.querySelector('#btnOpenBot');
    return b ? !b.hidden : false;
  });
  console.log('login text:', loginText);
  console.log('open-bot visible:', btnVisible);
  await shoot(u, 'light-login.png');

  console.log('=== JS ERRORS ===');
  console.log(errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
