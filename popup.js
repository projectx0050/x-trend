'use strict';

// REPLACE WITH STRIPE CUSTOMER PORTAL URL
const STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/test_00w3cv9s14VYfjC6RMdfG00';

// ── State ─────────────────────────────────────────────────────────────────────
let jwtToken     = '';
let userEmail    = '';
let userTier     = 'free';
let userStatus   = null; // full status from /api/user-status
let settingsOpen = false;
let isDarkMode   = false;
let authMode     = 'login'; // 'login' | 'signup'
let brandVoice   = '';
let currentScreen = 'home'; // 'home' | 'social' | 'business'
let expandedViewEnabled  = true;
let readingPanelCloseTimer = null;

// ── DOM refs — settings / auth ────────────────────────────────────────────────
const settingsToggle    = document.getElementById('settings-toggle');
const settingsPanel     = document.getElementById('settings-panel');
const authSection              = document.getElementById('auth-section');
const authTabs                 = document.querySelectorAll('.auth-tab');
const authEmailInput           = document.getElementById('auth-email');
const authPasswordInput        = document.getElementById('auth-password');
const authSubmitBtn            = document.getElementById('auth-submit-btn');
const authStatus               = document.getElementById('auth-status');
const termsField               = document.getElementById('terms-field');
const termsCheckbox            = document.getElementById('terms-checkbox');
const resendVerificationField  = document.getElementById('resend-verification-field');
const resendVerificationBtn    = document.getElementById('resend-verification-btn');
const authSpamNote             = document.getElementById('auth-spam-note');
const accountSection           = document.getElementById('account-section');
const accountEmailEl    = document.getElementById('account-email');
const accountTierEl     = document.getElementById('account-tier');
const logoutBtn         = document.getElementById('logout-btn');

// ── DOM refs — brand voice ─────────────────────────────────────────────────────
const brandVoiceInput     = document.getElementById('brand-voice-input');
const saveBrandVoiceBtn   = document.getElementById('save-brand-voice-btn');
const brandVoiceStatus    = document.getElementById('brand-voice-status');
const homeBrandVoiceStrip = document.getElementById('home-brand-voice-strip');
const bvBundleGate        = document.getElementById('bv-bundle-gate');
const bvForm              = document.getElementById('bv-form');

// ── DOM refs — footer / theme ─────────────────────────────────────────────────
const usageLine1  = document.getElementById('usage-line-1');
const usageLine2  = document.getElementById('usage-line-2');
const themeToggle = document.getElementById('theme-toggle');

// ── DOM refs — upgrade banner ─────────────────────────────────────────────────
const upgradeBanner     = document.getElementById('upgrade-banner');
const upgradeCreditsBtn = document.getElementById('upgrade-credits-btn');
const upgradeProBtn     = document.getElementById('upgrade-pro-btn');
const upgradeError      = document.getElementById('upgrade-error');

// ── DOM refs — plan / credits selectors ───────────────────────────────────────
const planSelector         = document.getElementById('plan-selector');
const planSelectorClose    = document.getElementById('plan-selector-close');
const planSelectorError    = document.getElementById('plan-selector-error');
const creditsSelector      = document.getElementById('credits-selector');
const creditsSelectorClose = document.getElementById('credits-selector-close');
const creditsSelectorError = document.getElementById('credits-selector-error');

// ── DOM refs — Caption Generator ──────────────────────────────────────────────
const captionDesc       = document.getElementById('caption-description');
const captionPlatform   = document.getElementById('caption-platform');
const generateBtn       = document.getElementById('generate-caption-btn');
const captionError      = document.getElementById('caption-error');
const captionOutputCard = document.getElementById('caption-output-card');
const captionOutput     = document.getElementById('caption-output');
const captionCopyBtn    = document.getElementById('caption-copy-btn');

// ── DOM refs — Platform Rewriter ──────────────────────────────────────────────
const rewriterContent    = document.getElementById('rewriter-content');
const rewriterPlatform   = document.getElementById('rewriter-platform');
const rewriteBtn         = document.getElementById('rewrite-btn');
const rewriterError      = document.getElementById('rewriter-error');
const rewriterOutputCard = document.getElementById('rewriter-output-card');
const rewriterOutput     = document.getElementById('rewriter-output');
const rewriterCopyBtn    = document.getElementById('rewriter-copy-btn');
const rewriterProGate    = document.getElementById('rewriter-pro-gate');
const rewriterForm       = document.getElementById('rewriter-form');
const rewriterUpgradeBtn = document.getElementById('rewriter-upgrade-btn');

