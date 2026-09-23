/* global process */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getConfiguredAuth, isAuthenticatedRequest } from './_auth.js';
import { googleAdsError, describeGoogleAdsError, canRetryGoogleAdsAccess } from './_google-ads-errors.js';

const GOOGLE_ADS_API_VERSION = 'v25';
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

const OAUTH_COOKIE = 'google_ads_oauth';
const CONNECTION_TABLE = 'google_ads_connections';

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor e aplique a migração Google Ads.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function owner() {
  const { authorizedEmail } = getConfiguredAuth();
  if (!authorizedEmail) throw new Error('AUTH_EMAIL não configurado no servidor.');
  return authorizedEmail;
}

async function readConnections() {
  const { data, error } = await getSupabaseClient().from(CONNECTION_TABLE).select('*').eq('owner_email', owner()).order('id');
  if (error) throw new Error('Não foi possível ler as conexões. Confira a migração Google Ads e a chave de serviço do Supabase.');
  return data || [];
}

async function writeConnection(connection, existingOnly = false) {
  const table = getSupabaseClient().from(CONNECTION_TABLE);
  const { error } = await (existingOnly
    ? table.update(connection).eq('owner_email', owner()).eq('id', connection.id)
    : table.upsert(connection, { onConflict: 'owner_email,id' }));
  if (error) throw new Error('Não foi possível salvar a conexão privada do Google Ads.');
}

export function publicSnapshot(connections) {
  const accounts = new Map();
  for (const connection of connections) {
    for (const account of connection.accounts || []) {
      const unavailable = (connection.warnings || []).some(w => !w.rootCustomerId || w.rootCustomerId === (account.loginCustomerId || account.accountId));
      const candidate = { ...account, connectionId: connection.id, userEmail: connection.user_email, unavailable };
      const existing = accounts.get(account.accountId);
      if (!existing || (existing.unavailable && !candidate.unavailable) || (existing.unavailable === candidate.unavailable && existing.loginCustomerId && !candidate.loginCustomerId)) accounts.set(account.accountId, candidate);
    }
  }
  const profiles = connections.map(c => ({ id: c.id, userEmail: c.user_email, connectedAt: c.connected_at, updatedAt: c.updated_at, accountCount: (c.accounts || []).length, warnings: c.warnings || [] }));
  return {
    success: true,
    connection: profiles.length ? { profiles, warnings: profiles.flatMap(c => c.warnings.map(w => ({ ...w, userEmail: c.userEmail }))) } : null,
    accounts: [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  };
}

function getGoogleAdsCredentials() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Configure GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET no servidor.');
  return { clientId, clientSecret };
}

function redirectUri() {
  const value = process.env.GOOGLE_ADS_REDIRECT_URI;
  if (!value) throw new Error('Configure GOOGLE_ADS_REDIRECT_URI no servidor (URL da plataforma + /auth/callback).');
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('GOOGLE_ADS_REDIRECT_URI precisa usar HTTPS em produção.');
  }
  if (url.pathname !== '/auth/callback' || url.search || url.hash) throw new Error('GOOGLE_ADS_REDIRECT_URI deve terminar em /auth/callback, sem parâmetros.');
  return url.href;
}

