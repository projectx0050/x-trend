'use strict';

// X-Trend side panel. All network calls go through background.js messages.

// Stripe's email-login portal: fallback for accounts without a linked customer.
const STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/3cleVd6gwfsl2WL9audZ600';

// Signed-out allowance, tracked locally for UX (the server enforces a hard
// ceiling separately): 5 to try X-Trend, then 1 per day.
const GUEST_INITIAL = 5;
const GUEST_DAILY = 1;
const SIGNUP_PITCH = 'Create a free account to unlock 5 daily generations for your first 5 days.';

const PLAN_LABELS = { free: 'Free', social_pro: 'Social Pro', business_pro: 'Business Pro', bundle: 'Bundle' };
const PLAN_INCLUDES = {
  social_pro: 'Social X-Trend tools included',
  business_pro: 'Business X-Trend tools included',
  bundle: 'All 6 tools plus Brand Voice',
};

// Values are what the backend's Platform Voice Engine accepts.
const PLATFORMS = [
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'X/Twitter', label: 'X' },
  { value: 'LinkedIn', label: 'LinkedIn' },
  { value: 'TikTok', label: 'TikTok' },
  { value: 'Threads', label: 'Threads' },
];
const CHAR_LIMITS = { 'X/Twitter': 280, Threads: 500 };

const TOOLS = [
  {
    type: 'caption', suite: 'social', tab: 'Caption',
    intro: 'Describe your post. X-Trend writes it in the native voice of the platform you pick.',
    fields: [
      { name: 'description', kind: 'textarea', label: 'What is the post about?', required: true, rows: 5,
        placeholder: 'e.g. Launching our autumn menu this Friday, pumpkin spice cold brew is back' },
      { name: 'platform', kind: 'chips', label: 'Platform', options: PLATFORMS },
    ],
    action: 'Write caption', outputLabel: 'Caption', brandVoice: true,
  },
  {
    type: 'rewrite', suite: 'social', tab: 'Rewrite',
    intro: 'Paste something you already wrote. X-Trend reshapes it for another platform.',
    fields: [
      { name: 'content', kind: 'textarea', label: 'Content to rewrite', required: true, rows: 6,
        placeholder: 'Paste a post, caption, or announcement' },
      { name: 'platform', kind: 'chips', label: 'Rewrite for', options: PLATFORMS },
    ],
    action: 'Rewrite for platform', outputLabel: 'Rewritten post', brandVoice: true,
  },
  {
    type: 'hashtag', suite: 'social', tab: 'Hashtags',
    intro: 'Get hashtags people on that platform actually follow.',
    fields: [
      { name: 'description', kind: 'textarea', label: 'What is the post about?', required: true, rows: 4,
        placeholder: 'e.g. Home workout routine for beginners, no equipment' },
      { name: 'platform', kind: 'chips', label: 'Platform', options: PLATFORMS },
    ],
    action: 'Suggest hashtags', outputLabel: 'Hashtags',
  },
  {
    type: 'review_response', suite: 'business', tab: 'Reviews',
    intro: 'Paste a Google or Yelp review and get a reply you can post.',
    fields: [
      { name: 'review', kind: 'textarea', label: 'Customer review', required: true, rows: 5,
        placeholder: 'Paste the review here' },
      { name: 'tone', kind: 'chips', label: 'Tone', options: ['Professional', 'Friendly', 'Apologetic'].map(v => ({ value: v, label: v })) },
    ],
    action: 'Write reply', outputLabel: 'Reply',
  },
  {
    type: 'email_tone', suite: 'business', tab: 'Email',
    intro: 'Keep your message, change how it sounds.',
    fields: [
      { name: 'email', kind: 'textarea', label: 'Your email', required: true, rows: 6,
        placeholder: 'Paste your draft email' },
      { name: 'tone', kind: 'chips', label: 'Make it', options: ['More Professional', 'More Friendly', 'More Concise', 'More Assertive'].map(v => ({ value: v, label: v.replace('More ', '') })) },
    ],
    action: 'Fix tone', outputLabel: 'Rewritten email',
  },
  {
    type: 'proposal', suite: 'business', tab: 'Proposal',
    intro: 'Paste a job post from Upwork, Fiverr, or anywhere else.',
    fields: [
      { name: 'jobPosting', kind: 'textarea', label: 'Job description', required: true, rows: 6,
        placeholder: 'Paste the job description' },
      { name: 'skills', kind: 'text', label: 'Your relevant skills', optional: true,
        placeholder: 'e.g. 5 years Shopify, built 40+ stores' },
    ],
    action: 'Write proposal', outputLabel: 'Proposal',
  },
];
const TOOL_BY_TYPE = Object.fromEntries(TOOLS.map(t => [t.type, t]));
const SOCIAL_TYPES = new Set(['caption', 'rewrite', 'hashtag']);

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  token: '',
  email: '',
  tier: 'free',
  status: null,           // /api/user-status response
  brandVoice: '',
  isDark: true,
  suite: 'social',
  activeTool: { social: 'caption', business: 'review_response' },
  guest: { total: 0, day: '', dayCount: 0 },
  unlocked: new Set(),    // gated tools the user chose to pay for with credits
  lastInput: {},          // per tool, for Regenerate
  authMode: 'login',
  sheetOpener: null,
};