// ── DOM refs — Hashtag Suggester ──────────────────────────────────────────────
const hashtagDesc       = document.getElementById('hashtag-description');
const hashtagPlatform   = document.getElementById('hashtag-platform');
const suggestHashtagsBtn = document.getElementById('suggest-hashtags-btn');
const hashtagError      = document.getElementById('hashtag-error');
const hashtagOutputCard = document.getElementById('hashtag-output-card');
const hashtagOutput     = document.getElementById('hashtag-output');
const hashtagCopyBtn    = document.getElementById('hashtag-copy-btn');

// ── DOM refs — Review Responder ───────────────────────────────────────────────
const reviewContent     = document.getElementById('review-content');
const reviewTone        = document.getElementById('review-tone');
const generateReviewBtn = document.getElementById('generate-review-btn');
const reviewError       = document.getElementById('review-error');
const reviewOutputCard  = document.getElementById('review-output-card');
const reviewOutput      = document.getElementById('review-output');
const reviewCopyBtn     = document.getElementById('review-copy-btn');

// ── DOM refs — Email Tone Fixer ───────────────────────────────────────────────
const emailContent    = document.getElementById('email-content');
const emailTone       = document.getElementById('email-tone');
const fixEmailBtn     = document.getElementById('fix-email-btn');
const emailError      = document.getElementById('email-error');
const emailOutputCard = document.getElementById('email-output-card');
const emailOutput     = document.getElementById('email-output');
const emailCopyBtn    = document.getElementById('email-copy-btn');

// ── DOM refs — Proposal Generator ────────────────────────────────────────────
const proposalJob         = document.getElementById('proposal-job');
const proposalSkills      = document.getElementById('proposal-skills');
const generateProposalBtn = document.getElementById('generate-proposal-btn');
const proposalError       = document.getElementById('proposal-error');
const proposalOutputCard  = document.getElementById('proposal-output-card');
const proposalOutput      = document.getElementById('proposal-output');
const proposalCopyBtn     = document.getElementById('proposal-copy-btn');

// ── DOM refs — Plan gating / upgrade / manage ─────────────────────────────────
const manageSubscriptionBtn  = document.getElementById('manage-subscription-btn');
const upgradeToBundleEl      = document.getElementById('upgrade-to-bundle');
const homeUpgradeBundleBtn   = document.getElementById('home-upgrade-bundle-btn');
const homeBuyCreditsBtn      = document.getElementById('home-buy-credits-btn');
const bvStripSub             = document.getElementById('bv-strip-sub');

// ── DOM refs — Settings back / Reading Panel ──────────────────────────────────
const settingsBackBtn      = document.getElementById('settings-back-btn');
const expandedViewToggle   = document.getElementById('expanded-view-toggle');
const readingPanel         = document.getElementById('reading-panel');
const readingPanelText     = document.getElementById('reading-panel-text');
const readingPanelLabel    = document.getElementById('reading-panel-label');
const readingPanelCopyBtn  = document.getElementById('reading-panel-copy');
const readingPanelCloseBtn = document.getElementById('reading-panel-close');

// ── Init ──────────────────────────────────────────────────────────────────────
chrome.storage.local.get(['jwtToken', 'userEmail', 'userTier', 'themeMode', 'brandVoice', 'expandedViewEnabled'], (result) => {
  isDarkMode = result.themeMode !== 'light';
  applyTheme();

  expandedViewEnabled = result.expandedViewEnabled !== false;
  expandedViewToggle.checked = expandedViewEnabled;

  if (result.brandVoice) {
    brandVoice = result.brandVoice;
    brandVoiceInput.value = brandVoice;
  }

  if (result.jwtToken) {
    jwtToken  = result.jwtToken;
    userEmail = result.userEmail || '';
    userTier  = result.userTier  || 'free';
    renderAccountSection();
    verifyAndInit();
  } else {
    renderAuthSection();
    updateUsageDisplay(null);
  }
});

// Calls /auth/me on every open to catch stale tokens and wiped DB records.
// Only clears auth on definitive rejections (401/404); ignores transient errors.
function verifyAndInit() {
  chrome.runtime.sendMessage({ action: 'verifyAuth', token: jwtToken }, (response) => {
    if (chrome.runtime.lastError) {
      fetchAndUpdateStatus();
      return;
    }

    if (!response.success) {
      const status = response.status || 0;
      if (status === 401 || status === 404) {
        clearStoredAuth();
        openSettings();
      } else {
        fetchAndUpdateStatus();
      }
      return;
    }

    const { user } = response.data;
    if (user) {
      userEmail = user.email;
      userTier  = user.tier;
      chrome.storage.local.set({ userEmail, userTier });
      renderAccountSection();
    }

    fetchAndUpdateStatus();
  });
}

