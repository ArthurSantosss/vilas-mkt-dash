/* global process */

import { createClient } from '@supabase/supabase-js';
import { getConfiguredAuth, isAuthenticatedRequest } from './_auth.js';

const GOOGLE_ADS_API_VERSION = 'v24';
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLE_OAUTH_TOKEN_URL = 'https://www.googleapis.com/oauth2/v3/token';
const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

const SECURE_CONNECTION_KEY_SUFFIX = 'google_ads_secure_connection';
const ACCOUNTS_KEY_SUFFIX = 'google_ads_accounts';

function json(res, status, body) {
  res.status(status).json(body);
}

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL/SUPABASE_ANON_KEY não configurados no servidor.');
  }

  return createClient(supabaseUrl, supabaseKey);
}

function getStorageKey(suffix) {
  const { authorizedEmail } = getConfiguredAuth();
  if (!authorizedEmail) {
    throw new Error('AUTH_EMAIL não configurado no servidor.');
  }
  return `${authorizedEmail}_${suffix}`;
}

async function readPreference(key) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('app_preferences')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) throw new Error(`Erro ao ler app_preferences: ${error.message}`);
  return data?.value ?? null;
}

async function writePreference(key, value) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('app_preferences')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) throw new Error(`Erro ao salvar app_preferences: ${error.message}`);
}

async function deletePreferences(keys) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('app_preferences')
    .delete()
    .in('key', keys);

  if (error) throw new Error(`Erro ao remover app_preferences: ${error.message}`);
}

function getGoogleAdsCredentials() {
  const clientId =
    process.env.GOOGLE_ADS_CLIENT_ID ||
    process.env.VITE_GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!clientId || !clientSecret || !developerToken) {
    throw new Error(
      'GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET e GOOGLE_ADS_DEVELOPER_TOKEN precisam estar configurados.'
    );
  }

  return { clientId, clientSecret, developerToken };
}

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function microsToUnit(value) {
  return toNumber(value) / 1_000_000;
}

function formatYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function getYesterday() {
  const date = getToday();
  date.setDate(date.getDate() - 1);
  return date;
}

function subDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() - days);
  return nextDate;
}

function normalizeCampaignStatus(status) {
  switch (String(status || '').toUpperCase()) {
    case 'ENABLED':
      return 'active';
    case 'PAUSED':
      return 'paused';
    case 'REMOVED':
      return 'removed';
    default:
      return String(status || '').toLowerCase();
  }
}

function normalizePeriodToDateFilter(period) {
  if (period && typeof period === 'object' && period.type === 'custom' && period.startDate && period.endDate) {
    return `segments.date BETWEEN '${period.startDate}' AND '${period.endDate}'`;
  }

  const today = getToday();
  const yesterday = getYesterday();

  switch (period) {
    case 'today':
      return `segments.date BETWEEN '${formatYmd(today)}' AND '${formatYmd(today)}'`;
    case 'yesterday':
      return `segments.date BETWEEN '${formatYmd(yesterday)}' AND '${formatYmd(yesterday)}'`;
    case 'today_yesterday':
      return `segments.date BETWEEN '${formatYmd(yesterday)}' AND '${formatYmd(today)}'`;
    case '7d':
      return `segments.date BETWEEN '${formatYmd(subDays(yesterday, 6))}' AND '${formatYmd(yesterday)}'`;
    case '14d':
      return `segments.date BETWEEN '${formatYmd(subDays(yesterday, 13))}' AND '${formatYmd(yesterday)}'`;
    case '30d':
      return `segments.date BETWEEN '${formatYmd(subDays(yesterday, 29))}' AND '${formatYmd(yesterday)}'`;
    case 'month': {
      const monthStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
      return `segments.date BETWEEN '${formatYmd(monthStart)}' AND '${formatYmd(yesterday)}'`;
    }
    case 'last_month': {
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      return `segments.date BETWEEN '${formatYmd(lastMonthStart)}' AND '${formatYmd(lastMonthEnd)}'`;
    }
    default:
      return `segments.date BETWEEN '${formatYmd(subDays(yesterday, 6))}' AND '${formatYmd(yesterday)}'`;
  }
}