const $ = id => document.getElementById(id);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const today = () => new Date().toISOString().slice(0, 10); // UTC day

function send(action, extra = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action, ...extra }, response => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: 'X-Trend could not reach its background service. Please try again.' });
        return;
      }
      resolve(response || { success: false, error: 'No response. Please try again.' });
    });
  });
}

const store = {
  get: keys => new Promise(r => chrome.storage.local.get(keys, r)),
  set: obj => new Promise(r => chrome.storage.local.set(obj, r)),
  remove: keys => new Promise(r => chrome.storage.local.remove(keys, r)),
};

// ── Tool rendering ─────────────────────────────────────────────────────────
function fieldHtml(tool, f) {
  const id = `${tool.type}-${f.name}`;
  if (f.kind === 'chips') {
    const chips = f.options.map((o, i) => `
      <label class="chip"><input type="radio" name="${id}" value="${o.value}"${i === 0 ? ' checked' : ''} /><span>${o.label}</span></label>`).join('');
    return `<fieldset class="chips"><legend>${f.label}</legend>${chips}</fieldset>`;
  }
  const opt = f.optional ? ' <span class="field-optional">(optional)</span>' : '';
  const control = f.kind === 'textarea'
    ? `<textarea id="${id}" rows="${f.rows}" placeholder="${f.placeholder}"></textarea>`
    : `<input type="text" id="${id}" placeholder="${f.placeholder}" />`;
  return `<label class="field"><span class="field-label">${f.label}${opt}</span>${control}</label>`;
}

function renderTools() {
  $('workspace').innerHTML = TOOLS.map(t => `
    <section class="tool" id="tool-${t.type}" role="tabpanel" aria-label="${t.tab}" hidden>
      <p class="tool-intro">${t.intro}</p>
      ${t.fields.map(f => fieldHtml(t, f)).join('')}
      ${t.brandVoice ? `<p class="voice-note" id="voice-${t.type}" hidden>Using your <strong>Brand Voice</strong></p>` : ''}
      <button class="btn btn-primary btn-generate" type="button" data-generate="${t.type}">${t.action}</button>
      <div id="notice-${t.type}"></div>
      <div id="output-${t.type}"><div class="empty-state">Your ${t.outputLabel.toLowerCase()} will appear here.</div></div>
    </section>`).join('');
}

function readInput(tool) {
  const input = {};
  for (const f of tool.fields) {
    const id = `${tool.type}-${f.name}`;
    input[f.name] = f.kind === 'chips'
      ? document.querySelector(`input[name="${id}"]:checked`)?.value
      : $(id).value.trim();
  }
  return input;
}

function selectSuite(suite) {
  state.suite = suite;
  document.querySelectorAll('.suite-btn').forEach(b => b.setAttribute('aria-selected', String(b.dataset.suite === suite)));
  $('tool-tabs').innerHTML = TOOLS.filter(t => t.suite === suite).map(t =>
    `<button class="tool-tab" role="tab" type="button" data-tool="${t.type}" aria-selected="false">${t.tab}</button>`).join('');
  selectTool(state.activeTool[suite]);
}