// ── Screen navigation ─────────────────────────────────────────────────────────
function navigateTo(screen) {
  currentScreen = screen;
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const target = document.getElementById(`screen-${screen}`);
  target.classList.add('active');
  target.style.display = 'flex';
}

document.getElementById('card-social').addEventListener('click', () => navigateTo('social'));
document.getElementById('card-business').addEventListener('click', () => navigateTo('business'));
document.getElementById('back-from-social').addEventListener('click', () => navigateTo('home'));
document.getElementById('back-from-business').addEventListener('click', () => navigateTo('home'));

// Brand voice strip on home opens settings
homeBrandVoiceStrip.addEventListener('click', () => openSettings());

// ── Social tab switching (caption · rewriter · hashtag) ───────────────────────
const socialTabBtns  = document.querySelectorAll('#social-tab-nav .tab-btn');
const socialPanelIds = ['panel-caption', 'panel-rewriter', 'panel-hashtag'];

socialTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    socialTabBtns.forEach(b => b.classList.remove('active'));
    socialPanelIds.forEach(id => document.getElementById(id).classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${target}`).classList.add('active');
    if (target === 'rewriter') checkRewriterGate();
  });
});

// ── Business tab switching (review · email · proposal) ────────────────────────
const businessTabBtns  = document.querySelectorAll('#business-tab-nav .tab-btn');
const businessPanelIds = ['panel-review', 'panel-email', 'panel-proposal'];

businessTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    businessTabBtns.forEach(b => b.classList.remove('active'));
    businessPanelIds.forEach(id => document.getElementById(id).classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${target}`).classList.add('active');
  });
});

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme() {
  if (isDarkMode) {
    document.body.classList.remove('light-mode');
    themeToggle.textContent = '\uD83C\uDF19';
    themeToggle.title = 'Switch to light mode';
  } else {
    document.body.classList.add('light-mode');
    themeToggle.textContent = '\u2600\uFE0F';
    themeToggle.title = 'Switch to dark mode';
  }
}

themeToggle.addEventListener('click', () => {
  isDarkMode = !isDarkMode;
  applyTheme();
  chrome.storage.local.set({ themeMode: isDarkMode ? 'dark' : 'light' });
});

// ── Settings panel ────────────────────────────────────────────────────────────
function openSettings() {
  settingsOpen = true;
  settingsPanel.classList.add('active');
  settingsToggle.classList.add('active');
  document.getElementById('content-area').style.display = 'none';
}

function closeSettings() {
  settingsOpen = false;
  settingsPanel.classList.remove('active');
  settingsToggle.classList.remove('active');
  document.getElementById('content-area').style.display = 'flex';
}

settingsToggle.addEventListener('click', () => {
  if (settingsOpen) closeSettings();
  else openSettings();
});

settingsBackBtn.addEventListener('click', closeSettings);

// ── Auth section rendering ────────────────────────────────────────────────────
function renderAuthSection() {
  authSection.style.display    = 'flex';
  accountSection.style.display = 'none';
}

function renderAccountSection() {
  authSection.style.display    = 'none';
  accountSection.style.display = 'flex';
  accountEmailEl.textContent   = userEmail;
  accountTierEl.textContent    = formatTierLabel(userTier) + ' plan';
  setBrandVoiceGated(userTier !== 'bundle');
  const isPaid = ['social_pro', 'business_pro', 'bundle'].includes(userTier);
  manageSubscriptionBtn.style.display = isPaid ? '' : 'none';
  updateCardVisibility(userTier);
  updateUpgradeToBundle(userTier);
  updateHomeBrandVoiceStrip(userTier);
}

// ── Plan-based UI gating helpers ──────────────────────────────────────────────
function updateCardVisibility(tier) {
  const cardSocial   = document.getElementById('card-social');
  const cardBusiness = document.getElementById('card-business');
  if (tier === 'social_pro') {
    cardSocial.style.display   = '';
    cardBusiness.style.display = 'none';
  } else if (tier === 'business_pro') {
    cardSocial.style.display   = 'none';
    cardBusiness.style.display = '';
  } else {
    cardSocial.style.display   = '';
    cardBusiness.style.display = '';
  }
}

function updateUpgradeToBundle(tier) {
  upgradeToBundleEl.style.display =
    (tier === 'social_pro' || tier === 'business_pro') ? '' : 'none';
}