async function exchangeCodeForTokens(code, redirectUri) {
  const { clientId, clientSecret } = getGoogleAdsCredentials();

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Falha ao trocar o code do Google Ads.');
  }

  if (!payload.refresh_token) {
    throw new Error(
      'O Google não retornou refresh_token. Revogue o acesso do app e reconecte com consentimento.'
    );
  }

  return payload;
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getGoogleAdsCredentials();

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Falha ao renovar token do Google Ads.');
  }

  return payload.access_token;
}

function buildGoogleAdsHeaders(accessToken, loginCustomerId) {
  const { developerToken } = getGoogleAdsCredentials();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (loginCustomerId) {
    headers['login-customer-id'] = String(loginCustomerId).replace(/-/g, '');
  }

  return headers;
}

async function googleAdsGet(path, accessToken, loginCustomerId) {
  const response = await fetch(`${GOOGLE_ADS_API_BASE}${path}`, {
    headers: buildGoogleAdsHeaders(accessToken, loginCustomerId),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || `Google Ads API ${response.status}`);
  }

  return payload;
}

async function googleAdsSearch(customerId, query, accessToken, loginCustomerId) {
  const response = await fetch(
    `${GOOGLE_ADS_API_BASE}/customers/${String(customerId).replace(/-/g, '')}/googleAds:search`,
    {
      method: 'POST',
      headers: buildGoogleAdsHeaders(accessToken, loginCustomerId),
      body: JSON.stringify({ query }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || `Google Ads API ${response.status}`);
  }

  return payload;
}

async function listAccessibleCustomerIds(accessToken) {
  const payload = await googleAdsGet('/customers:listAccessibleCustomers', accessToken);
  return (payload.resourceNames || []).map((resourceName) => resourceName.replace('customers/', ''));
}

async function fetchHierarchyRows(customerId, accessToken, loginCustomerId) {
  const payload = await googleAdsSearch(
    customerId,
    `
      SELECT
        customer_client.id,
        customer_client.level,
        customer_client.hidden,
        customer_client.manager,
        customer_client.status,
        customer_client.descriptive_name,
        customer_client.currency_code
      FROM customer_client
      WHERE customer_client.level <= 1
    `,
    accessToken,
    loginCustomerId
  );

  return (payload.results || [])
    .map((row) => row.customerClient)
    .filter(Boolean)
    .map((customerClient) => ({
      customerId: String(customerClient.id || ''),
      name: customerClient.descriptiveName || `Conta ${customerClient.id || ''}`,
      currency: customerClient.currencyCode || 'BRL',
      manager: Boolean(customerClient.manager),
      hidden: Boolean(customerClient.hidden),
      level: toNumber(customerClient.level),
      rawStatus: String(customerClient.status || ''),
    }))
    .filter((row) => row.customerId);
}

function upsertLeafAccount(map, account) {
  const existing = map.get(account.accountId);
  if (!existing) {
    map.set(account.accountId, account);
    return;
  }

  if (existing.loginCustomerId && !account.loginCustomerId) {
    map.set(account.accountId, account);
  }
}

async function listReachableAccounts(accessToken) {
  const seedIds = await listAccessibleCustomerIds(accessToken);
  const accountMap = new Map();

  for (const seedId of seedIds) {
    const rootLoginCustomerId = seedId;
    const queue = [seedId];
    const visitedManagers = new Set();

    while (queue.length > 0) {
      const currentManagerId = queue.shift();
      if (!currentManagerId || visitedManagers.has(currentManagerId)) continue;
      visitedManagers.add(currentManagerId);

      const loginCustomerId = currentManagerId === seedId ? null : rootLoginCustomerId;
      const rows = await fetchHierarchyRows(currentManagerId, accessToken, loginCustomerId);
      if (!rows.length) continue;

      for (const row of rows) {
        if (row.hidden) continue;

        if (row.level === 0) {
          if (!row.manager) {
            upsertLeafAccount(accountMap, {
              id: row.customerId,
              accountId: row.customerId,
              name: row.name,
              currency: row.currency,
              loginCustomerId: null,
              source: 'direct',
              isManager: false,
            });
          }
          continue;
        }

        if (row.manager) {
          queue.push(row.customerId);
          continue;
        }

        upsertLeafAccount(accountMap, {
          id: row.customerId,
          accountId: row.customerId,
          name: row.name,
          currency: row.currency,
          loginCustomerId: rootLoginCustomerId,
          source: rootLoginCustomerId === row.customerId ? 'direct' : 'manager',
          isManager: false,
        });
      }
    }
  }

  return [...accountMap.values()].sort((left, right) =>
    (left.name || left.accountId).localeCompare(right.name || right.accountId, 'pt-BR')
  );
}

async function fetchAccountOverview(accessToken, customerId, period, loginCustomerId) {
  const dateFilter = normalizePeriodToDateFilter(period);
  const normalizedCustomerId = String(customerId).replace(/-/g, '');

  const [campaignPayload, dailyPayload] = await Promise.all([
    googleAdsSearch(
      normalizedCustomerId,
      `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign_budget.amount_micros,
          metrics.cost_micros,
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.average_cpc,
          metrics.average_cpm,
          metrics.conversions,
          metrics.conversions_value
        FROM campaign
        WHERE ${dateFilter}
          AND campaign.status != 'REMOVED'
        ORDER BY metrics.cost_micros DESC
        LIMIT 500
      `,
      accessToken,
      loginCustomerId
    ),
    googleAdsSearch(
      normalizedCustomerId,
      `
        SELECT
          segments.date,
          metrics.cost_micros,
          metrics.impressions,
          metrics.clicks,
          metrics.conversions,
          metrics.conversions_value
        FROM campaign
        WHERE ${dateFilter}
          AND campaign.status != 'REMOVED'
        ORDER BY segments.date
      `,
      accessToken,
      loginCustomerId
    ),
  ]);

  const campaigns = (campaignPayload.results || []).map((row) => {
    const campaign = row.campaign || {};
    const metrics = row.metrics || {};
    const budget = row.campaignBudget || {};
    const spend = microsToUnit(metrics.costMicros);
    const clicks = toNumber(metrics.clicks);
    const impressions = toNumber(metrics.impressions);
    const conversions = toNumber(metrics.conversions);

    return {
      id: String(campaign.id || ''),
      accountId: normalizedCustomerId,
      name: campaign.name || `Campanha ${campaign.id || ''}`,
      status: normalizeCampaignStatus(campaign.status),
      channelType: campaign.advertisingChannelType || null,
      dailyBudget: microsToUnit(budget.amountMicros),
      metrics: {
        spend,
        impressions,
        clicks,
        ctr: toNumber(metrics.ctr),
        cpc: microsToUnit(metrics.averageCpc),
        cpm: microsToUnit(metrics.averageCpm),
        conversions,
        conversionsValue: toNumber(metrics.conversionsValue),
        costPerConversion: conversions > 0 ? spend / conversions : 0,
      },
    };
  });

  const totals = campaigns.reduce((acc, campaign) => {
    acc.spend += campaign.metrics.spend;
    acc.impressions += campaign.metrics.impressions;
    acc.clicks += campaign.metrics.clicks;
    acc.conversions += campaign.metrics.conversions;
    acc.conversionsValue += campaign.metrics.conversionsValue;
    return acc;
  }, {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    conversionsValue: 0,
  });

  totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
  totals.costPerConversion = totals.conversions > 0 ? totals.spend / totals.conversions : 0;

  const dailyMap = new Map();
  for (const row of dailyPayload.results || []) {
    const date = row.segments?.date;
    if (!date) continue;

    const spend = microsToUnit(row.metrics?.costMicros);
    const impressions = toNumber(row.metrics?.impressions);
    const clicks = toNumber(row.metrics?.clicks);
    const conversions = toNumber(row.metrics?.conversions);
    const conversionsValue = toNumber(row.metrics?.conversionsValue);

    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        date,
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversionsValue: 0,
      });
    }

    const current = dailyMap.get(date);
    current.spend += spend;
    current.impressions += impressions;
    current.clicks += clicks;
    current.conversions += conversions;
    current.conversionsValue += conversionsValue;
  }

  const dailyMetrics = [...dailyMap.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day) => ({
      ...day,
      ctr: day.impressions > 0 ? (day.clicks / day.impressions) * 100 : 0,
      cpc: day.clicks > 0 ? day.spend / day.clicks : 0,
      cpm: day.impressions > 0 ? (day.spend / day.impressions) * 1000 : 0,
      costPerConversion: day.conversions > 0 ? day.spend / day.conversions : 0,
    }));

  return { campaigns, totals, dailyMetrics };
}

