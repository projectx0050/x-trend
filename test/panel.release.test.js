'use strict';

// Release 1.6.0 side-panel flows in real Chromium (Playwright), with chrome.* APIs
// shimmed and every background message answered by the scenario below.
// Run from C:\ClaudeCode\Xtrend-release\x-trend:
//   NODE_PATH=C:/ClaudeCode/Xtrend/node_modules node --test test/

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const PANEL = pathToFileURL(path.join(__dirname, '..', 'sidepanel.html')).href;
const TODAY = new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

const MOMENTS = [
  { id: 'a', date: addDays(TODAY, 2), name: 'Halloween', blurb: 'Spooky', search_url: 'https://www.google.com/search?q=Halloween%202026' },
  { id: 'b', date: addDays(TODAY, 12), name: 'Diwali', blurb: 'Lights', search_url: 'https://www.google.com/search?q=Diwali%202026' },
  { id: 'c', date: addDays(TODAY, 40), name: '<img src=x onerror="window.__xss=1">', blurb: '<b>bold</b>', search_url: 'javascript:alert(1)' },
];
const FULL = { full: true, can_write: true, moments: MOMENTS };
const TEASER = { full: false, can_write: false, moments: [MOMENTS[0]] };
const status = (tier, extra = {}) => ({
  tier, credits: 0, allowed_features: tier === 'business_pro' ? ['review_response', 'email_tone', 'proposal'] : ['caption', 'rewrite', 'hashtag', 'review_response', 'email_tone', 'proposal'],
  ...(tier === 'free'
    ? { free_phase: 'intro', daily_limit: 5, daily_used: 0, daily_remaining: 5 }
    : { monthly_limit: 1000, monthly_used: 250, monthly_remaining: 750 }),
  ...extra,
});
const LIVE_THEME = { id: 9, name: 'Halloween', start_date: addDays(TODAY, -1), end_date: addDays(TODAY, 1), visual: { accent: '#c2410c', emoji: '🎃', banner: 'Happy Halloween from X-Trend' } };

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(() => browser?.close());

async function openPanel({ tier = null, moments, theme = null, statusExtra = {} }) {
  const page = await browser.newPage({ viewport: { width: 400, height: 900 } });
  const scenario = {
    store: tier ? { jwtToken: 't', userEmail: `${tier}@x.test`, userTier: tier } : {},
    responses: {
      verifyAuth: tier ? { success: true, data: { user: { email: `${tier}@x.test`, tier } } } : { success: false, status: 401 },
      getUserStatus: tier ? { success: true, data: status(tier, statusExtra) } : { success: false },
      getWorldMoments: { success: true, data: moments ?? (tier === 'social_pro' || tier === 'bundle' ? FULL : TEASER) },
      getTheme: { success: true, data: { theme } },
      callBackend: { success: true, data: { result: 'Generated caption', usage: { tier } } },
    },
  };
  await page.addInitScript(sc => {
    window.__calls = [];
    window.__tabs = [];
    const store = { ...sc.store };
    window.chrome = {
      runtime: {
        lastError: undefined,
        sendMessage(msg, cb) { window.__calls.push(msg); setTimeout(() => cb(sc.responses[msg.action] ?? { success: false, error: 'unhandled' }), 0); },
      },
      storage: { local: {
        get(keys, cb) { cb(Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]]))); },
        set(o, cb) { Object.assign(store, o); cb?.(); },
        remove(keys, cb) { [].concat(keys).forEach(k => delete store[k]); cb?.(); },
      } },
      tabs: { create: async ({ url }) => { window.__tabs.push(url); return { id: 1 }; }, onRemoved: { addListener() {} } },
    };
  }, scenario);
  await page.goto(PANEL);
  await page.waitForFunction(() => window.__calls.some(c => c.action === 'getTheme'));
  await page.waitForTimeout(100);
  return page;
}

const calls = (page, action) => page.evaluate(a => window.__calls.filter(c => c.action === a), action);

test('Social Pro: 1,000 monthly numbers, full calendar, Google links, Write about it prefills without generating', async () => {
  const page = await openPanel({ tier: 'social_pro' });
  assert.equal(await page.textContent('#usage-sub'), '750 of 1,000 generations left this month');
  assert.equal(await page.getAttribute('#usage-meter', 'aria-valuemax'), '1000');
  assert.equal(await page.isVisible('#moments'), true);
  assert.equal(await page.locator('#moments-featured .moment').count(), 2);
  assert.equal(await page.isVisible('#moments-upsell'), false);
  assert.equal(await page.getAttribute('#moments-featured .moment-name >> nth=0', 'href'), 'https://www.google.com/search?q=Halloween%202026');
  assert.equal(await page.getAttribute('#moments-featured .moment-name >> nth=0', 'target'), '_blank');

  await page.click('#moments-more');
  assert.equal(await page.isVisible('#sheet-moments'), true);
  assert.equal(await page.locator('#moments-list .moment').count(), 3);
  // Hostile text renders as text; non-Google URLs are not linked.
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator('#moments-list .moment >> nth=2').locator('a').count(), 0);
  assert.match(await page.textContent('#moments-list .moment >> nth=2'), /<img src=x/);

  const before = (await calls(page, 'callBackend')).length;
  await page.click('#moments-list .moment >> nth=1 >> button');
  assert.equal(await page.isVisible('#sheet-moments'), false);
  assert.equal(await page.isVisible('#tool-caption'), true);
  const text = await page.inputValue('#caption-description');
  assert.match(text, /^A post for Diwali \(\d+ \w{3} \d{4}\): $/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'caption-description');
  await page.fill('#caption-description', `${text}lamps and sweets`);
  assert.equal((await calls(page, 'callBackend')).length, before, 'never auto-generates');
  await page.close();
});