function updateHomeBrandVoiceStrip(tier) {
  const lockEl = homeBrandVoiceStrip.querySelector('.bv-lock');
  if (tier === 'bundle') {
    if (lockEl)    lockEl.textContent    = '🔓'; // 🔓
    if (bvStripSub) bvStripSub.textContent = 'Active — configure in Settings';
  } else {
    if (lockEl)    lockEl.textContent    = '🔒'; // 🔒
    if (bvStripSub) bvStripSub.textContent = 'Bundle plan only — upgrade to unlock';
  }
}

// ── Auth tab toggle ───────────────────────────────────────────────────────────
authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    authMode = tab.dataset.auth;
    authTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    authSubmitBtn.textContent      = authMode === 'login' ? 'Log In' : 'Create Account';
    authPasswordInput.autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
    termsField.style.display       = authMode === 'signup' ? 'block' : 'none';
    termsCheckbox.checked          = false;
    clearAuthStatus();
  });
});

// ── Auth submit ───────────────────────────────────────────────────────────────
authSubmitBtn.addEventListener('click', () => {
  const email    = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (!email || !password) {
    showAuthStatus('Please enter your email and password.', false);
    return;
  }

  if (authMode === 'signup' && !termsCheckbox.checked) {
    showAuthStatus('Please agree to the Terms of Service and Privacy Policy.', false);
    return;
  }

  authSubmitBtn.disabled    = true;
  authSubmitBtn.textContent = authMode === 'login' ? 'Logging in\u2026' : 'Creating account\u2026';
  clearAuthStatus();

  if (authMode === 'signup') {
    chrome.runtime.sendMessage(
      { action: 'authSignup', payload: { email, password, termsAccepted: true } },
      (response) => {
        authSubmitBtn.disabled    = false;
        authSubmitBtn.textContent = 'Create Account';

        if (chrome.runtime.lastError) {
          showAuthStatus(chrome.runtime.lastError.message, false);
          return;
        }

        if (response && response.success) {
          showAuthStatus(
            response.data.message || 'Account created! Check your email to verify.',
            true,
          );
          authSpamNote.style.display = 'block';
        } else {
          showAuthStatus(response?.error || 'Signup failed.', false);
        }
      },
    );
    return;
  }

  // Login flow
  chrome.runtime.sendMessage({ action: 'authLogin', payload: { email, password } }, (response) => {
    authSubmitBtn.disabled    = false;
    authSubmitBtn.textContent = 'Log In';

    if (chrome.runtime.lastError) {
      showAuthStatus(chrome.runtime.lastError.message, false);
      return;
    }

    if (response && response.success) {
      const { token, user } = response.data;
      jwtToken  = token;
      userEmail = user.email;
      userTier  = user.tier;

      chrome.storage.local.set({ jwtToken, userEmail, userTier }, () => {
        renderAccountSection();
        fetchAndUpdateStatus();
        setTimeout(closeSettings, 600);
      });
    } else {
      showAuthStatus(response?.error || 'Authentication failed.', false);
      if (response?.code === 'email_not_verified') {
        resendVerificationField.style.display = 'block';
      }
    }
  });
});

function showAuthStatus(msg, success) {
  authStatus.textContent = msg;
  authStatus.className   = 'save-status ' + (success ? 'success' : (msg ? 'error' : ''));
}

function clearAuthStatus() {
  authStatus.textContent = '';
  authStatus.className   = 'save-status';
  authSpamNote.style.display            = 'none';
  resendVerificationField.style.display = 'none';
}