function selectTool(type) {
  state.activeTool[TOOL_BY_TYPE[type].suite] = type;
  document.querySelectorAll('.tool-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tool === type)));
  TOOLS.forEach(t => { $(`tool-${t.type}`).hidden = t.type !== type; });
  store.set({ lastSuite: state.suite, lastTools: state.activeTool });
  refreshGate(type);
}

// ── Notices ────────────────────────────────────────────────────────────────
function showNotice(type, { kind = '', title = '', body = '', actions = [] }) {
  const el = $(`notice-${type}`);
  el.innerHTML = '';
  const box = document.createElement('div');
  box.className = `notice ${kind}`;
  box.setAttribute('role', kind === 'is-error' ? 'alert' : 'status');
  if (title) { const t = document.createElement('div'); t.className = 'notice-title'; t.textContent = title; box.append(t); }
  if (body) { const b = document.createElement('div'); b.className = 'notice-body'; b.textContent = body; box.append(b); }
  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'notice-actions';
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${a.primary ? 'btn-primary' : 'btn-secondary'}`;
      btn.textContent = a.label;
      btn.addEventListener('click', a.onClick);
      row.append(btn);
    }
    box.append(row);
  }
  el.append(box);
}
const clearNotice = type => { $(`notice-${type}`).innerHTML = ''; };

function showSignupNotice(type) {
  showNotice(type, {
    kind: 'is-upsell',
    title: "You've used your free generations",
    body: SIGNUP_PITCH,
    actions: [
      { label: 'Create free account', primary: true, onClick: () => openAccount('signup') },
      { label: 'Log in', onClick: () => openAccount('login') },
    ],
  });
}

function showLimitNotice(type, message) {
  const credits = state.status?.credits || 0;
  showNotice(type, {
    kind: 'is-upsell',
    title: state.tier === 'free' ? "You've used today's free generations" : "You've used this month's generations",
    body: message || 'Use credits or upgrade to continue.',
    actions: [
      { label: credits > 0 ? plural(credits, 'credit') + ' left' : 'Buy credits', primary: true, onClick: () => openSheet('sheet-credits') },
      ...(state.tier === 'free' ? [{ label: 'See plans', onClick: () => openSheet('sheet-plans') }] : []),
    ],
  });
}

// Paid plans only include their own suite; other tools can still be used with credits.
function isPlanGated(type) {
  if (!state.token) return false;
  if (state.tier === 'social_pro') return !SOCIAL_TYPES.has(type);
  if (state.tier === 'business_pro') return SOCIAL_TYPES.has(type);
  return false;
}

function refreshGate(type) {
  const btn = document.querySelector(`[data-generate="${type}"]`);
  const gated = isPlanGated(type) && !state.unlocked.has(type);
  btn.disabled = gated;
  if (!gated) {
    if ($(`notice-${type}`).querySelector('.is-gate')) clearNotice(type);
    return;
  }
  const credits = state.status?.credits || 0;
  const other = SOCIAL_TYPES.has(type) ? 'Social' : 'Business';
  showNotice(type, {
    kind: 'is-upsell is-gate',
    title: `This tool is part of ${other} X-Trend`,
    body: credits > 0
      ? `Your ${PLAN_LABELS[state.tier]} plan doesn't include it. Each generation here uses 1 credit.`
      : `Your ${PLAN_LABELS[state.tier]} plan doesn't include it. Buy credits to use it, or switch to Bundle for all 6 tools.`,
    actions: credits > 0
      ? [{ label: `Use credits (${credits} left)`, primary: true, onClick: () => { state.unlocked.add(type); refreshGate(type); } },
         { label: 'Change plan', onClick: openBillingPortal }]
      : [{ label: 'Buy credits', primary: true, onClick: () => openSheet('sheet-credits') },
         { label: 'Change plan', onClick: openBillingPortal }],
  });
}