test('Bundle: full calendar and Write about it', async () => {
  const page = await openPanel({ tier: 'bundle' });
  assert.equal(await page.isVisible('#moments-more'), true);
  assert.equal(await page.locator('#moments-featured button', { hasText: 'Write about it' }).count(), 2);
  assert.equal(await page.textContent('#usage-sub'), '750 of 1,000 generations left this month');
  await page.close();
});

test('Business Pro: teaser only, no Write about it, 1,000 numbers shown', async () => {
  const page = await openPanel({ tier: 'business_pro' });
  assert.equal(await page.locator('#moments-featured .moment').count(), 1);
  assert.equal(await page.locator('#moments button', { hasText: 'Write about it' }).count(), 0);
  assert.equal(await page.isVisible('#moments-more'), false);
  assert.equal(await page.isVisible('#moments-upsell'), true);
  assert.equal(await page.textContent('#usage-sub'), '750 of 1,000 generations left this month');
  const msg = (await calls(page, 'getWorldMoments'))[0];
  assert.equal(msg.token, 't', 'server decides the plan view');
  await page.close();
});

test('Free: single teaser with upsell; free usage display unchanged', async () => {
  const page = await openPanel({ tier: 'free' });
  assert.equal(await page.locator('#moments-featured .moment').count(), 1);
  assert.equal(await page.locator('#moments button', { hasText: 'Write about it' }).count(), 0);
  assert.equal(await page.textContent('#usage-title'), '5 free generations available');
  await page.click('#moments-upgrade');
  assert.equal(await page.isVisible('#sheet-plans'), true);
  assert.match(await page.textContent('#shop-plans'), /Social tools, 1,000 generations a month/);
  await page.close();
});

test('Guest: teaser requested without a token', async () => {
  const page = await openPanel({});
  assert.equal(await page.locator('#moments-featured .moment').count(), 1);
  assert.equal((await calls(page, 'getWorldMoments'))[0].token, '');
  await page.close();
});

test('paid account at its 1,000 limit sees it clearly', async () => {
  const page = await openPanel({ tier: 'social_pro', statusExtra: { monthly_used: 1000, monthly_remaining: 0, credits: 3 } });
  assert.equal(await page.textContent('#usage-title'), "You've used this month's generations");
  assert.equal(await page.textContent('#usage-sub'), 'Your credits cover extra generations');
  await page.close();
});

test('approved live theme: banner + accent; logo unchanged', async () => {
  const page = await openPanel({ tier: 'free', theme: LIVE_THEME });
  assert.equal(await page.textContent('#occasion-banner'), '🎃 Happy Halloween from X-Trend');
  assert.equal(await page.isVisible('#occasion-banner'), true);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim()), '#c2410c');
  assert.equal(await page.getAttribute('.brand-mark', 'src'), 'icon128.png');
  assert.equal(await page.textContent('.brand-name'), 'X-Trend');
  await page.close();
});

test('no theme, expired theme, or a malformed colour: normal look', async () => {
  for (const theme of [null,
    { ...LIVE_THEME, start_date: addDays(TODAY, -5), end_date: addDays(TODAY, -3) },
    { ...LIVE_THEME, visual: { ...LIVE_THEME.visual, accent: 'red;background:url(x)' } }]) {
    const page = await openPanel({ tier: 'free', theme });
    assert.equal(await page.isVisible('#occasion-banner'), false);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim()), '#7452f0');
    await page.close();
  }
});

test('calendar unavailable: card hidden, the six tools still work', async () => {
  const page = await openPanel({ tier: 'bundle', moments: { full: true, can_write: true, moments: [] } });
  assert.equal(await page.isVisible('#moments'), false);
  assert.equal(await page.locator('#workspace .tool').count(), 6);
  await page.selectOption?.('#caption-platform', 'Instagram').catch(() => {});
  await page.fill('#caption-description', 'New coffee blend');
  await page.click('[data-generate="caption"]');
  await page.waitForFunction(() => window.__calls.some(c => c.action === 'callBackend'));
  const sent = (await calls(page, 'callBackend'))[0];
  assert.equal(sent.payload.type, 'caption');
  await page.close();
});