// ── Resend verification email ─────────────────────────────────────────────────
resendVerificationBtn.addEventListener('click', () => {
  const email = authEmailInput.value.trim();
  if (!email) {
    showAuthStatus('Enter your email address above first.', false);
    return;
  }

  resendVerificationBtn.disabled   = true;
  resendVerificationBtn.textContent = 'Sending…';

  chrome.runtime.sendMessage({ action: 'resendVerification', payload: { email } }, (response) => {
    resendVerificationBtn.disabled    = false;
    resendVerificationBtn.textContent = 'Resend verification email';

    if (chrome.runtime.lastError) {
      showAuthStatus(chrome.runtime.lastError.message, false);
      return;
    }

    if (response && response.success) {
      showAuthStatus('Verification email sent! Check your inbox.', true);
      resendVerificationField.style.display = 'none';
    } else {
      showAuthStatus(response?.error || 'Could not resend email. Please try again.', false);
    }
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────
logoutBtn.addEventListener('click', () => {
  if (jwtToken) {
    chrome.runtime.sendMessage({ action: 'authLogout', token: jwtToken });
  }
  clearStoredAuth();
});

function clearStoredAuth() {
  jwtToken   = '';
  userEmail  = '';
  userTier   = 'free';
  userStatus = null;
  chrome.storage.local.remove(['jwtToken', 'userEmail', 'userTier']);
  authEmailInput.value    = '';
  authPasswordInput.value = '';
  renderAuthSection();
  updateUsageDisplay(null);
  hideUpgradeBanner();
  setRewriterGated(false);
  setBrandVoiceGated(true);
  manageSubscriptionBtn.style.display = 'none';
  updateCardVisibility('free');
  updateUpgradeToBundle('free');
  updateHomeBrandVoiceStrip('free');
}

// ── Brand Voice ───────────────────────────────────────────────────────────────
function setBrandVoiceGated(gated) {
  bvBundleGate.style.display = gated ? 'flex' : 'none';
  bvForm.style.display       = gated ? 'none' : 'block';
}

saveBrandVoiceBtn.addEventListener('click', () => {
  if (userTier !== 'bundle') {
    brandVoiceStatus.textContent = 'Bundle plan required to save Brand Voice.';
    brandVoiceStatus.className   = 'save-status error';
    return;
  }
  const value = brandVoiceInput.value.trim();
  brandVoice  = value;
  chrome.storage.local.set({ brandVoice: value }, () => {
    brandVoiceStatus.textContent = value ? 'Brand voice saved!' : 'Brand voice cleared.';
    brandVoiceStatus.className   = 'save-status success';
    setTimeout(() => {
      brandVoiceStatus.textContent = '';
      brandVoiceStatus.className   = 'save-status';
    }, 2500);
  });
});

// ── Expanded View toggle ──────────────────────────────────────────────────────
expandedViewToggle.addEventListener('change', () => {
  expandedViewEnabled = expandedViewToggle.checked;
  chrome.storage.local.set({ expandedViewEnabled });
  if (!expandedViewEnabled) closeReadingPanel();
});

// ── User status & usage display ───────────────────────────────────────────────
function fetchAndUpdateStatus() {
  chrome.runtime.sendMessage({ action: 'getUserStatus', token: jwtToken }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) return;
    userStatus = response.data;
    if (userStatus.tier && userStatus.tier !== userTier) {
      userTier = userStatus.tier;
      chrome.storage.local.set({ userTier });
      renderAccountSection();
    }
    updateUsageDisplay(userStatus);
    checkRewriterGate();
    updateCardVisibility(userTier);
    updateUpgradeToBundle(userTier);
    updateHomeBrandVoiceStrip(userTier);
    if (isLimitReached()) showUpgradeBanner();
  });
}

function isLimitReached() {
  if (!userStatus) return false;
  if ((userStatus.credits || 0) > 0) return false;
  const used  = userStatus.daily_used  ?? userStatus.dailyUsed  ?? 0;
  const limit = userStatus.daily_limit ?? userStatus.dailyLimit ?? 5;
  return used >= limit;
}

function isRewriterGated() {
  if (!userStatus) return false;
  const tier = userStatus.tier || 'free';
  const days = userStatus.days_since_signup ?? userStatus.daysSinceSignup ?? 1;
  const paid = ['social_pro', 'business_pro', 'bundle'].includes(tier);
  return !paid && days > 5;
}

function updateUsageDisplay(status) {
  if (!status) {
    usageLine1.textContent = 'Not signed in';
    usageLine2.textContent = '';
    usageLine1.className   = 'usage-line-1';
    return;
  }

  const tier      = status.tier || 'free';
  const used      = status.daily_used  ?? status.dailyUsed  ?? 0;
  const limit     = status.daily_limit ?? status.dailyLimit ?? 5;
  const credits   = status.credits || 0;
  const days      = status.days_since_signup ?? status.daysSinceSignup ?? 1;
  const remaining = Math.max(0, limit - used);
  const paid      = ['social_pro', 'business_pro', 'bundle'].includes(tier);

  if (credits > 0) {
    usageLine1.textContent = `${credits} credit${credits !== 1 ? 's' : ''} remaining`;
    usageLine2.textContent = '';
    usageLine1.className   = 'usage-line-1 has-credits';
    return;
  }

  if (paid) {
    usageLine1.textContent = formatTierLabel(tier);
    usageLine2.textContent = 'Unlimited';
    usageLine1.className   = 'usage-line-1 paid';
    return;
  }

  // Free user
  if (days <= 5) {
    usageLine1.textContent = `Day ${days} of 5 free`;
    usageLine2.textContent = `${remaining}/${limit} left today`;
  } else {
    usageLine1.textContent = `${remaining}/1 left today`;
    usageLine2.textContent = 'Free tier';
  }
  usageLine1.className = remaining === 0 ? 'usage-line-1 low' : 'usage-line-1';
}

function formatTierLabel(tier) {
  const labels = {
    free:          'Free',
    social_pro:    'Social Pro',
    business_pro:  'Business Pro',
    bundle:        'Bundle',
  };
  return labels[tier] || tier;
}

// ── Upgrade banner ────────────────────────────────────────────────────────────
function showUpgradeBanner() {
  upgradeBanner.classList.add('visible');
}

function hideUpgradeBanner() {
  upgradeBanner.classList.remove('visible');
  closeAllSelectors();
}

function closeAllSelectors() {
  planSelector.classList.remove('visible');
  creditsSelector.classList.remove('visible');
}

upgradeProBtn.addEventListener('click', () => {
  const isOpen = planSelector.classList.contains('visible');
  closeAllSelectors();
  if (!isOpen) planSelector.classList.add('visible');
});

upgradeCreditsBtn.addEventListener('click', () => {
  const isOpen = creditsSelector.classList.contains('visible');
  closeAllSelectors();
  if (!isOpen) creditsSelector.classList.add('visible');
});

planSelectorClose.addEventListener('click',    () => planSelector.classList.remove('visible'));
creditsSelectorClose.addEventListener('click', () => creditsSelector.classList.remove('visible'));

planSelector.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-product-type]');
  if (!btn) return;
  openCheckout(btn.dataset.productType, btn.dataset.productId, planSelectorError);
});