// ── Output ─────────────────────────────────────────────────────────────────
function renderOutput(tool, text, input) {
  const wrap = $(`output-${tool.type}`);
  wrap.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'output';

  const head = document.createElement('div');
  head.className = 'output-head';
  const label = document.createElement('span');
  label.className = 'output-label';
  const platform = PLATFORMS.find(p => p.value === input.platform);
  label.textContent = platform ? `${tool.outputLabel} for ${platform.label}` : tool.outputLabel;
  head.append(label);

  const body = document.createElement('div');
  body.className = 'output-text';
  body.textContent = text;

  const foot = document.createElement('div');
  foot.className = 'output-foot';
  const count = document.createElement('span');
  count.className = 'output-count';
  const limit = (tool.type === 'caption' || tool.type === 'rewrite') ? CHAR_LIMITS[input.platform] : null;
  const chars = [...text].length;
  count.textContent = limit ? `${chars} / ${limit} characters` : `${plural(text.split(/\s+/).filter(Boolean).length, 'word')}`;
  if (limit && chars > limit) count.classList.add('over');

  const actions = document.createElement('div');
  actions.className = 'output-actions';
  const regen = document.createElement('button');
  regen.type = 'button';
  regen.className = 'btn btn-ghost btn-sm';
  regen.textContent = 'Regenerate';
  regen.addEventListener('click', () => generate(tool.type, true));
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn btn-secondary btn-sm copy-btn';
  copy.textContent = 'Copy';
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(text).then(() => {
      copy.textContent = 'Copied';
      copy.classList.add('copied');
      setTimeout(() => { copy.textContent = 'Copy'; copy.classList.remove('copied'); }, 1800);
    }).catch(() => { copy.textContent = 'Select and copy'; });
  });
  actions.append(regen, copy);
  foot.append(count, actions);

  card.append(head, body, foot);
  wrap.append(card);
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Generate ───────────────────────────────────────────────────────────────
function setBusy(type, busy) {
  const btn = document.querySelector(`[data-generate="${type}"]`);
  const tool = TOOL_BY_TYPE[type];
  btn.disabled = busy;
  btn.innerHTML = busy ? '<span class="spinner" aria-hidden="true"></span><span>Writing…</span>' : '';
  if (!busy) btn.textContent = tool.action;
}

async function generate(type, regenerate = false) {
  const tool = TOOL_BY_TYPE[type];
  const input = regenerate && state.lastInput[type] ? state.lastInput[type] : readInput(tool);
  const missing = tool.fields.find(f => f.required && !input[f.name]);
  if (missing) {
    showNotice(type, { kind: 'is-error', body: `Add the ${missing.label.toLowerCase().replace(/\?$/, '')} first.` });
    $(`${type}-${missing.name}`)?.focus();
    return;
  }
  if (!state.token && guestRemaining() <= 0) { showSignupNotice(type); return; }

  clearNotice(type);
  setBusy(type, true);
  const payload = { type, ...input };
  if (!payload.skills) delete payload.skills;
  if (tool.brandVoice && state.tier === 'bundle' && state.brandVoice) payload.brandVoice = state.brandVoice;

  const res = state.token
    ? await send('callBackend', { payload, token: state.token })
    : await send('callGuest', { payload });
  setBusy(type, false);
  refreshGate(type);

  if (res.success) {
    state.lastInput[type] = input;
    renderOutput(tool, res.data.result, input);
    if (state.token) fetchStatus(); else await recordGuestUse();
    return;
  }

  if (!state.token && res.signupRequired) {
    await exhaustGuestToday();
    showSignupNotice(type);
  } else if (/session expired|not logged in/i.test(res.error || '')) {
    await clearAuth();
    openAccount('login', 'Your session expired. Please log in again.');
  } else if (res.limitReached) {
    showLimitNotice(type, res.error);
    fetchStatus();
  } else if (res.featureGated) {
    state.unlocked.delete(type);
    fetchStatus();
    refreshGate(type);
  } else {
    showNotice(type, { kind: 'is-error', body: res.error || 'Something went wrong. Please try again.' });
  }
}

// ── Guest allowance (local, UX only) ───────────────────────────────────────
function guestRemaining() {
  const g = state.guest;
  if (g.total < GUEST_INITIAL) return GUEST_INITIAL - g.total;
  return Math.max(0, GUEST_DAILY - (g.day === today() ? g.dayCount : 0));
}

async function recordGuestUse() {
  const g = state.guest;
  const total = g.total + 1;
  let dayCount;
  if (total < GUEST_INITIAL) dayCount = 0;
  else if (total === GUEST_INITIAL) dayCount = GUEST_DAILY; // daily allowance starts tomorrow
  else dayCount = (g.day === today() ? g.dayCount : 0) + 1;
  state.guest = { total, day: today(), dayCount };
  await store.set({ guestUsage: state.guest });
  renderUsage();
}

