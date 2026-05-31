const GOOGLE_ADS_CLIENT_ID = import.meta.env.VITE_GOOGLE_ADS_CLIENT_ID;
const GOOGLE_ADS_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

export const GOOGLE_ADS_STORAGE_KEYS = {
  ACCOUNTS: 'google_ads_accounts',
  CONNECTION: 'google_ads_connection',
  OAUTH_STATE: 'google_ads_oauth_state',
  FLASH_ERROR: 'google_ads_connect_error',
};

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

export function isGoogleAdsConfigured() {
  return Boolean(GOOGLE_ADS_CLIENT_ID);
}

export function getGoogleAdsRedirectUri() {
  return `${window.location.origin}/auth/callback`;
}

export function loadStoredGoogleAdsAccounts() {
  return safeParse(GOOGLE_ADS_STORAGE_KEYS.ACCOUNTS, []);
}

export function loadStoredGoogleAdsConnection() {
  return safeParse(GOOGLE_ADS_STORAGE_KEYS.CONNECTION, null);
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
  localStorage.removeItem(GOOGLE_ADS_STORAGE_KEYS.OAUTH_STATE);
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

export function startGoogleAdsOAuth() {
  if (!isGoogleAdsConfigured()) {
    throw new Error('VITE_GOOGLE_ADS_CLIENT_ID não está configurado no frontend.');
  }

  const stateId = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const state = `google_ads:${stateId}`;
  localStorage.setItem(GOOGLE_ADS_STORAGE_KEYS.OAUTH_STATE, state);

  const url = new URL(GOOGLE_ADS_OAUTH_URL);
  url.searchParams.set('client_id', GOOGLE_ADS_CLIENT_ID);
  url.searchParams.set('redirect_uri', getGoogleAdsRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_ADS_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  window.location.assign(url.toString());
}

export function isGoogleAdsOAuthCallback(searchParams) {
  return Boolean(
    searchParams.get('code') &&
    String(searchParams.get('state') || '').startsWith('google_ads:')
  );
}

export async function completeGoogleAdsOAuthCallback(searchParams) {
  const code = searchParams.get('code');
  const returnedState = searchParams.get('state');
  const expectedState = localStorage.getItem(GOOGLE_ADS_STORAGE_KEYS.OAUTH_STATE);

  if (!code) {
    throw new Error('O Google não retornou o code do OAuth.');
  }

  if (!returnedState || !expectedState || returnedState !== expectedState) {
    throw new Error('Falha ao validar o state do OAuth do Google Ads.');
  }

  localStorage.removeItem(GOOGLE_ADS_STORAGE_KEYS.OAUTH_STATE);

  const payload = await postGoogleAdsProxy({
    action: 'oauth-exchange',
    code,
    redirectUri: getGoogleAdsRedirectUri(),
  });

  saveGoogleAdsConnection(payload.connection || {
    connectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  saveGoogleAdsAccounts(payload.accounts || []);

  return payload;
}

export async function syncGoogleAdsAccounts() {
  try {
    const payload = await postGoogleAdsProxy({ action: 'list-accounts' });

    if (payload.connection) {
      saveGoogleAdsConnection(payload.connection);
    }
    saveGoogleAdsAccounts(payload.accounts || []);

    return payload.accounts || [];
  } catch (error) {
    if (String(error.message || '').toLowerCase().includes('não conectado')) {
      clearGoogleAdsLocalState();
    }
    throw error;
  }
}

export async function disconnectGoogleAds() {
  await postGoogleAdsProxy({ action: 'disconnect' });
  clearGoogleAdsLocalState();
}

export async function fetchGoogleAdsAccountOverview(customerId, period, loginCustomerId) {
  return postGoogleAdsProxy({
    action: 'get-account-overview',
    customerId,
    period,
    loginCustomerId: loginCustomerId || null,
  });
}