creditsSelector.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-product-type]');
  if (!btn) return;
  openCheckout(btn.dataset.productType, btn.dataset.productId, creditsSelectorError);
});

function openCheckout(product_type, product_id, errorEl) {
  if (!jwtToken) { openSettings(); return; }

  if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }

  chrome.runtime.sendMessage(
    { action: 'createCheckoutSession', payload: { product_type, product_id }, token: jwtToken },
    (response) => {
      if (chrome.runtime.lastError || !response || !response.success || !response.data?.url) {
        const msg = 'Unable to start checkout. Please try again.';
        if (errorEl) {
          errorEl.textContent = msg;
          errorEl.style.display = 'block';
        }
        return;
      }
      chrome.tabs.create({ url: response.data.url });
    }
  );
}

// ── Rewriter pro gate ─────────────────────────────────────────────────────────
function checkRewriterGate() {
  setRewriterGated(isRewriterGated());
}

function setRewriterGated(gated) {
  rewriterProGate.style.display = gated ? 'flex' : 'none';
  rewriterForm.style.display    = gated ? 'none' : 'flex';
}

rewriterUpgradeBtn.addEventListener('click', () => openCheckout('subscription', 'social_pro', rewriterError));

// ── Issue 3: Manage Subscription ─────────────────────────────────────────────
manageSubscriptionBtn.addEventListener('click', () => {
  if (STRIPE_PORTAL_URL) chrome.tabs.create({ url: STRIPE_PORTAL_URL });
});

// ── Issue 4: Upgrade to Bundle from home screen ───────────────────────────────
homeUpgradeBundleBtn.addEventListener('click', () => {
  openCheckout('subscription', 'bundle', null);
});

homeBuyCreditsBtn.addEventListener('click', () => {
  const isOpen = creditsSelector.classList.contains('visible');
  closeAllSelectors();
  if (!isOpen) creditsSelector.classList.add('visible');
});

// ── Caption Generator ─────────────────────────────────────────────────────────
generateBtn.addEventListener('click', async () => {
  const description = captionDesc.value.trim();
  if (!description) {
    showError(captionError, 'Please describe your content first.');
    return;
  }
  if (!jwtToken) {
    showError(captionError, 'Please log in to generate captions.');
    openSettings();
    return;
  }

  hideError(captionError);
  setLoading(generateBtn, true, '\u2728', 'Generate Caption');

  const result = await callBackend({
    type:       'caption',
    description,
    platform:   captionPlatform.value,
    brandVoice: (userTier === 'bundle' && brandVoice) ? brandVoice : undefined,
  });

  setLoading(generateBtn, false, '\u2728', 'Generate Caption');

  if (result.success) {
    showOutput(captionOutputCard, captionOutput, result.text);
    fetchAndUpdateStatus();
  } else {
    if (result.unauthorized) { clearStoredAuth(); openSettings(); }
    if (result.limitReached) showUpgradeBanner();
    showError(captionError, result.error);
  }
});

