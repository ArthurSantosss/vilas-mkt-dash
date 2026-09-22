export const GOOGLE_ADS_STORAGE_KEYS = {
  ACCOUNTS: 'google_ads_accounts',
  CONNECTION: 'google_ads_connection',
  DISABLED_ACCOUNTS: 'disabled_google_ads_accounts',
  OAUTH_STATE: 'google_ads_oauth_state',
  FLASH_ERROR: 'google_ads_connect_error',
};

export const GOOGLE_ADS_ACCOUNTS_TOGGLED_EVENT = 'google-accounts-toggled';

function dispatchStorageUpdate(key, value) {
  window.dispatchEvent(new CustomEvent('local-storage-map-updated', {
    detail: { key, value },
  }));
  window.dispatchEvent(new Event('google-ads-updated'));
}

function safeParse(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

async function postGoogleAdsProxy(body) {
  const response = await fetch('/api/google-ads-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Falha no Google Ads (${response.status})`);
  }

  return payload;
}

export function loadStoredGoogleAdsAccounts() {
  return safeParse(GOOGLE_ADS_STORAGE_KEYS.ACCOUNTS, []);
}

export function loadStoredGoogleAdsConnection() {
  return safeParse(GOOGLE_ADS_STORAGE_KEYS.CONNECTION, null);
}

export function loadDisabledGoogleAdsAccounts() {
  const stored = safeParse(GOOGLE_ADS_STORAGE_KEYS.DISABLED_ACCOUNTS, []);
  return Array.isArray(stored) ? stored : [];
}

export function isGoogleAdsAccountEnabled(accountId, disabledAccounts = loadDisabledGoogleAdsAccounts()) {
  return !disabledAccounts.includes(String(accountId));
}

export function toggleGoogleAdsAccount(accountId) {
  const id = String(accountId);
  const current = loadDisabledGoogleAdsAccounts();
  const updated = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
  localStorage.setItem(GOOGLE_ADS_STORAGE_KEYS.DISABLED_ACCOUNTS, JSON.stringify(updated));
  dispatchStorageUpdate(GOOGLE_ADS_STORAGE_KEYS.DISABLED_ACCOUNTS, updated);
  window.dispatchEvent(new Event(GOOGLE_ADS_ACCOUNTS_TOGGLED_EVENT));
  return updated;
}

export function formatGoogleCustomerId(customerId) {
  const digits = String(customerId || '').replace(/\D/g, '');
  if (digits.length !== 10) return String(customerId || '');
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export function setGoogleAdsFlashError(message) {
  if (!message) return;
  sessionStorage.setItem(GOOGLE_ADS_STORAGE_KEYS.FLASH_ERROR, message);
}

export function consumeGoogleAdsFlashError() {
  const message = sessionStorage.getItem(GOOGLE_ADS_STORAGE_KEYS.FLASH_ERROR);
  if (message) {
    sessionStorage.removeItem(GOOGLE_ADS_STORAGE_KEYS.FLASH_ERROR);
  }
  return message;
}

export function clearGoogleAdsLocalState() {
  localStorage.removeItem(GOOGLE_ADS_STORAGE_KEYS.ACCOUNTS);
  localStorage.removeItem(GOOGLE_ADS_STORAGE_KEYS.CONNECTION);
  sessionStorage.removeItem(GOOGLE_ADS_STORAGE_KEYS.OAUTH_STATE);
  dispatchStorageUpdate(GOOGLE_ADS_STORAGE_KEYS.ACCOUNTS, []);
  dispatchStorageUpdate(GOOGLE_ADS_STORAGE_KEYS.CONNECTION, null);
}

function saveGoogleAdsConnection(connection) {
  localStorage.setItem(GOOGLE_ADS_STORAGE_KEYS.CONNECTION, JSON.stringify(connection));
  dispatchStorageUpdate(GOOGLE_ADS_STORAGE_KEYS.CONNECTION, connection);
}

function saveGoogleAdsAccounts(accounts) {
  localStorage.setItem(GOOGLE_ADS_STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  dispatchStorageUpdate(GOOGLE_ADS_STORAGE_KEYS.ACCOUNTS, accounts);
}

export async function startGoogleAdsOAuth() {
  const payload = await postGoogleAdsProxy({ action: 'oauth-start' });
  const url = new URL(payload.url);
  sessionStorage.setItem(GOOGLE_ADS_STORAGE_KEYS.OAUTH_STATE, url.searchParams.get('state'));
  window.location.assign(url.href);
}

export function isGoogleAdsOAuthCallback(searchParams) {
  return Boolean(
    searchParams.get('code') &&
    String(searchParams.get('state') || '').startsWith('google_ads:')
  );
}

// React StrictMode can mount the callback twice. Exchange each code once per page.
const callbackRequests = new Map();
export function completeGoogleAdsOAuthCallback(searchParams) {
  const code = searchParams.get('code');
  if (!callbackRequests.has(code)) callbackRequests.set(code, exchangeGoogleAdsCallback(searchParams));
  return callbackRequests.get(code);
}

async function exchangeGoogleAdsCallback(searchParams) {
  const code = searchParams.get('code');
  const returnedState = searchParams.get('state');
  const expectedState = sessionStorage.getItem(GOOGLE_ADS_STORAGE_KEYS.OAUTH_STATE);

  if (!code) {
    throw new Error('O Google não retornou o code do OAuth.');
  }

  if (!returnedState || !expectedState || returnedState !== expectedState) {
    throw new Error('Falha ao validar o state do OAuth do Google Ads.');
  }

  sessionStorage.removeItem(GOOGLE_ADS_STORAGE_KEYS.OAUTH_STATE);

  const payload = await postGoogleAdsProxy({
    action: 'oauth-exchange',
    code,
    state: returnedState,
  });

  applySnapshot(payload);

  return payload;
}

function applySnapshot(payload) {
  if (payload.connection) saveGoogleAdsConnection(payload.connection);
  else {
    localStorage.removeItem(GOOGLE_ADS_STORAGE_KEYS.CONNECTION);
    dispatchStorageUpdate(GOOGLE_ADS_STORAGE_KEYS.CONNECTION, null);
  }
  saveGoogleAdsAccounts(payload.accounts || []);
}

export async function syncGoogleAdsAccounts() {
  const payload = await postGoogleAdsProxy({ action: 'list-accounts' });
  applySnapshot(payload);
  return payload.accounts || [];
}

export async function getGoogleAdsStatus() {
  const payload = await postGoogleAdsProxy({ action: 'status' });
  applySnapshot(payload);
  return payload;
}

export async function disconnectGoogleAds(connectionId) {
  const payload = await postGoogleAdsProxy({ action: 'disconnect', connectionId });
  applySnapshot(payload);
}

export async function fetchGoogleAdsAccountOverview(customerId, period, _loginCustomerId, connectionId) {
  return postGoogleAdsProxy({ action: 'get-account-overview', customerId, period, connectionId });
}

export async function updateGoogleCampaignStatus(customerId, campaignId, status, connectionId) {
  return postGoogleAdsProxy({ action: 'update-campaign-status', customerId, campaignId, status, connectionId });
}

export async function updateGoogleCampaignBudget(customerId, budgetId, amount, connectionId) {
  return postGoogleAdsProxy({ action: 'update-campaign-budget', customerId, budgetId, amount, connectionId });
}
