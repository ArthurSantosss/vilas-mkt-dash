/* global process */
import { createReportStore, metaRows, metaRowsWithFallback } from './_automatic-reports.js';
import { readMetaConnections, isRegistryConfigured, collectRegistryAccounts, resolveConnectionForAccount } from './_meta-tokens.js';
import { readConnections, publicSnapshot, readWithAuthorizedRoutes, googleAdsSearch } from './google-ads-proxy.js';
import { calculateMetaBalance } from '../src/shared/utils/metaBalance.js';
import { alertPeriods, normalizeMetaAlertDays } from '../src/shared/utils/automaticAlerts.js';
import { normalizeAutoAlertThresholds } from '../src/shared/constants/autoAlerts.js';
import { buildFatigueInsightsParams, detectCreativeFatigue, getFatigueWindows } from '../src/shared/utils/creativeFatigue.js';

const ACCOUNT_FIELDS = 'id,account_id,name,currency,timezone_name,account_status,balance,spend_cap,amount_spent,is_prepay_account,funding_source_details';
async function mapBatches(items, fn) {
  const values = [];
  for (let i = 0; i < items.length; i += 4) values.push(...await Promise.all(items.slice(i, i + 4).map(fn)));
  return values;
}

export async function collectBriefingData({ store = createReportStore(), now = new Date(), env = process.env, fetchImpl = fetch, clientToken, metaConnections, googleConnections, googleRead = readWithAuthorizedRoutes } = {}) {
  const keys = ['auto_alerts_thresholds', 'account_payment_methods', 'disabled_ad_accounts', 'disabled_google_ads_accounts', 'custom_account_names', 'meta_provider_token', 'google_ads_connection'];
  const values = await Promise.all(keys.map(key => store.get(key)));
  const config = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  const thresholds = normalizeAutoAlertThresholds(config.auto_alerts_thresholds);
  const accountAgencies = await store.agencies();
  const issues = [];
  let registry = metaConnections;
  if (!registry) {
    try { registry = isRegistryConfigured() ? await readMetaConnections() : []; }
    catch { registry = []; issues.push({ platform: 'meta', message: 'Registro de conexões Meta indisponível. Confira Configurações.' }); }
  }
  const tokens = [...new Set([clientToken, ...registry.map(c => c.token), config.meta_provider_token, env.META_ACCESS_TOKEN, env.VITE_META_ACCESS_TOKEN].filter(Boolean))];
  const accountMap = new Map(collectRegistryAccounts(registry).map(account => [account.id, { ...account, live: false }]));
  let successfulMetaLists = 0;
  for (const token of tokens) {
    try {
      const rows = await metaRows('me/adaccounts', { fields: ACCOUNT_FIELDS }, token, fetchImpl);
      successfulMetaLists++;
      for (const row of rows) accountMap.set(row.id, { ...row, live: true });
    } catch { /* Other authorized tokens may cover the same accounts. */ }
  }
  if (tokens.length && !successfulMetaLists) issues.push({ platform: 'meta', message: 'Não foi possível atualizar a lista de contas Meta.' });
  if (!tokens.length) issues.push({ platform: 'meta', message: 'Meta não conectado para consultas automáticas.' });
  const disabledMeta = new Set(Array.isArray(config.disabled_ad_accounts) ? config.disabled_ad_accounts : []);
  const balances = [];
  const metaAccounts = await mapBatches([...accountMap.values()].filter(a => !disabledMeta.has(a.id)), async raw => {
    const timeZone = raw.timezone_name || 'America/Bahia';
    const period = alertPeriods(now, 'meta', thresholds, timeZone);
    const account = { id: raw.id, accountId: raw.account_id, name: config.custom_account_names?.[raw.id] || raw.name || raw.id, platform: 'meta', currency: raw.currency || 'BRL', timeZone, status: raw.live ? (raw.account_status === 1 ? 'active' : 'disabled') : 'unknown', coverage: { since: period.previousSince, until: period.yesterday }, insightsComplete: false, dailyMetrics: [] };
    if (raw.live) balances.push({ accountId: raw.id, ...calculateMetaBalance(raw) });
    else issues.push({ platform: 'meta', accountId: raw.id, message: `Saldo e status indisponíveis: ${account.name}` });
    try {
      const preferred = resolveConnectionForAccount(registry, raw.id)?.token;
      const result = await metaRowsWithFallback(`${raw.id}/insights`, { fields: 'spend,actions,impressions', time_range: JSON.stringify(account.coverage), time_increment: 1 }, [...new Set([preferred, ...tokens].filter(Boolean))], fetchImpl);
      account.dailyMetrics = normalizeMetaAlertDays(result.rows);
      account.insightsComplete = true;
    } catch { issues.push({ platform: 'meta', accountId: raw.id, message: `Desempenho indisponível: ${account.name}` }); }
    // Creative fatigue only for active accounts whose performance was read (avoids a second issue
    // for the same outage); a failed query leaves it null (unknown), never [].
    if (account.status === 'active' && account.insightsComplete) {
      try {
        const preferred = resolveConnectionForAccount(registry, raw.id)?.token;
        const accountTokens = [...new Set([preferred, ...tokens].filter(Boolean))];
        const windows = getFatigueWindows(now, timeZone);
        const [recent, previous] = await Promise.all([windows.recent, windows.previous].map(range =>
          metaRowsWithFallback(`${raw.id}/insights`, buildFatigueInsightsParams(range), accountTokens, fetchImpl)));
        account.creativeFatigue = detectCreativeFatigue(recent.rows, previous.rows);
      } catch { issues.push({ platform: 'meta', accountId: raw.id, message: `Criativos indisponíveis: ${account.name}` }); }
    }
    return account;
  });
  let connections = googleConnections;
  if (!connections) {
    try { connections = env.SUPABASE_SERVICE_ROLE_KEY ? await readConnections() : []; }
    catch { connections = []; issues.push({ platform: 'google', message: 'Conexões Google indisponíveis. Confira Configurações.' }); }
  }
  if (!connections.length && config.google_ads_connection) issues.push({ platform: 'google', message: 'Google conectado no painel, mas indisponível para consultas automáticas.' });
  const disabledGoogle = new Set(Array.isArray(config.disabled_google_ads_accounts) ? config.disabled_google_ads_accounts : []);
  const tokenCache = new Map();
  const googleAccounts = await mapBatches(publicSnapshot(connections).accounts.filter(a => !disabledGoogle.has(a.accountId)), async raw => {
    const period = alertPeriods(now, 'google', thresholds, raw.timeZone || 'America/Bahia');
    const account = { id: raw.accountId, accountId: raw.accountId, name: raw.name, platform: 'google', currency: raw.currency || 'BRL', timeZone: raw.timeZone || 'America/Bahia', coverage: { since: period.previousSince, until: period.yesterday }, dailyMetrics: [], insightsComplete: false };
    try {
      const data = await googleRead({ customerId: raw.accountId }, (token, route) => googleAdsSearch(raw.accountId,
        `SELECT segments.date, metrics.cost_micros, metrics.conversions FROM customer WHERE segments.date BETWEEN '${account.coverage.since}' AND '${account.coverage.until}' ORDER BY segments.date`, token, route.loginCustomerId), { connections, tokens: tokenCache });
      if (!Array.isArray(data.results)) throw new Error('Resposta inválida');
      account.dailyMetrics = data.results.map(row => ({ date: row.segments?.date, spend: Number(row.metrics?.costMicros || 0) / 1e6, results: Number(row.metrics?.conversions || 0), resultLabel: 'conversões' }));
      account.insightsComplete = true;
    } catch { issues.push({ platform: 'google', accountId: raw.accountId, message: `Desempenho indisponível: ${raw.name}` }); }
    return account;
  });
  return { generatedAt: now.toISOString(), accounts: [...metaAccounts, ...googleAccounts], balances, thresholds, accountAgencies, paymentMethodsMap: config.account_payment_methods || {}, issues };
}