// ── Platform Rewriter ─────────────────────────────────────────────────────────
rewriteBtn.addEventListener('click', async () => {
  const content = rewriterContent.value.trim();
  if (!content) {
    showError(rewriterError, 'Please paste some content to rewrite.');
    return;
  }
  if (!jwtToken) {
    showError(rewriterError, 'Please log in to rewrite content.');
    openSettings();
    return;
  }

  hideError(rewriterError);
  setLoading(rewriteBtn, true, '\uD83D\uDD04', 'Rewrite for Platform');

  const result = await callBackend({
    type:       'rewrite',
    content,
    platform:   rewriterPlatform.value,
    brandVoice: (userTier === 'bundle' && brandVoice) ? brandVoice : undefined,
  });

  setLoading(rewriteBtn, false, '\uD83D\uDD04', 'Rewrite for Platform');

  if (result.success) {
    showOutput(rewriterOutputCard, rewriterOutput, result.text);
    fetchAndUpdateStatus();
  } else {
    if (result.unauthorized) { clearStoredAuth(); openSettings(); }
    if (result.limitReached) showUpgradeBanner();
    if (result.featureGated) setRewriterGated(true);
    showError(rewriterError, result.error);
  }
});

// ── Hashtag Suggester ─────────────────────────────────────────────────────────
suggestHashtagsBtn.addEventListener('click', async () => {
  const description = hashtagDesc.value.trim();
  if (!description) {
    showError(hashtagError, 'Please describe your content first.');
    return;
  }
  if (!jwtToken) {
    showError(hashtagError, 'Please log in to suggest hashtags.');
    openSettings();
    return;
  }

  hideError(hashtagError);
  setLoading(suggestHashtagsBtn, true, '#', 'Suggest Hashtags');

  const result = await callBackend({
    type:        'hashtag',
    description,
    platform:    hashtagPlatform.value,
  });

  setLoading(suggestHashtagsBtn, false, '#', 'Suggest Hashtags');

  if (result.success) {
    showOutput(hashtagOutputCard, hashtagOutput, result.text);
    fetchAndUpdateStatus();
  } else {
    if (result.unauthorized) { clearStoredAuth(); openSettings(); }
    if (result.limitReached) showUpgradeBanner();
    showError(hashtagError, result.error);
  }
});

// ── Review Responder ──────────────────────────────────────────────────────────
generateReviewBtn.addEventListener('click', async () => {
  const review = reviewContent.value.trim();
  if (!review) {
    showError(reviewError, 'Please paste a customer review first.');
    return;
  }
  if (!jwtToken) {
    showError(reviewError, 'Please log in to generate a response.');
    openSettings();
    return;
  }

  hideError(reviewError);
  setLoading(generateReviewBtn, true, '\u2B50', 'Generate Response');

  const result = await callBackend({
    type:   'review_response',
    review,
    tone:   reviewTone.value,
  });

  setLoading(generateReviewBtn, false, '\u2B50', 'Generate Response');

  if (result.success) {
    showOutput(reviewOutputCard, reviewOutput, result.text);
    fetchAndUpdateStatus();
  } else {
    if (result.unauthorized) { clearStoredAuth(); openSettings(); }
    if (result.limitReached) showUpgradeBanner();
    showError(reviewError, result.error);
  }
});

// ── Email Tone Fixer ──────────────────────────────────────────────────────────
fixEmailBtn.addEventListener('click', async () => {
  const email = emailContent.value.trim();
  if (!email) {
    showError(emailError, 'Please paste an email first.');
    return;
  }
  if (!jwtToken) {
    showError(emailError, 'Please log in to fix email tone.');
    openSettings();
    return;
  }

  hideError(emailError);
  setLoading(fixEmailBtn, true, '\u2709', 'Fix Tone');

  const result = await callBackend({
    type:  'email_tone',
    email,
    tone:  emailTone.value,
  });

  setLoading(fixEmailBtn, false, '\u2709', 'Fix Tone');

  if (result.success) {
    showOutput(emailOutputCard, emailOutput, result.text);
    fetchAndUpdateStatus();
  } else {
    if (result.unauthorized) { clearStoredAuth(); openSettings(); }
    if (result.limitReached) showUpgradeBanner();
    showError(emailError, result.error);
  }
});

