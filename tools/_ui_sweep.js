// Обход Mini App по экранам: руководитель (555000111) + сотрудник (555000222).
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8077';
const OUT = 'D:/TimeControl/files/ui/sweep.json';
const lines = [];
const L = (s) => lines.push(String(s));

function initDataFor(tg) {
  const tok = (fs.readFileSync('D:/TimeControl/.env', 'utf8').match(/^BOT_TOKEN=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');
  const pairs = [['auth_date', String(Math.floor(Date.now() / 1000))], ['query_id', 'q' + Date.now() + Math.random().toString(36).slice(2, 6)], ['user', JSON.stringify({ id: tg, first_name: 'T', language_code: 'ru' })]];
  const dcs = pairs.map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(tok).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') + '&hash=' + hash;
}
function stubFor(tg) {
  const d = { initData: initDataFor(tg), initDataUnsafe: { user: { id: tg, first_name: 'T', language_code: 'ru' } }, themeParams: {}, colorScheme: 'light', viewportHeight: 780, viewportStableHeight: 780, isExpanded: true, platform: 'web', version: '7.0' };
  return `(()=>{const d=${JSON.stringify(d)};window.Telegram={WebApp:new Proxy(d,{get(t,p){if(typeof p==='string'&&p in t)return t[p];return ()=>undefined}})}})();`;
}

(async () => {
  const browser = await chromium.launch();
  for (const who of [{ tag: 'manager', tg: 555000111 }, { tag: 'worker', tg: 555000222 }]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
    await ctx.route('**/telegram-web-app.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/*x*/' }));
    await ctx.addInitScript(stubFor(who.tg));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => L(who.tag + ' PAGEERROR: ' + e.message.slice(0, 160)));
    const shot = (n) => p.screenshot({ path: 'D:/TimeControl/files/ui/' + who.tag + '_' + n + '.png' }).catch(() => {});
    const clk = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel).catch(() => false);
    const scr = () => p.evaluate(() => Array.from(document.querySelectorAll('.screen')).filter((e) => !e.hidden).map((e) => e.id).join(',') || '(none)').catch(() => '?');
    try {
      await p.goto(BASE + '/', { waitUntil: 'load' });
      await p.waitForTimeout(2500);
      L(who.tag + ' after init screen=' + await scr());
      L(who.tag + ' nav=' + await p.evaluate(() => Array.from(document.querySelectorAll('.nav-item')).map((e) => e.getAttribute('data-nav-target') + (e.hidden ? '[hidden]' : '[vis]')).join('|')));
      L(who.tag + ' moreBtn=' + await p.evaluate(() => { const e = document.getElementById('navMoreBtn'); return e ? 'hidden=' + e.hidden : 'missing'; }));
      await shot('01_dashboard');

      for (const s of ['hours', 'reports']) { await clk('.nav-item[data-nav-target="' + s + '"]'); await p.waitForTimeout(1200); L(who.tag + ' nav ' + s + ' -> ' + await scr()); await shot('nav_' + s); }

      await clk('#navMoreBtn'); await p.waitForTimeout(600);
      L(who.tag + ' more items=' + await p.evaluate(() => Array.from(document.querySelectorAll('.more-menu-item')).map((e) => e.getAttribute('data-nav-target') + (e.offsetParent ? '[vis]' : '[hid]')).join('|')));
      await shot('02_more');
      for (const s of ['team', 'clients', 'inventory', 'payments']) {
        const ok = await clk('.more-menu-item[data-nav-target="' + s + '"]');
        await p.waitForTimeout(1400);
        L(who.tag + ' more ' + s + ' clicked=' + ok + ' -> ' + await scr());
        await shot('more_' + s);
        await clk('#navMoreBtn').catch(() => {}); await p.waitForTimeout(400);
      }
      await clk('#navProfileBtn'); await p.waitForTimeout(1200);
      L(who.tag + ' profile -> ' + await scr());
      L(who.tag + ' langSel=' + await p.evaluate(() => { const e = document.querySelector('#profileLang,#langSelect,select[name=lang]'); return e ? Array.from(e.options).map((o) => o.value).join('/') : 'missing'; }));
      await shot('03_profile');
      // смена языка: ищем «голые» ключи вида a.b.c
      const langOk = await p.evaluate(() => { const e = document.querySelector('#profileLang,#langSelect,select[name=lang]'); if (!e) return 'no-select'; e.value = 'uk'; e.dispatchEvent(new Event('change', { bubbles: true })); return 'uk'; });
      await p.waitForTimeout(1500);
      L(who.tag + ' lang switch=' + langOk + ' nakedKeys=' + await p.evaluate(() => (document.body.innerText.match(/\b[a-z]+\.[a-z_]{2,}\b/g) || []).slice(0, 8).join(',') || 'none'));
      await shot('04_lang_uk');
    } catch (e) { L(who.tag + ' FATAL: ' + e.message.slice(0, 200)); }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(OUT, lines.join('\n'));
})().then(() => process.exit(0)).catch((e) => { fs.writeFileSync(OUT, lines.join('\n') + '\nCRASH: ' + e.message); process.exit(0); });
