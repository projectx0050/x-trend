'use strict';

// Release 1.6.1 side-panel flows in real Chromium (Playwright), with chrome.* APIs
// shimmed and every background message answered by the scenario below.
// Run from C:\ClaudeCode\Xtrend-release\x-trend:
//   NODE_PATH=C:/ClaudeCode/Xtrend/node_modules node --test test/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PANEL = pathToFileURL(path.join(ROOT, 'sidepanel.html')).href;
const PORTAL_URL = 'https://billing.stripe.com/p/session/test_abc';
const QUOTA_TEXT = /\b1,?000\b|\bunlimited\b|\d+\s+(free\s+)?generations?\b|generations? (left|a month|available)|of \d|\d+\s*%|\ba month\b/i;
const RETIRED_TEXT = /world moments|write about it|occasion|halloween|diwali|see calendar/i;

const status = (tier, extra = {}) => ({
  tier, credits: 0, allowed_features: tier === 'business_pro' ? ['review_response', 'email_tone', 'proposal'] : ['caption', 'rewrite', 'hashtag', 'review_response', 'email_tone', 'proposal'],
  ...(tier === 'free'
    ? { free_phase: 'intro', daily_limit: 5, daily_used: 0, daily_remaining: 5 }
    : { monthly_limit: 1000, monthly_used: 250, monthly_remaining: 750 }),
  ...extra,
});

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(() => browser?.close());