function setOAuthCookie(res, state, maxAge) {
  res.setHeader('Set-Cookie', `${OAUTH_COOKIE}=${state}; Path=/api/google-ads-proxy; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

async function startOAuth(req, res) {
  const { clientId } = getGoogleAdsCredentials();
  const uri = redirectUri();
  if (req.headers.origin !== new URL(uri).origin) throw new Error('Abra a plataforma no domínio configurado para conectar o Google Ads.');
  const state = `google_ads:${crypto.randomBytes(32).toString('hex')}`;
  const verifier = crypto.randomBytes(48).toString('base64url');
  const db = getSupabaseClient();
  const cleanup = await db.from('google_ads_oauth_states').delete().lt('expires_at', new Date().toISOString());
  if (cleanup.error) throw new Error('Aplique a migração Google Ads no Supabase antes de conectar.');
  const { error } = await db.from('google_ads_oauth_states').insert({ state, owner_email: owner(), verifier, redirect_uri: uri, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
  if (error) throw new Error('Não foi possível iniciar o OAuth. Confira a migração Google Ads.');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: uri, response_type: 'code', scope: `${GOOGLE_ADS_SCOPE} openid email`, access_type: 'offline', prompt: 'consent select_account', state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })) url.searchParams.set(key, value);
  setOAuthCookie(res, state, 600);
  return json(res, 200, { url: url.href });
}

async function consumeOAuthState(req, res, state) {
  const cookie = (req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith(`${OAUTH_COOKIE}=`))?.slice(OAUTH_COOKIE.length + 1);
  if (!state || cookie !== state) throw new Error('Sessão OAuth inválida. Inicie a conexão novamente.');
  const { data, error } = await getSupabaseClient().from('google_ads_oauth_states').delete().eq('state', state).eq('owner_email', owner()).gt('expires_at', new Date().toISOString()).select('*').maybeSingle();
  setOAuthCookie(res, '', 0);
  if (error || !data) throw new Error('Conexão expirada ou já utilizada. Inicie novamente.');
  return data;
}

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function microsToUnit(value) {
  return toNumber(value) / 1_000_000;
}

function formatYmd(date) { return date.toISOString().slice(0, 10); }
function subDays(date, days) { return new Date(date.getTime() - days * 86_400_000); }
function getToday(timeZone, now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
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

export function normalizePeriodToDateFilter(period, timeZone = 'UTC', now = new Date()) {
  if (period && typeof period === 'object') {
    if (period.type !== 'custom' || !validDate(period.startDate) || !validDate(period.endDate) || period.startDate > period.endDate) throw new Error('Período inválido. Informe datas reais em YYYY-MM-DD, em ordem crescente.');
    return `segments.date BETWEEN '${period.startDate}' AND '${period.endDate}'`;
  }

  const today = getToday(timeZone, now);
  const yesterday = subDays(today, 1);

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
      const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return `segments.date BETWEEN '${formatYmd(monthStart)}' AND '${formatYmd(today)}'`;
    }
    case 'last_month': {
      const lastMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const lastMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return `segments.date BETWEEN '${formatYmd(lastMonthStart)}' AND '${formatYmd(lastMonthEnd)}'`;
    }
    default:
      return `segments.date BETWEEN '${formatYmd(subDays(yesterday, 6))}' AND '${formatYmd(yesterday)}'`;
  }
}

async function exchangeCodeForTokens(code, redirectUri, verifier) {
  const { clientId, clientSecret } = getGoogleAdsCredentials();

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Falha ao trocar o code do Google Ads.');
  }

  return payload;
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getGoogleAdsCredentials();

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
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
    if (payload.error === 'invalid_grant') throw new Error('Acesso expirado ou revogado (invalid_grant). Adicione novamente este perfil Google.');
    throw new Error(payload.error_description || payload.error || 'Falha ao renovar token do Google Ads.');
  }

  return payload.access_token;
}

function buildGoogleAdsHeaders(accessToken, loginCustomerId) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
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
    signal: AbortSignal.timeout(20_000),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw googleAdsError(payload, response);
  }

  return payload;
}

export async function googleAdsSearch(customerId, query, accessToken, loginCustomerId) {
  const results = [];
  let pageToken;
  const seen = new Set();
  do {
    const response = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${String(customerId).replace(/-/g, '')}/googleAds:search`, {
      method: 'POST', signal: AbortSignal.timeout(20_000), headers: buildGoogleAdsHeaders(accessToken, loginCustomerId),
      body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
    });
    const payload = await response.json();
    if (!response.ok) throw googleAdsError(payload, response);
    results.push(...(payload.results || []));
    pageToken = payload.nextPageToken;
    if (pageToken && seen.has(pageToken)) throw new Error('Paginação repetida retornada pelo Google Ads.');
    seen.add(pageToken);
  } while (pageToken);
  return { results };
}