async function loadStoredConnection() {
  return readPreference(getStorageKey(SECURE_CONNECTION_KEY_SUFFIX));
}

async function loadStoredRefreshToken() {
  const connection = await loadStoredConnection();
  const refreshToken = connection?.refreshToken;
  if (!refreshToken) {
    throw new Error('Google Ads não conectado. Conecte a conta em Configurações.');
  }
  return refreshToken;
}

async function saveConnection(refreshToken) {
  const nextConnection = {
    refreshToken,
    scope: GOOGLE_ADS_SCOPE,
    connectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writePreference(getStorageKey(SECURE_CONNECTION_KEY_SUFFIX), nextConnection);
  return nextConnection;
}

async function saveAccounts(accounts) {
  await writePreference(getStorageKey(ACCOUNTS_KEY_SUFFIX), accounts);
}

async function handleOAuthExchange(req, res, body) {
  const { code, redirectUri } = body;
  if (!code || !redirectUri) {
    return json(res, 400, { error: 'code e redirectUri são obrigatórios.' });
  }

  try {
    const tokenPayload = await exchangeCodeForTokens(code, redirectUri);
    const accessToken = tokenPayload.access_token;
    const connection = await saveConnection(tokenPayload.refresh_token);
    const accounts = await listReachableAccounts(accessToken);
    await saveAccounts(accounts);

    return json(res, 200, {
      success: true,
      connection: { ...connection, refreshToken: undefined },
      accounts,
    });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
}

async function handleListAccounts(_req, res) {
  try {
    const refreshToken = await loadStoredRefreshToken();
    const accessToken = await refreshAccessToken(refreshToken);
    const accounts = await listReachableAccounts(accessToken);
    const connection = await loadStoredConnection();

    await saveAccounts(accounts);

    return json(res, 200, {
      success: true,
      accounts,
      connection: connection
        ? { ...connection, refreshToken: undefined, updatedAt: new Date().toISOString() }
        : null,
    });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
}

async function handleGetAccountOverview(_req, res, body) {
  const { customerId, period, loginCustomerId } = body;
  if (!customerId) {
    return json(res, 400, { error: 'customerId é obrigatório.' });
  }

  try {
    const refreshToken = await loadStoredRefreshToken();
    const accessToken = await refreshAccessToken(refreshToken);
    const payload = await fetchAccountOverview(accessToken, customerId, period, loginCustomerId || null);

    return json(res, 200, {
      success: true,
      customerId: String(customerId).replace(/-/g, ''),
      ...payload,
    });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
}

async function handleDisconnect(_req, res) {
  try {
    await deletePreferences([
      getStorageKey(SECURE_CONNECTION_KEY_SUFFIX),
      getStorageKey(ACCOUNTS_KEY_SUFFIX),
    ]);

    return json(res, 200, { success: true });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  if (!isAuthenticatedRequest(req)) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const action = body.action;

    switch (action) {
      case 'oauth-exchange':
        return handleOAuthExchange(req, res, body);
      case 'list-accounts':
        return handleListAccounts(req, res);
      case 'get-account-overview':
        return handleGetAccountOverview(req, res, body);
      case 'disconnect':
        return handleDisconnect(req, res);
      default:
        return json(res, 400, { error: `Ação desconhecida: ${action}` });
    }
  } catch (error) {
    console.error('[google-ads-proxy] Erro:', error);
    return json(res, 500, { error: error.message || 'Erro interno ao processar Google Ads.' });
  }
}