async function openPanel({ tier = null, statusExtra = {}, responses = {}, storeExtra = {} }) {
  const page = await browser.newPage({ viewport: { width: 400, height: 900 } });
  const scenario = {
    store: { ...(tier ? { jwtToken: 't', userEmail: `${tier}@x.test`, userTier: tier } : {}), ...storeExtra },
    responses: {
      verifyAuth: tier ? { success: true, data: { user: { email: `${tier}@x.test`, tier } } } : { success: false, status: 401 },
      getUserStatus: tier ? { success: true, data: status(tier, statusExtra) } : { success: false },
      callBackend: { success: true, data: { result: 'Generated text', usage: { tier } } },
      callGuest: { success: true, data: { result: 'Generated text', usage: { tier: 'guest', remaining: 2 } } },
      openBillingPortal: { success: true, data: { url: PORTAL_URL } },
      createCheckoutSession: { success: true, data: { url: 'https://checkout.stripe.com/c/pay/test' } },
      ...responses,
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
  await page.waitForSelector('#usage-title:not(:empty)');
  await page.waitForTimeout(150);
  return page;
}

const calls = (page, action) => page.evaluate(a => window.__calls.filter(c => c.action === a), action);
const tabs = page => page.evaluate(() => window.__tabs);
const visible = page => page.evaluate(() => document.body.innerText);

const ALL_ACCOUNTS = [
  { label: 'guest' },
  { label: 'free', tier: 'free' },
  { label: 'free, used up', tier: 'free', statusExtra: { daily_used: 5, daily_remaining: 0 } },
  { label: 'social_pro', tier: 'social_pro' },
  { label: 'business_pro', tier: 'business_pro' },
  { label: 'bundle', tier: 'bundle' },
  { label: 'paid, used up', tier: 'social_pro', statusExtra: { monthly_used: 1000, monthly_remaining: 0 } },
  { label: 'owner', tier: 'free', statusExtra: { daily_limit: 999999, credits: 999999 } },
];

for (const account of ALL_ACCOUNTS) {
  test(`no quota text or retired feature: ${account.label}`, async () => {
    const page = await openPanel(account);
    const sheets = [await visible(page)];
    await page.click('#account-btn');
    sheets.push(await visible(page));
    await page.keyboard.press('Escape');
    await page.evaluate(() => openShop('plans'));
    sheets.push(await visible(page));
    await page.evaluate(() => openShop('credits'));
    sheets.push(await visible(page));
    for (const text of sheets) {
      assert.doesNotMatch(text, QUOTA_TEXT);
      assert.doesNotMatch(text, RETIRED_TEXT);
    }
    assert.equal(await page.locator('#usage-meter, [role="progressbar"]').count(), 0);
    assert.equal(await page.locator('#moments, #sheet-moments, #occasion-banner').count(), 0);
    await page.close();
  });
}

test('sign-up view carries no allowance text', async () => {
  const page = await openPanel({});
  await page.evaluate(() => openAccount('signup'));
  assert.doesNotMatch(await visible(page), QUOTA_TEXT);
  await page.close();
});

test('shipped source has no quota copy, retired feature or hardcoded Stripe link', () => {
  for (const f of ['sidepanel.html', 'sidepanel.js', 'sidepanel.css', 'background.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /billing\.stripe\.com/, f);
    assert.doesNotMatch(src, /world.?moment|occasion|\/api\/theme|getTheme\b|progressbar|Unlimited access/i, f);
  }
});

test('never asks the backend for themes or moments', async () => {
  const page = await openPanel({ tier: 'bundle' });
  const actions = await page.evaluate(() => [...new Set(window.__calls.map(c => c.action))]);
  assert.deepEqual(actions.sort(), ['getUserStatus', 'verifyAuth']);
  await page.close();
});

test('plan and credit prices are unchanged', async () => {
  const page = await openPanel({ tier: 'free' });
  await page.evaluate(() => openShop('plans'));
  const plans = await page.textContent('#shop-plans');
  for (const p of ['$9.99', '$19.99', '$29.99', 'Social Pro', 'Business Pro', 'Bundle']) assert.ok(plans.includes(p), p);
  const credits = await page.textContent('#shop-credits');
  for (const p of ['15 credits', '$2.99', '30 credits', '$4.99', '50 credits', '$9.99']) assert.ok(credits.includes(p), p);
  await page.close();
});

test('purchased credit balance stays visible', async () => {
  const page = await openPanel({ tier: 'social_pro', statusExtra: { credits: 12 } });
  assert.equal(await page.textContent('#credits-chip'), 'Credits: 12');
  await page.close();
});

test('Manage plan: opens the session URL from the backend', async () => {
  const page = await openPanel({ tier: 'social_pro' });
  await page.click('.usage-action:has-text("Manage plan")');
  await page.waitForFunction(() => window.__tabs.length === 1);
  assert.deepEqual(await tabs(page), [PORTAL_URL]);
  assert.equal((await calls(page, 'openBillingPortal'))[0].token, 't');
  await page.close();
});

test('Manage plan: account without a Stripe customer gets an explanation, no tab', async () => {
  const error = "We couldn't find billing details for your account. If you just purchased, wait a minute and try again, or contact support.";
  const page = await openPanel({ tier: 'social_pro', responses: { openBillingPortal: { success: false, error, code: 'no_billing_account', status: 404 } } });
  await page.click('.usage-action:has-text("Manage plan")');
  await page.waitForSelector('#billing-status.error');
  assert.equal(await page.textContent('#billing-status'), error);
  assert.equal(await page.isVisible('#sheet-account'), true);
  assert.deepEqual(await tabs(page), []);
  await page.close();
});

test('Manage plan: service failure shows a friendly message, no raw error, no tab', async () => {
  const page = await openPanel({ tier: 'bundle', responses: { openBillingPortal: { success: false, error: 'Unexpected token < in JSON' } } });
  await page.click('.usage-action:has-text("Manage plan")');
  await page.waitForSelector('#billing-status.error');
  assert.match(await page.textContent('#billing-status'), /couldn't open billing/i);
  assert.deepEqual(await tabs(page), []);
  await page.close();
});

test('Manage plan: expired session goes to log in', async () => {
  const page = await openPanel({ tier: 'bundle', responses: { openBillingPortal: { success: false, error: 'expired', status: 401 } } });
  await page.click('.usage-action:has-text("Manage plan")');
  await page.waitForSelector('#auth-status.error');
  assert.match(await page.textContent('#auth-status'), /session expired/i);
  assert.deepEqual(await tabs(page), []);
  await page.close();
});

test('Manage plan: repeat clicks while waiting open one tab', async () => {
  const page = await openPanel({ tier: 'bundle' });
  await page.evaluate(() => { openBillingPortal(); openBillingPortal(); });
  await page.waitForFunction(() => window.__tabs.length === 1);
  await page.waitForTimeout(100);
  assert.deepEqual(await tabs(page), [PORTAL_URL]);
  assert.equal((await calls(page, 'openBillingPortal')).length, 1);
  await page.close();
});

test('an unreadable server reply never shows raw parser text', async () => {
  const raw = `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`;
  const page = await openPanel({ tier: 'free', responses: {
    callBackend: { success: false, error: raw },
    createCheckoutSession: { success: false, error: raw },
  } });
  await page.fill('#caption-description', 'New coffee blend');
  await page.click('[data-generate="caption"]');
  await page.waitForSelector('#notice-caption .notice');
  assert.match(await page.textContent('#notice-caption'), /try again/i);
  await page.evaluate(() => openShop('credits'));
  await page.click('[data-product-id="credits_starter"]');
  await page.waitForSelector('#credits-error.error');
  assert.match(await page.textContent('#credits-error'), /try again/i);
  assert.doesNotMatch(await visible(page), /Unexpected token|JSON|DOCTYPE/);
  await page.close();
});

test('paid plan choosing another plan goes through the portal, credits through Checkout', async () => {
  const page = await openPanel({ tier: 'social_pro' });
  await page.evaluate(() => openShop('plans'));
  await page.click('[data-product-id="bundle"]');
  await page.waitForFunction(() => window.__tabs.length === 1);
  assert.deepEqual(await tabs(page), [PORTAL_URL]);
  await page.evaluate(() => openShop('credits'));
  await page.click('[data-product-id="credits_popular"]');
  await page.waitForFunction(() => window.__tabs.length === 2);
  assert.equal((await tabs(page))[1], 'https://checkout.stripe.com/c/pay/test');
  assert.deepEqual((await calls(page, 'createCheckoutSession'))[0].payload, { product_type: 'credits', product_id: 'credits_popular' });
  await page.close();
});

test('server rejection at the limit: friendly notice with no numbers from the server', async () => {
  const page = await openPanel({
    tier: 'social_pro',
    responses: { callBackend: { success: false, limitReached: true, error: "You've used all 1,000 generations this month." } },
  });
  await page.fill('#caption-description', 'New coffee blend');
  await page.click('[data-generate="caption"]');
  await page.waitForSelector('#notice-caption .notice');
  const notice = await page.textContent('#notice-caption');
  assert.match(notice, /Buy credits/);
  assert.doesNotMatch(notice, QUOTA_TEXT);
  await page.close();
});

test('guest out of tries is asked to sign up, with no numbers', async () => {
  const page = await openPanel({ storeExtra: { guestUsage: { total: 3, day: new Date().toISOString().slice(0, 10), dayCount: 1 } } });
  await page.fill('#caption-description', 'New coffee blend');
  await page.click('[data-generate="caption"]');
  await page.waitForSelector('#notice-caption .notice');
  assert.match(await page.textContent('#notice-caption'), /Create free account/);
  assert.doesNotMatch(await visible(page), QUOTA_TEXT);
  assert.equal((await calls(page, 'callGuest')).length, 0);
  await page.close();
});

test('all six tools generate', async () => {
  const page = await openPanel({ tier: 'bundle' });
  assert.equal(await page.locator('#workspace .tool').count(), 6);
  const fields = { caption: 'description', rewrite: 'content', hashtag: 'description', review_response: 'review', email_tone: 'email', proposal: 'jobPosting' };
  const suites = { caption: 'social', rewrite: 'social', hashtag: 'social', review_response: 'business', email_tone: 'business', proposal: 'business' };
  for (const [type, field] of Object.entries(fields)) {
    await page.click(`.suite-btn[data-suite="${suites[type]}"]`);
    await page.click(`.tool-tab[data-tool="${type}"]`);
    await page.fill(`#${type}-${field}`, 'Some text');
    await page.click(`[data-generate="${type}"]`);
    await page.waitForSelector(`#output-${type} .output-text`);
  }
  assert.deepEqual((await calls(page, 'callBackend')).map(c => c.payload.type), Object.keys(fields));
  await page.close();
});

test('log out returns to the guest view', async () => {
  const page = await openPanel({ tier: 'bundle' });
  await page.click('#account-btn');
  await page.click('#logout-btn');
  await page.waitForFunction(() => document.getElementById('account-btn').textContent === 'Sign in');
  assert.equal(await page.textContent('#plan-tag'), 'Guest');
  await page.close();
});