// ── Proposal Generator ────────────────────────────────────────────────────────
generateProposalBtn.addEventListener('click', async () => {
  const jobPosting = proposalJob.value.trim();
  const skills     = proposalSkills.value.trim();
  if (!jobPosting) {
    showError(proposalError, 'Please paste the job description first.');
    return;
  }
  if (!jwtToken) {
    showError(proposalError, 'Please log in to generate a proposal.');
    openSettings();
    return;
  }

  hideError(proposalError);
  setLoading(generateProposalBtn, true, '\uD83D\uDCCB', 'Generate Proposal');

  const result = await callBackend({
    type:       'proposal',
    jobPosting,
    skills:     skills || undefined,
  });

  setLoading(generateProposalBtn, false, '\uD83D\uDCCB', 'Generate Proposal');

  if (result.success) {
    showOutput(proposalOutputCard, proposalOutput, result.text);
    fetchAndUpdateStatus();
  } else {
    if (result.unauthorized) { clearStoredAuth(); openSettings(); }
    if (result.limitReached) showUpgradeBanner();
    showError(proposalError, result.error);
  }
});

// ── Backend call via background service worker ────────────────────────────────
function callBackend(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'callBackend', payload, token: jwtToken },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        if (response && response.success) {
          resolve({ success: true, text: response.data.result });
        } else {
          const isUnauth = /session expired|not logged in/i.test(response?.error || '');
          resolve({
            success:      false,
            error:        response?.error || 'Unknown error occurred.',
            unauthorized: isUnauth,
            limitReached: response?.limitReached || false,
            featureGated: response?.featureGated || false,
          });
        }
      }
    );
  });
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setLoading(btn, loading, icon, label) {
  btn.disabled  = loading;
  btn.innerHTML = loading
    ? '<div class="spinner"></div><span>Generating\u2026</span>'
    : `<span class="btn-icon">${icon}</span><span>${label}</span>`;
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.add('visible');
}

function hideError(el) {
  el.textContent = '';
  el.classList.remove('visible');
}

function showOutput(card, textEl, text) {
  textEl.textContent = text;
  card.classList.add('visible');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Copy buttons ──────────────────────────────────────────────────────────────
function setupCopyBtn(btn, textEl) {
  btn.addEventListener('click', () => {
    const text = textEl.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = '\u2713 Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 2000);
    });
  });
}

setupCopyBtn(captionCopyBtn,  captionOutput);
setupCopyBtn(rewriterCopyBtn, rewriterOutput);
setupCopyBtn(hashtagCopyBtn,  hashtagOutput);
setupCopyBtn(reviewCopyBtn,   reviewOutput);
setupCopyBtn(emailCopyBtn,    emailOutput);
setupCopyBtn(proposalCopyBtn, proposalOutput);

// ── Reading Panel ─────────────────────────────────────────────────────────────
function openReadingPanel(text, label) {
  if (!expandedViewEnabled || !text.trim()) return;
  clearTimeout(readingPanelCloseTimer);
  readingPanelText.textContent = text;
  readingPanelLabel.textContent = label;
  readingPanel.classList.add('open');
}

function closeReadingPanel() {
  readingPanel.classList.remove('open');
}

function scheduleCloseReadingPanel() {
  readingPanelCloseTimer = setTimeout(closeReadingPanel, 150);
}

const OUTPUT_CARDS = [
  { card: captionOutputCard,  textEl: captionOutput,   label: 'Caption' },
  { card: rewriterOutputCard, textEl: rewriterOutput,  label: 'Rewritten Content' },
  { card: hashtagOutputCard,  textEl: hashtagOutput,   label: 'Hashtags' },
  { card: reviewOutputCard,   textEl: reviewOutput,    label: 'Review Response' },
  { card: emailOutputCard,    textEl: emailOutput,     label: 'Rewritten Email' },
  { card: proposalOutputCard, textEl: proposalOutput,  label: 'Proposal' },
];

OUTPUT_CARDS.forEach(({ card, textEl, label }) => {
  card.addEventListener('mouseenter', () => openReadingPanel(textEl.textContent, label));
  card.addEventListener('mouseleave', scheduleCloseReadingPanel);
});

readingPanel.addEventListener('mouseenter', () => clearTimeout(readingPanelCloseTimer));
readingPanel.addEventListener('mouseleave', scheduleCloseReadingPanel);

readingPanelCloseBtn.addEventListener('click', closeReadingPanel);

readingPanelCopyBtn.addEventListener('click', () => {
  const text = readingPanelText.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    readingPanelCopyBtn.textContent = '✓ Copied!';
    readingPanelCopyBtn.classList.add('copied');
    setTimeout(() => {
      readingPanelCopyBtn.textContent = 'Copy';
      readingPanelCopyBtn.classList.remove('copied');
    }, 2000);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && readingPanel.classList.contains('open')) closeReadingPanel();
});
