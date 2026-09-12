// Ключевая проверка: может ли СОТРУДНИК реально добраться до экранов руководителя?
const fs = require('fs'); const crypto = require('crypto'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8077'; const out = [];
const L = (s) => out.push(String(s));
function stub(tg) {
  const tok = (fs.readFileSync('D:/TimeControl/.env', 'utf8').match(/^BOT_TOKEN=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');
  const pairs = [['auth_date', String(Math.floor(Date.now() / 1000))], ['query_id', 'q' + Date.now()], ['user', JSON.stringify({ id: tg, first_name: 'T', language_code: 'ru' })]];
  const dcs = pairs.map(([k, v]) => k + '=' + v).sort().join('\n');
  const sec = crypto.createHmac('sha256', 'WebAppData').update(tok).digest();
  const id = pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') + '&hash=' + crypto.createHmac('sha256', sec).update(dcs).digest('hex');
  return `(()=>{const d={initData:${JSON.stringify(id)},initDataUnsafe:{user:{id:${tg},first_name:'T',language_code:'ru'}},themeParams:{},colorScheme:'light',viewportHeight:780,viewportStableHeight:780,isExpanded:true,platform:'web',version:'7.0'};window.Telegram={WebApp:new Proxy(d,{get(t,p){if(typeof p==='string'&&p in t)return t[p];return ()=>undefined}})}})();`;
}
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  await ctx.route('**/telegram-web-app.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/*x*/' }));
  await ctx.addInitScript(stub(555000222));
  const p = await ctx.newPage();
  const api = [];
  p.on('response', async (r) => { if (r.url().includes('/api/')) api.push(r.status() + ' ' + r.request().method() + ' ' + r.url().replace(BASE, '')); });
  p.on('pageerror', (e) => L('PAGEERROR: ' + e.message.slice(0, 150)));
  await p.goto(BASE + '/', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  L('me=' + JSON.stringify(await p.evaluate(() => (window.STATE && (STATE.me || STATE.user)) || null)).slice(0, 160));
  L('moreBtn=' + await p.evaluate(() => { const e = document.getElementById('navMoreBtn'); return e ? 'hidden=' + e.hidden + ' display=' + getComputedStyle(e).display : 'missing'; }));
  L('more container=' + await p.evaluate(() => { const c = document.getElementById('navMoreMenu') || document.querySelector('.more-menu')?.parentElement; return c ? c.id + ' hidden=' + c.hidden + ' display=' + getComputedStyle(c).display + ' vis=' + getComputedStyle(c).visibility : 'missing'; }));
  L('moreItem team rendered=' + await p.evaluate(() => { const e = document.querySelector('.more-menu-item[data-nav-target="team"]'); return e ? (e.offsetParent !== null) + ' hidden=' + e.hidden : 'missing'; }));
  // реальный пользовательский путь: жмём только видимые кнопки
  const realClick = async (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e || e.offsetParent === null) return false; e.click(); return true; }, sel);
  L('real click navMoreBtn=' + await realClick('#navMoreBtn'));
  await p.waitForTimeout(500);
  L('real click team=' + await realClick('.more-menu-item[data-nav-target="team"]'));
  await p.waitForTimeout(1500);
  L('screen=' + await p.evaluate(() => Array.from(document.querySelectorAll('.screen')).filter((e) => !e.hidden).map((e) => e.id).join(',')));
  L('team body=' + JSON.stringify(await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 260))));
  L('API: ' + JSON.stringify(api.slice(-8)));
  await p.screenshot({ path: 'D:/TimeControl/files/ui/worker_realpath.png', fullPage: true });
  await b.close();
})().then(() => { fs.writeFileSync('D:/TimeControl/files/ui/worker_probe.txt', out.join('\n')); process.exit(0); })
 .catch((e) => { fs.writeFileSync('D:/TimeControl/files/ui/worker_probe.txt', out.join('\n') + '\nCRASH ' + e.message); process.exit(0); });