// Server said the visitor is out; mirror that locally so the UI agrees.
async function exhaustGuestToday() {
  state.guest = { total: Math.max(state.guest.total, GUEST_INITIAL), day: today(), dayCount: GUEST_DAILY };
  await store.set({ guestUsage: state.guest });
  renderUsage();
}

// ── Usage strip ────────────────────────────────────────────────────────────
function setMeter(remaining, max) {
  const meter = $('usage-meter');
  meter.hidden = max == null;
  if (max == null) return;
  $('usage-meter-fill').style.width = `${max ? Math.round((remaining / max) * 100) : 0}%`;
  meter.setAttribute('aria-valuemax', String(max));
  meter.setAttribute('aria-valuenow', String(remaining));
}

function renderUsage() {
  const title = $('usage-title');
  const sub = $('usage-sub');
  const chip = $('credits-chip');
  title.classList.remove('empty');

  if (!state.token) {
    const left = guestRemaining();
    const initial = state.guest.total < GUEST_INITIAL;
    $('plan-tag').textContent = 'Guest';
    chip.hidden = true;
    if (left > 0) {
      title.textContent = initial ? `${plural(left, 'free generation')} left` : '1 free generation left today';
      sub.textContent = initial ? 'Try any tool, no account needed' : 'Create a free account for 5 a day';
    } else {
      title.textContent = "You've used today's free generations";
      title.classList.add('empty');
      sub.textContent = 'Create a free account for 5 a day';
    }
    setMeter(left, initial ? GUEST_INITIAL : GUEST_DAILY);
    return;
  }

  const s = state.status;
  $('plan-tag').textContent = PLAN_LABELS[state.tier] || state.tier;
  const credits = s?.credits || 0;
  chip.hidden = !(credits > 0) || credits >= 999999;
  chip.textContent = plural(credits, 'credit');

  if (!s) { title.textContent = 'Loading your plan…'; sub.textContent = ''; setMeter(0, null); return; }

  if ((s.daily_limit ?? s.monthly_limit) >= 999999) {
    title.textContent = 'Unlimited access';
    sub.textContent = 'All 6 tools';
    setMeter(0, null);
    return;
  }

  if (state.tier === 'free') {
    const left = s.daily_remaining ?? 0;
    if (left > 0) {
      title.textContent = `${plural(left, 'free generation')} left today`;
    } else {
      title.textContent = "You've used today's free generations";
      title.classList.add('empty');
    }
    if (left === 0) sub.textContent = credits > 0 ? 'Your credits cover extra generations' : 'Use credits or upgrade to continue';
    else if (s.is_trial) sub.textContent = `5 a day for ${plural(s.intro_days_left, 'more day')}, then 2 a day`;
    else sub.textContent = '2 free generations every day';
    setMeter(left, s.daily_limit);
    return;
  }

  title.textContent = `${PLAN_LABELS[state.tier]} plan`;
  sub.textContent = PLAN_INCLUDES[state.tier] || '';
  setMeter(0, null);
}

// ── Account, auth, plan ────────────────────────────────────────────────────
function renderAccountButton() {
  const btn = $('account-btn');
  btn.innerHTML = '';
  if (!state.token) {
    btn.classList.remove('signed-in');
    btn.textContent = 'Sign in';
    btn.setAttribute('aria-label', 'Sign in or create an account');
    return;
  }
  btn.classList.add('signed-in');
  const av = document.createElement('span');
  av.className = 'avatar';
  av.textContent = (state.email[0] || '?').toUpperCase();
  const label = document.createElement('span');
  label.textContent = 'Account';
  btn.append(av, label);
  btn.setAttribute('aria-label', `Account for ${state.email}`);
}

function renderAccountSheet() {
  const signedIn = !!state.token;
  $('auth-section').hidden = signedIn;
  $('forgot-section').hidden = true;
  $('account-section').hidden = !signedIn;
  if (!signedIn) return;
  $('account-avatar').textContent = (state.email[0] || '?').toUpperCase();
  $('account-email').textContent = state.email;
  $('account-plan').textContent = `${PLAN_LABELS[state.tier] || state.tier} plan`;
  $('bv-locked').hidden = state.tier === 'bundle';
  $('bv-form').hidden = state.tier !== 'bundle';
  renderPlanSection();
}

