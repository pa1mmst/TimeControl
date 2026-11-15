// Общие помощники браузерных сценариев (запускаются из tests/test_browser.py).
// Настоящий DOM + настоящий бэкенд; Telegram WebApp подменён заглушкой,
// initData подписан тем же BOT_TOKEN, что у тестового сервера.
'use strict';
const crypto = require('crypto');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: 'playwright не установлен: ' + e.message }));
  process.exit(2);
}

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8077';
const BOT_TOKEN = process.env.BOT_TOKEN || '';

function signedInitData(user) {
  const pairs = [
    ['auth_date', String(Math.floor(Date.now() / 1000))],
    ['query_id', 'AAF' + Math.random().toString(36).slice(2, 10)],
    ['user', JSON.stringify(user)],
  ];
  const dcs = pairs.map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') +
    '&hash=' + hash;
}

// Заглушка Telegram.WebApp. showConfirm/showPopup отвечают window.__tgConfirmAnswer
// (по умолчанию true). Все вызовы пишутся в window.__tgCalls для проверок.
function tgStub(initData, user, colorScheme) {
  return `(() => {
    const calls = [];
    window.__tgCalls = calls;
    window.__tgConfirmAnswer = true;
    const log = (name, args) => calls.push({ name, args: Array.from(args || []).map((a) => typeof a === 'function' ? 'fn' : a) });
    const handlers = {};
    const btn = (name) => {
      const b = {
        isVisible: false, text: '',
        show() { log(name + '.show'); b.isVisible = true; return b; },
        hide() { log(name + '.hide'); b.isVisible = false; return b; },
        onClick(fn) { log(name + '.onClick'); (handlers[name] = handlers[name] || []).push(fn); return b; },
        offClick(fn) { handlers[name] = (handlers[name] || []).filter((f) => f !== fn); return b; },
        setText(t) { b.text = t; return b; }, setParams() { return b; },
        enable() { return b; }, disable() { return b; },
        showProgress() { return b; }, hideProgress() { return b; },
      };
      return b;
    };
    window.__tgPress = (name) => (handlers[name] || []).slice().forEach((fn) => fn());
    const wa = {
      initData: ${JSON.stringify(initData)},
      initDataUnsafe: { user: ${JSON.stringify(user)} },
      themeParams: {}, colorScheme: ${JSON.stringify(colorScheme || 'light')},
      viewportHeight: 780, viewportStableHeight: 780, isExpanded: true,
      platform: 'web', version: '7.0',
      BackButton: btn('BackButton'), MainButton: btn('MainButton'), SecondaryButton: btn('SecondaryButton'),
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      ready() { log('ready'); }, expand() { log('expand'); }, close() { log('close'); },
      setHeaderColor() {}, setBackgroundColor() {}, enableClosingConfirmation() {}, disableClosingConfirmation() {},
      onEvent(ev, fn) { (handlers['ev:' + ev] = handlers['ev:' + ev] || []).push(fn); },
      offEvent() {},
      showConfirm(msg, cb) { log('showConfirm', [msg]); setTimeout(() => cb && cb(window.__tgConfirmAnswer), 0); },
      showAlert(msg, cb) { log('showAlert', [msg]); setTimeout(() => cb && cb(), 0); },
      showPopup(p, cb) { log('showPopup', [p && p.message]); setTimeout(() => cb && cb(window.__tgConfirmAnswer ? 'ok' : null), 0); },
      openLink(u) { log('openLink', [u]); }, openTelegramLink(u) { log('openTelegramLink', [u]); },
      isVersionAtLeast() { return true; },
    };
    window.Telegram = { WebApp: wa };
  })();`;
}

// Открыть приложение от имени пользователя с tg_id. Возвращает {browser, page, errors}.
// errors: необработанные исключения страницы и console.error — сценарий с ними падает.
const opened = [];

async function openApp(tgId, opts) {
  opts = opts || {};
  const user = { id: Number(tgId), first_name: 'Test', language_code: opts.lang || 'ru' };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, locale: 'ru-RU' });
  await ctx.route('**/telegram-web-app.js', (r) =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stub */' }));
  await ctx.addInitScript(tgStub(signedInitData(user), user, opts.colorScheme));
  const page = await ctx.newPage();
  const errors = [];
  opened.push({ browser, errors });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e.message).slice(0, 300)));
  page.on('console', (m) => {
    // «Failed to load resource» — это сетевой отказ (в т.ч. подстроенный сценарием), не JS-ошибка.
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) {
      errors.push('CONSOLE: ' + m.text().slice(0, 300));
    }
  });
  if (opts.beforeGoto) await opts.beforeGoto(page, ctx);
  await page.goto(BASE + '/', { waitUntil: 'load' });
  // Приложение готово, когда скрыт экран загрузки.
  await page.waitForFunction(() => {
    const l = document.getElementById('screenLoading');
    return l && l.hidden;
  }, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  return { browser, page, errors };
}

// id видимых экранов (.screen без hidden).
async function visibleScreens(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.screen'))
    .filter((e) => !e.hidden && getComputedStyle(e).display !== 'none').map((e) => e.id));
}

// Видимый текст элемента (или '' если нет). Неразрывные и узкие пробелы -> обычный пробел,
// чтобы «1 234,50 €» сравнивалось как набрано в сценарии.
async function text(page, selector) {
  const el = await page.$(selector);
  return el ? norm(await el.innerText()) : '';
}

function norm(s) {
  return String(s || '').replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

// Первый и последний день текущего месяца (локальное время), YYYY-MM-DD.
function monthBounds() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const ym = d.getFullYear() + '-' + p(d.getMonth() + 1);
  return [ym + '-01', ym + '-' + p(last)];
}

class Fail extends Error {}

function expect(cond, message) {
  if (!cond) throw new Fail(message);
}

// Запуск сценария: печатает одну строку JSON {ok, error?, data?, errors[]}.
// JS-ошибки любой открытой страницы валят сценарий.
async function run(fn) {
  const out = { ok: false, errors: [], data: {} };
  try {
    await fn(out.data);
    out.ok = true;
  } catch (e) {
    out.error = (e instanceof Fail ? 'FAIL: ' : 'ERROR: ') + e.message;
  }
  opened.forEach((o) => out.errors.push(...o.errors));
  if (out.ok && out.errors.length) {
    out.ok = false;
    out.error = 'JS-ошибки на странице';
  }
  for (const o of opened) await o.browser.close().catch(() => {});
  console.log(JSON.stringify(out));
  process.exit(out.ok ? 0 : 1);
}

module.exports = { BASE, openApp, visibleScreens, text, norm, monthBounds, expect, run, Fail };
