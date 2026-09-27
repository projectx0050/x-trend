'use strict';

// Service worker: opens the side panel and proxies all backend requests.

const BACKEND = 'https://x-trend-backend.onrender.com';

// Clicking the toolbar icon opens the X-Trend side panel, which stays open
// beside the page while the user works in the tab.
function enableSidePanel() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(err => console.error('[X-Trend] could not enable side panel:', err));
}
chrome.runtime.onInstalled.addListener(enableSidePanel);
chrome.runtime.onStartup.addListener(enableSidePanel);
enableSidePanel();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'authSignup':
      postAuth('/auth/signup', request.payload)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'authLogin':
      postAuth('/auth/login', request.payload)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message, code: err.code }));
      return true;

    case 'resendVerification':
      postAuth('/auth/resend-verification', request.payload)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'authLogout':
      postAuth('/auth/logout', null, request.token)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'callBackend':
      callGenerate(request.payload, request.token)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({
          success: false,
          error: err.message,
          limitReached: !!err.limitReached,
          featureGated: !!err.featureGated,
        }));
      return true;

    case 'callGuest':
      callGuest(request.payload)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({
          success: false,
          error: err.message,
          signupRequired: !!err.signupRequired,
        }));
      return true;

    case 'verifyAuth':
      verifyAuth(request.token)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message, status: err.status || 0 }));
      return true;

    case 'getUserStatus':
      fetchUserStatus(request.token)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'forgotPassword':
      postAuth('/auth/forgot-password', request.payload)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'resetPassword':
      postAuth('/auth/reset-password', request.payload)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'createCheckoutSession':
      createCheckoutSession(request.payload, request.token)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'openBillingPortal':
      postAuth('/payments/portal', null, request.token)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message, code: err.code }));
      return true;

    // Legacy — kept for backwards compatibility
    case 'getUsage':
      fetchUserStatus(request.token)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
  }
});

async function postAuth(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(data.error || `Request failed (${resp.status})`);
    err.status = resp.status;
    err.code   = data.code;
    throw err;
  }
  return data;
}

async function callGenerate(payload, token) {
  if (!token) throw new Error('Not logged in. Please sign in to generate content.');

  const resp = await fetch(`${BACKEND}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  if (!resp.ok) {
    if (resp.status === 401) throw new Error('Session expired. Please log in again.');
    if (data.code === 'rate_limited') throw new Error(data.error);
    if (resp.status === 402 || resp.status === 429) {
      const err = new Error(data.error || 'Daily limit reached. Upgrade to continue.');
      err.limitReached = true;
      throw err;
    }
    if (resp.status === 403) {
      const err = new Error(data.error || 'This feature requires a Pro subscription.');
      err.featureGated = true;
      throw err;
    }
    throw new Error(data.error || `Server error (${resp.status})`);
  }
  return data;
}

// Signed-out generation. The server enforces a hard daily ceiling; the side
// panel tracks the visible allowance locally.
async function callGuest(payload) {
  const resp = await fetch(`${BACKEND}/api/generate/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(data.error || `Server error (${resp.status})`);
    err.signupRequired = !!data.signup_required;
    throw err;
  }
  return data;
}

async function verifyAuth(token) {
  if (!token) {
    const err = new Error('No token');
    err.status = 401;
    throw err;
  }

  const resp = await fetch(`${BACKEND}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(data.error || `Error ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return data;
}

async function fetchUserStatus(token) {
  if (!token) throw new Error('Not logged in');

  const resp = await fetch(`${BACKEND}/api/user-status`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `Error ${resp.status}`);
  return data;
}

async function createCheckoutSession(payload, token) {
  if (!token) throw new Error('Not logged in');

  const { product_type, product_id } = payload;

  // The backend's credit pack keys don't include the 'credits_' prefix
  // (e.g. extension sends 'credits_popular', backend expects 'popular').
  let backendProductId = product_id;
  if (product_type === 'credits' && product_id.startsWith('credits_')) {
    backendProductId = product_id.slice('credits_'.length);
  }

  const resp = await fetch(`${BACKEND}/payments/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ product_type, product_id: backendProductId }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `Error ${resp.status}`);
  return data;
}