function renderPlanSection() {
  const box = $('plan-section-content');
  box.innerHTML = '';
  const isPaid = ['social_pro', 'business_pro', 'bundle'].includes(state.tier);
  const add = (label, cls, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', onClick);
    box.append(b);
  };
  const credits = state.status?.credits || 0;
  const line = document.createElement('p');
  line.className = 'hint';
  line.textContent = isPaid
    ? `${PLAN_INCLUDES[state.tier]}.${credits > 0 && credits < 999999 ? ` You also have ${plural(credits, 'credit')}.` : ''}`
    : `Free plan: 5 generations a day for your first 5 days, then 2 a day.${credits > 0 && credits < 999999 ? ` You also have ${plural(credits, 'credit')}.` : ''}`;
  box.append(line);
  if (isPaid) {
    add('Manage subscription', 'btn-secondary', openBillingPortal);
    if (state.tier !== 'bundle') add('Switch plan', 'btn-secondary', openBillingPortal);
  } else {
    add('See plans', 'btn-primary', () => openSheet('sheet-plans'));
  }
  add('Buy credits', 'btn-secondary', () => openSheet('sheet-credits'));
}

function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll('.seg-btn').forEach(b => b.setAttribute('aria-selected', String(b.dataset.auth === mode)));
  const signup = mode === 'signup';
  $('auth-submit-btn').textContent = signup ? 'Create free account' : 'Log in';
  $('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
  $('terms-field').hidden = !signup;
  $('auth-pitch').hidden = !signup;
  $('forgot-password-btn').hidden = signup;
  $('terms-checkbox').checked = false;
  setStatus('auth-status', '');
  $('auth-spam-note').hidden = true;
  $('resend-verification-btn').hidden = true;
}

function setStatus(id, msg, ok) {
  const el = $(id);
  el.textContent = msg;
  el.className = `status${msg ? (ok ? ' success' : ' error') : ''}`;
}

function openAccount(mode, message) {
  renderAccountSheet();
  if (!state.token) {
    setAuthMode(mode || 'login');
    if (message) setStatus('auth-status', message, false);
  }
  openSheet('sheet-account');
}

async function submitAuth() {
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const btn = $('auth-submit-btn');
  if (!email || !password) { setStatus('auth-status', 'Enter your email and password.', false); return; }
  if (state.authMode === 'signup' && !$('terms-checkbox').checked) {
    setStatus('auth-status', 'Please agree to the Terms of Service and Privacy Policy.', false);
    return;
  }

  btn.disabled = true;
  btn.textContent = state.authMode === 'signup' ? 'Creating account…' : 'Logging in…';
  setStatus('auth-status', '');

  if (state.authMode === 'signup') {
    const res = await send('authSignup', { payload: { email, password, termsAccepted: true } });
    btn.disabled = false;
    btn.textContent = 'Create free account';
    if (res.success) {
      setStatus('auth-status', res.data.message || 'Account created. Check your email to verify it, then log in.', res.data.email_sent !== false);
      $('auth-spam-note').hidden = res.data.email_sent === false;
      if (res.data.email_sent === false) $('resend-verification-btn').hidden = false;
    } else {
      setStatus('auth-status', res.error || 'Signup failed. Please try again.', false);
    }
    return;
  }

  const res = await send('authLogin', { payload: { email, password } });
  btn.disabled = false;
  btn.textContent = 'Log in';
  if (!res.success) {
    setStatus('auth-status', res.error || 'Could not log in. Please try again.', false);
    $('resend-verification-btn').hidden = res.code !== 'email_not_verified';
    return;
  }
  state.token = res.data.token;
  state.email = res.data.user.email;
  state.tier = res.data.user.tier;
  state.unlocked.clear();
  await store.set({ jwtToken: state.token, userEmail: state.email, userTier: state.tier });
  $('auth-password').value = '';
  onAuthChanged();
  closeSheet();
}

