// Точечная проверка: (1) локации в форме задания после выбора клиента; (2) видимость кнопок руководителя у сотрудника.
const fs = require('fs'); const crypto = require('crypto'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8077'; const out = []; const L = (s) => out.push(String(s));
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
  for (const tg of [555000111, 555000222]) {
    const tag = tg === 555000111 ? 'MANAGER' : 'WORKER';
    const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
    await ctx.route('**/telegram-web-app.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/*x*/' }));
    await ctx.addInitScript(stub(tg));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => L(tag + ' PAGEERROR: ' + e.message.slice(0, 120)));
    await p.goto(BASE + '/', { waitUntil: 'load' }); await p.waitForTimeout(2500);
    L(tag + ' btnNewTask rendered=' + await p.evaluate(() => { const e = document.getElementById('btnNewTask'); return e ? (e.offsetParent !== null) + ' hidden=' + e.hidden : 'missing'; }));
    L(tag + ' navMoreBtn=' + await p.evaluate(() => { const e = document.getElementById('navMoreBtn'); return e ? 'rendered=' + (e.offsetParent !== null) : 'missing'; }));
    L(tag + ' dashText=' + JSON.stringify(await p.evaluate(() => (document.getElementById('screenDashboard') || {}).innerText?.replace(/\s+/g, ' ').slice(0, 200) || '')));
    await p.evaluate(() => document.querySelector('.nav-item[data-nav-target="tasks"]')?.click()); await p.waitForTimeout(900);
    const canNew = await p.evaluate(() => { const e = document.getElementById('btnNewTask'); if (!e || e.offsetParent === null) return false; e.click(); return true; });
    L(tag + ' openedNewTaskForm=' + canNew);
    if (canNew) {
      await p.waitForTimeout(600);
      await p.selectOption('#ntClient', { index: 1 }).catch(() => L(tag + ' selectOption FAILED'));
      for (const w of [500, 1500, 3000]) {
        await p.waitForTimeout(w === 500 ? 500 : w - 500);
        L(tag + ' after ' + w + 'ms: locBoxes=' + await p.evaluate(() => document.querySelectorAll('#ntLocations input[type=checkbox]').length)
          + ' locText=' + JSON.stringify(await p.evaluate(() => (document.getElementById('ntLocations') || {}).innerText?.replace(/\s+/g, ' ').slice(0, 80) || ''))
          + ' htmlLen=' + await p.evaluate(() => (document.getElementById('ntLocations') || {}).innerHTML?.length || 0));
      }
      await p.screenshot({ path: 'D:/TimeControl/files/ui/probe_newtask_' + tag + '.png', fullPage: true });
    }
    await ctx.close();
  }
  await b.close();
})().then(() => { fs.writeFileSync('D:/TimeControl/files/ui/probe2.txt', out.join('\n')); process.exit(0); })
 .catch((e) => { fs.writeFileSync('D:/TimeControl/files/ui/probe2.txt', out.join('\n') + '\nCRASH ' + e.message); process.exit(0); });