async function googleAdsMutate(customerId, resource, operations, accessToken, loginCustomerId) {
  const response = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${String(customerId).replace(/-/g, '')}/${resource}:mutate`, {
    method: 'POST', signal: AbortSignal.timeout(20_000), headers: buildGoogleAdsHeaders(accessToken, loginCustomerId),
    body: JSON.stringify({ operations, partialFailure: false, validateOnly: false }),
  });
  const payload = await response.json();
  if (!response.ok) throw googleAdsError(payload, response);
  return payload;
}

export async function updateCampaignStatus(accessToken, customerId, campaignId, status, loginCustomerId) {
  const normalizedCustomerId = String(customerId).replace(/-/g, '');
  return googleAdsMutate(normalizedCustomerId, 'campaigns', [{
    update: { resourceName: `customers/${normalizedCustomerId}/campaigns/${campaignId}`, status },
    updateMask: 'status',
  }], accessToken, loginCustomerId);
}

export async function updateCampaignBudget(accessToken, customerId, budgetId, amount, loginCustomerId) {
  const normalizedCustomerId = String(customerId).replace(/-/g, '');
  return googleAdsMutate(normalizedCustomerId, 'campaignBudgets', [{
    update: {
      resourceName: `customers/${normalizedCustomerId}/campaignBudgets/${budgetId}`,
      amountMicros: String(Math.round(amount * 1_000_000)),
    },
    updateMask: 'amount_micros',
  }], accessToken, loginCustomerId);
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
        customer_client.currency_code,
        customer_client.time_zone
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
      timeZone: customerClient.timeZone || 'UTC',
      manager: Boolean(customerClient.manager),
      hidden: Boolean(customerClient.hidden),
      level: toNumber(customerClient.level),
      rawStatus: String(customerClient.status || ''),
    }))
    .filter((row) => row.customerId);
}

// customer_client.status continua retornando contas CANCELED/CLOSED/SUSPENDED que o MCC
// enxerga mas ninguém consegue consultar: o Google responde PERMISSION_DENIED nelas.
const SERVABLE_CLIENT_STATUSES = new Set(['', 'ENABLED', 'UNKNOWN', 'UNSPECIFIED']);

function isServableClient(row) {
  return SERVABLE_CLIENT_STATUSES.has(String(row.rawStatus || '').toUpperCase());
}

function upsertLeafAccount(map, account) {
  const existing = map.get(account.accountId);
  const accessRoutes = [...new Set([...(existing?.accessRoutes || []), existing?.loginCustomerId ?? null, account.loginCustomerId ?? null])];
  if (!existing) {
    map.set(account.accountId, { ...account, accessRoutes: [account.loginCustomerId ?? null] });
    return;
  }

  if (existing.loginCustomerId && !account.loginCustomerId) {
    map.set(account.accountId, { ...account, accessRoutes });
  } else {
    map.set(account.accountId, { ...existing, accessRoutes });
  }
}

export async function listReachableAccounts(accessToken) {
  const seedIds = await listAccessibleCustomerIds(accessToken);
  const accountMap = new Map();
  const warnings = [];
  for (const seedId of seedIds) {
    const queue = [seedId];
    const visited = new Set();
    while (queue.length) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      try {
        // customer is available for both direct advertiser accounts and managers.
        const info = await googleAdsSearch(currentId, 'SELECT customer.id, customer.descriptive_name, customer.manager, customer.currency_code, customer.time_zone FROM customer', accessToken, currentId === seedId ? null : seedId);
        const customer = info.results[0]?.customer;
        if (!customer) throw new Error('O Google não retornou os dados da conta.');
        if (!customer.manager) {
          upsertLeafAccount(accountMap, { id: currentId, accountId: currentId, name: customer.descriptiveName || `Conta ${currentId}`, currency: customer.currencyCode, timeZone: customer.timeZone || 'UTC', loginCustomerId: currentId === seedId ? null : seedId, source: currentId === seedId ? 'direct' : 'manager', isManager: false });
          continue;
        }
        const rows = await fetchHierarchyRows(currentId, accessToken, seedId);
        for (const row of rows) {
          if (row.level === 0) continue;
          if (!isServableClient(row)) continue;
          if (row.manager) { queue.push(row.customerId); continue; }
          // Hidden accounts can still be accessible; do not silently drop them.
          upsertLeafAccount(accountMap, { id: row.customerId, accountId: row.customerId, name: row.name, currency: row.currency, timeZone: row.timeZone, loginCustomerId: seedId, source: 'manager', isManager: false });
        }
      } catch (error) {
        warnings.push({ customerId: currentId, rootCustomerId: seedId, ...describeGoogleAdsError(error) });
      }
    }
  }
  return { accounts: [...accountMap.values()], warnings };
}

export async function fetchAccountOverview(accessToken, customerId, period, loginCustomerId, timeZone = 'UTC', campaignIds = []) {
  const dateFilter = normalizePeriodToDateFilter(period, timeZone);
  if (!Array.isArray(campaignIds) || campaignIds.length > 500 || campaignIds.some(id => !/^\d+$/.test(String(id)))) throw httpError(400, 'Filtro de campanhas inválido.');
  const campaignFilter = campaignIds.length ? ` AND campaign.id IN (${campaignIds.join(',')})` : '';
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
          campaign_budget.id,
          campaign_budget.amount_micros,
          campaign_budget.explicitly_shared,
          metrics.cost_micros,
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.average_cpc,
          metrics.average_cpm,
          metrics.conversions,
          metrics.conversions_value
        FROM campaign
        WHERE ${dateFilter}${campaignFilter}
        ORDER BY metrics.cost_micros DESC
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
        WHERE ${dateFilter}${campaignFilter}
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
      budgetId: budget.id ? String(budget.id) : null,
      budgetShared: Boolean(budget.explicitlyShared),
      metrics: {
        spend,
        impressions,
        clicks,
        ctr: toNumber(metrics.ctr) * 100,
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

function mergeDiscovery(previous, discovered) {
  const map = new Map(discovered.accounts.map(a => [a.accountId, a]));
  for (const account of previous || []) {
    if (!map.has(account.accountId) && discovered.warnings.some(w => w.rootCustomerId === (account.loginCustomerId || account.accountId))) map.set(account.accountId, account);
  }
  return [...map.values()];
}

async function handleOAuthExchange(req, res, body) {
  if (typeof body.code !== 'string' || !body.code) throw new Error('O Google não retornou o código de autorização.');
  const flow = await consumeOAuthState(req, res, body.state);
  const tokens = await exchangeCodeForTokens(body.code, flow.redirect_uri, flow.verifier);
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const profile = await response.json();
  if (!response.ok || !profile.sub || !profile.email || !profile.email_verified) throw new Error('Não foi possível confirmar o perfil Google. Autorize o acesso ao e-mail e ao Google Ads.');
  const previous = (await readConnections()).find(c => c.id === profile.sub);
  const refreshToken = tokens.refresh_token || previous?.refresh_token;
  if (!refreshToken) throw new Error('O Google não retornou acesso offline. Revogue o acesso do app na Conta Google e conecte novamente.');
  const now = new Date().toISOString();
  // Persist the grant before discovery: API approval failures must not lose it.
  const connection = { owner_email: owner(), id: profile.sub, user_email: profile.email, refresh_token: refreshToken, connected_at: previous?.connected_at || now, updated_at: now, accounts: previous?.accounts || [], warnings: [] };
  await writeConnection(connection);
  try {
    const discovery = await listReachableAccounts(tokens.access_token);
    connection.accounts = mergeDiscovery(connection.accounts, discovery);
    connection.warnings = discovery.warnings;
  } catch (error) { connection.warnings = [describeGoogleAdsError(error)]; }
  await writeConnection(connection, true);
  return json(res, 200, publicSnapshot(await readConnections()));
}

async function handleListAccounts(_req, res) {
  const connections = await readConnections();
  for (const connection of connections) {
    try {
      const accessToken = await refreshAccessToken(connection.refresh_token);
      const discovery = await listReachableAccounts(accessToken);
      connection.accounts = mergeDiscovery(connection.accounts, discovery);
      connection.warnings = discovery.warnings;
      connection.updated_at = new Date().toISOString();
    } catch (error) { connection.warnings = [describeGoogleAdsError(error)]; }
    await writeConnection(connection, true);
  }
  return json(res, 200, publicSnapshot(await readConnections()));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Every account-scoped action resolves the route on the server: the client never picks the MCC or the token.
async function resolveAccountRoute(body) {
  const customerId = String(body.customerId || '').replace(/-/g, '');
  if (!/^\d{10}$/.test(customerId)) throw httpError(400, 'customerId inválido.');
  const connections = await readConnections();
  const route = publicSnapshot(connections).accounts.find(a => a.accountId === customerId && (!body.connectionId || a.connectionId === body.connectionId));
  if (!route) throw httpError(403, 'Conta não disponível nesta conexão. Sincronize as contas em Configurações.');
  const connection = connections.find(c => c.id === route.connectionId);
  const accessToken = await refreshAccessToken(connection.refresh_token);
  return { customerId, route, accessToken };
}

async function handleGetAccountOverview(_req, res, body) {
  const payload = await readWithAuthorizedRoutes(body, (token, account) => fetchAccountOverview(token, account.accountId, body.period, account.loginCustomerId, account.timeZone, body.campaignIds || []));
  return json(res, 200, { success: true, customerId: body.customerId, ...payload });
}

// Read-only fallback. Mutations intentionally retain their explicit account route.
async function readWithAuthorizedRoutes(body, read) {
  const customerId = String(body.customerId || '').replace(/-/g, '');
  if (!/^\d{10}$/.test(customerId)) throw httpError(400, 'customerId inválido.');
  const connections = await readConnections();
  const preferredId = body.connectionId || publicSnapshot(connections).accounts.find(a => a.accountId === customerId)?.connectionId;
  const candidates = connections.flatMap(connection => (connection.accounts || [])
    .filter(account => account.accountId === customerId)
    .flatMap(account => (account.accessRoutes || [account.loginCustomerId]).map(loginCustomerId => ({ connection, account: { ...account, loginCustomerId } }))));
  candidates.sort((a, b) => Number(b.connection.id === preferredId) - Number(a.connection.id === preferredId));
  if (!candidates.length) throw httpError(403, 'Conta não disponível. Sincronize as contas em Configurações.');
  let lastError;
  const tokens = new Map();
  for (const { connection, account } of candidates) {
    try {
      if (!tokens.has(connection.id)) tokens.set(connection.id, await refreshAccessToken(connection.refresh_token));
      return await read(tokens.get(connection.id), account);
    } catch (error) {
      lastError = error;
      if (!canRetryGoogleAdsAccess(error) && !error.message.includes('invalid_grant')) throw error;
    }
  }
  throw lastError;
}

export async function fetchAccountSpending(accessToken, account) {
  const totals = await Promise.all(['month', '7d'].map(period => googleAdsSearch(account.accountId,
    `SELECT metrics.cost_micros FROM customer WHERE ${normalizePeriodToDateFilter(period, account.timeZone)}`,
    accessToken, account.loginCustomerId)));
  const amount = payload => payload.results.reduce((sum, row) => sum + microsToUnit(row.metrics?.costMicros), 0);
  return { spentThisMonth: amount(totals[0]), avgDailySpend7d: amount(totals[1]) / 7,
    currentBalance: null, creditLimit: null, estimatedDaysRemaining: null, amountDue: null,
    hasReliableBalance: false, balanceSource: 'unavailable', currency: account.currency, timeZone: account.timeZone };
}

async function handleAccountSpending(_req, res, body) {
  const payload = await readWithAuthorizedRoutes(body, fetchAccountSpending);
  return json(res, 200, { success: true, ...payload });
}

async function handleUpdateCampaignStatus(_req, res, body) {
  const status = String(body.status || '').toUpperCase();
  if (status !== 'ENABLED' && status !== 'PAUSED') throw httpError(400, 'Status inválido: use ENABLED ou PAUSED.');
  if (!/^\d+$/.test(String(body.campaignId || ''))) throw httpError(400, 'campaignId inválido.');
  const { customerId, route, accessToken } = await resolveAccountRoute(body);
  await updateCampaignStatus(accessToken, customerId, body.campaignId, status, route.loginCustomerId);
  return json(res, 200, { success: true, customerId, campaignId: String(body.campaignId), status });
}

async function handleUpdateCampaignBudget(_req, res, body) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, 'Informe um orçamento diário maior que zero.');
  if (!/^\d+$/.test(String(body.budgetId || ''))) throw httpError(400, 'budgetId inválido.');
  const { customerId, route, accessToken } = await resolveAccountRoute(body);
  await updateCampaignBudget(accessToken, customerId, body.budgetId, amount, route.loginCustomerId);
  return json(res, 200, { success: true, customerId, budgetId: String(body.budgetId), amount });
}

async function handleDisconnect(_req, res, body) {
  if (typeof body.connectionId !== 'string' || !body.connectionId) return json(res, 400, { error: 'Selecione o perfil a desconectar.' });
  const { error } = await getSupabaseClient().from(CONNECTION_TABLE).delete().eq('owner_email', owner()).eq('id', body.connectionId);
  if (error) throw new Error('Não foi possível desconectar o perfil.');
  return json(res, 200, publicSnapshot(await readConnections()));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  if (!isAuthenticatedRequest(req)) return json(res, 401, { error: 'Sua sessão expirou. Saia da plataforma e entre novamente.' });
  // Reject browser requests from other origins; never trust client-provided redirect URLs.
  try {
    if (req.headers.origin && req.headers.origin !== new URL(redirectUri()).origin) return json(res, 403, { error: 'Origem não autorizada.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    switch (body.action) {
      case 'oauth-start': return await startOAuth(req, res);
      case 'oauth-exchange': return await handleOAuthExchange(req, res, body);
      case 'list-accounts': return await handleListAccounts(req, res);
      case 'status': return json(res, 200, publicSnapshot(await readConnections()));
      case 'get-account-overview': return await handleGetAccountOverview(req, res, body);
      case 'get-account-spending': return await handleAccountSpending(req, res, body);
      case 'update-campaign-status': return await handleUpdateCampaignStatus(req, res, body);
      case 'update-campaign-budget': return await handleUpdateCampaignBudget(req, res, body);
      case 'disconnect': return await handleDisconnect(req, res, body);
      default: return json(res, 400, { error: 'Ação desconhecida.' });
    }
  } catch (error) {
    return json(res, error.status || 400, { error: error.message || 'Erro ao processar Google Ads.', diagnostic: error.diagnostic });
  }
}