async function resendVerification() {
  const email = $('auth-email').value.trim();
  if (!email) { setStatus('auth-status', 'Enter your email address above first.', false); return; }
  const btn = $('resend-verification-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  const res = await send('resendVerification', { payload: { email } });
  btn.disabled = false;
  btn.textContent = 'Resend verification email';
  if (res.success) {
    setStatus('auth-status', 'Verification email sent. Check your inbox.', true);
    btn.hidden = true;
  } else {
    setStatus('auth-status', res.error || 'Could not resend the email. Please try again.', false);
  }
}

async function submitForgot() {
  const email = $('forgot-email').value.trim();
  const btn = $('forgot-submit-btn');
  if (!email) { setStatus('forgot-status', 'Enter your email address.', false); return; }
  btn.disabled = true;
  btn.textContent = 'Sending…';
  const res = await send('forgotPassword', { payload: { email } });
  btn.textContent = 'Send reset link';
  if (res.success) {
    setStatus('forgot-status', res.data?.message || 'Check your email for a reset link.', true);
  } else {
    btn.disabled = false;
    setStatus('forgot-status', res.error || 'Something went wrong. Please try again.', false);
  }
}

async function logout() {
  if (state.token) send('authLogout', { token: state.token });
  await clearAuth();
  closeSheet();
}

async function clearAuth() {
  Object.assign(state, { token: '', email: '', tier: 'free', status: null });
  state.unlocked.clear();
  await store.remove(['jwtToken', 'userEmail', 'userTier', 'cachedStatus']);
  $('auth-email').value = '';
  $('auth-password').value = '';
  onAuthChanged();
}

function onAuthChanged() {
  renderAccountButton();
  renderAccountSheet();
  renderUsage();
  TOOLS.forEach(t => {
    const v = $(`voice-${t.type}`);
    if (v) v.hidden = !(state.tier === 'bundle' && state.brandVoice);
    refreshGate(t.type);
  });
  if (state.token) fetchStatus();
}

async function fetchStatus() {
  const res = await send('getUserStatus', { token: state.token });
  if (!res.success) return;
  state.status = res.data;
  const tierChanged = res.data.tier && res.data.tier !== state.tier;
  if (tierChanged) state.tier = res.data.tier;
  await store.set({ cachedStatus: res.data, userTier: state.tier });
  renderUsage();
  renderAccountSheet();
  renderAccountButton();
  TOOLS.forEach(t => {
    const v = $(`voice-${t.type}`);
    if (v) v.hidden = !(state.tier === 'bundle' && state.brandVoice);
    refreshGate(t.type);
  });
}

// Re-checks the saved session; only signs out on a definite rejection.
async function verifySession() {
  const res = await send('verifyAuth', { token: state.token });
  if (!res.success && (res.status === 401 || res.status === 404)) {
    await clearAuth();
    openAccount('login', 'Your session expired. Please log in again.');
    return;
  }
  if (res.success && res.data.user) {
    state.email = res.data.user.email;
    state.tier = res.data.user.tier;
    await store.set({ userEmail: state.email, userTier: state.tier });
    renderAccountButton();
  }
  fetchStatus();
}

async function saveBrandVoice() {
  if (state.tier !== 'bundle') { setStatus('brand-voice-status', 'Brand Voice is part of the Bundle plan.', false); return; }
  state.brandVoice = $('brand-voice-input').value.trim();
  await store.set({ brandVoice: state.brandVoice });
  setStatus('brand-voice-status', state.brandVoice ? 'Brand Voice saved.' : 'Brand Voice cleared.', true);
  TOOLS.forEach(t => { const v = $(`voice-${t.type}`); if (v) v.hidden = !state.brandVoice; });
  setTimeout(() => setStatus('brand-voice-status', ''), 2500);
}

// ── Checkout & billing portal ──────────────────────────────────────────────
async function openCheckout(productType, productId, errorId) {
  setStatus(errorId, '');
  if (!state.token) {
    closeSheet();
    openAccount('signup', 'Create a free account first, then choose your plan or credits.');
    return;
  }
  const paid = ['social_pro', 'business_pro', 'bundle'].includes(state.tier);
  if (productType === 'subscription' && paid) { openBillingPortal(); return; }
  const res = await send('createCheckoutSession', { payload: { product_type: productType, product_id: productId }, token: state.token });
  if (!res.success || !res.data?.url) {
    setStatus(errorId, res.error || 'Could not start checkout. Please try again.', false);
    return;
  }
  chrome.tabs.create({ url: res.data.url });
}

async function openBillingPortal() {
  const res = await send('openBillingPortal', { token: state.token });
  chrome.tabs.create({ url: (res.success && res.data?.url) || STRIPE_PORTAL_URL });
}

// ── Sheets ─────────────────────────────────────────────────────────────────
function openSheet(id) {
  if (!document.querySelector('.sheet:not([hidden])')) state.sheetOpener = document.activeElement;
  document.querySelectorAll('.sheet').forEach(s => { s.hidden = s.id !== id; });
  $('scrim').hidden = false;
  const sheet = $(id);
  (sheet.querySelector('input:not([type="checkbox"]):not([hidden]), textarea, .btn') || sheet.querySelector('button'))?.focus();
}

function closeSheet() {
  document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; });
  $('scrim').hidden = true;
  state.sheetOpener?.focus?.();
  state.sheetOpener = null;
}

// ── Theme ──────────────────────────────────────────────────────────────────
function applyTheme() {
  document.body.classList.toggle('light', !state.isDark);
  $('theme-toggle').setAttribute('aria-label', state.isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

// ── Wiring ─────────────────────────────────────────────────────────────────
function wire() {
  document.querySelectorAll('.suite-btn').forEach(b => b.addEventListener('click', () => selectSuite(b.dataset.suite)));
  $('tool-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) selectTool(b.dataset.tool); });
  $('workspace').addEventListener('click', e => { const b = e.target.closest('[data-generate]'); if (b) generate(b.dataset.generate); });
  $('workspace').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      const tool = e.target.closest('.tool');
      if (tool) generate(tool.id.replace('tool-', ''));
    }
  });

  $('theme-toggle').addEventListener('click', () => {
    state.isDark = !state.isDark;
    applyTheme();
    store.set({ themeMode: state.isDark ? 'dark' : 'light' });
  });
  $('account-btn').addEventListener('click', () => openAccount());

  document.querySelectorAll('[data-close-sheet]').forEach(b => b.addEventListener('click', closeSheet));
  $('scrim').addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('scrim').hidden) closeSheet(); });

  document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.auth)));
  $('auth-submit-btn').addEventListener('click', submitAuth);
  $('auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
  $('resend-verification-btn').addEventListener('click', resendVerification);
  $('forgot-password-btn').addEventListener('click', () => {
    $('auth-section').hidden = true;
    $('forgot-section').hidden = false;
    $('forgot-email').value = $('auth-email').value.trim();
    $('forgot-submit-btn').disabled = false;
    setStatus('forgot-status', '');
    $('forgot-email').focus();
  });
  $('forgot-back-btn').addEventListener('click', () => { $('forgot-section').hidden = true; $('auth-section').hidden = false; });
  $('forgot-submit-btn').addEventListener('click', submitForgot);
  $('logout-btn').addEventListener('click', logout);
  $('save-brand-voice-btn').addEventListener('click', saveBrandVoice);

  $('sheet-plans').addEventListener('click', e => {
    const b = e.target.closest('[data-product-type]');
    if (b) openCheckout(b.dataset.productType, b.dataset.productId, 'plans-error');
  });
  $('sheet-credits').addEventListener('click', e => {
    const b = e.target.closest('[data-product-type]');
    if (b) openCheckout(b.dataset.productType, b.dataset.productId, 'credits-error');
  });
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  renderTools();
  wire();

  const saved = await store.get(['jwtToken', 'userEmail', 'userTier', 'themeMode', 'brandVoice', 'guestUsage', 'cachedStatus', 'lastSuite', 'lastTools']);
  state.isDark = saved.themeMode !== 'light';
  applyTheme();
  state.brandVoice = saved.brandVoice || '';
  $('brand-voice-input').value = state.brandVoice;
  if (saved.guestUsage) state.guest = { ...state.guest, ...saved.guestUsage };
  if (saved.lastTools) Object.assign(state.activeTool, saved.lastTools);

  if (saved.jwtToken) {
    state.token = saved.jwtToken;
    state.email = saved.userEmail || '';
    state.tier = saved.userTier || 'free';
    state.status = saved.cachedStatus || null; // instant display, refreshed below
  }

  selectSuite(saved.lastSuite === 'business' ? 'business' : 'social');
  renderAccountButton();
  renderAccountSheet();
  renderUsage();
  TOOLS.forEach(t => { const v = $(`voice-${t.type}`); if (v) v.hidden = !(state.tier === 'bundle' && state.brandVoice); });

  if (state.token) verifySession();
}

init();
