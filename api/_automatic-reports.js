/* global process */
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { getSupabase } from './_supabase-server.js';
import { getConfiguredAuth } from './_auth.js';
import {
  collectRegistryAccounts, normalizeAdAccountId, readMetaConnectionsSafe, resolveConnectionForAccount,
} from './_meta-tokens.js';
import {
  AUTOMATIC_REPORTS_KEY, REPORT_PLATFORMS, REPORT_RULES,
  matchReportAgency, reportLocalDate, validateReportPeriod, validateReportSelection,
} from '../src/shared/constants/automaticReports.js';
import { buildReportFromInsights, buildReportText } from '../src/shared/utils/reportText.js';
import { googleTextData } from '../src/shared/utils/googleReports.js';
import {
  fetchAccountOverview, publicSnapshot, readConnections as readGoogleConnections, readWithAuthorizedRoutes,
} from './google-ads-proxy.js';
import { collectInstagramSummary } from './_instagram-data.js';
import { ACCOUNT_INSTAGRAM_KEY } from '../src/shared/utils/accountInstagram.js';

const META_BASE = 'https://graph.facebook.com/v22.0';
const FIELDS = 'spend,impressions,reach,inline_link_clicks,actions,cpm,ctr,frequency';
const dateLabel = date => date.split('-').reverse().join('/');
export const escapeSlack = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function createReportStore(db = getSupabase(), email = getConfiguredAuth().authorizedEmail) {
  const prefixed = key => email ? `${email}_${key}` : key;
  const table = () => db.from('app_preferences');
  return {
    async get(key) {
      const { data, error } = await table().select('value').eq('key', prefixed(key)).maybeSingle();
      if (error) throw new Error('Não foi possível ler a configuração dos relatórios.');
      return data?.value ?? null;
    },
    async set(key, value) {
      const { error } = await table().upsert({ key: prefixed(key), value, updated_at: new Date().toISOString() });
      if (error) throw new Error('Não foi possível salvar a configuração ou o histórico dos relatórios.');
    },
    async claim(key) {
      const value = { status: 'pending', startedAt: new Date().toISOString() };
      const { error } = await table().insert({ key: prefixed(key), value });
      if (!error) return { acquired: true };
      if (error.code !== '23505') throw new Error('Não foi possível reservar o envio do relatório.');
      const previous = await this.get(key);
      if (previous?.status === 'failed') {
        const { data, error: retryError } = await table().update({ value, updated_at: value.startedAt })
          .eq('key', prefixed(key)).eq('value->>status', 'failed').select('key');
        if (retryError) throw new Error('Não foi possível retomar o envio do relatório.');
        if (data?.length) return { acquired: true };
      }
      return { acquired: false, status: previous?.status || 'pending' };
    },
    async agencies() {
      const saved = await this.get('account_agencies');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved;
      const { data, error } = await db.from('account_agencies').select('account_id,agency_name');
      if (error) throw new Error('Não foi possível consultar os vínculos das agências.');
      return Object.fromEntries((data || []).map(row => [row.account_id, row.agency_name]));
    },
  };
}

export function getReportWebhook(ruleId, env = process.env) {
  return env[`SLACK_WEBHOOK_REPORTS_${ruleId.toUpperCase()}`] || '';
}

export async function getReportSetup(store, env = process.env) {
  const [savedToken, connections] = await Promise.all([
    store.get('meta_provider_token'), readMetaConnectionsSafe(),
  ]);
  const token = env.META_ACCESS_TOKEN || env.VITE_META_ACCESS_TOKEN || savedToken;
  return {
    meta: Boolean(token || connections.length),
    slack: Object.fromEntries(REPORT_RULES.map(rule => [rule.id, Boolean(getReportWebhook(rule.id, env))])),
  };
}

export async function metaRows(path, params, token, fetchImpl) {
  const rows = [];
  let after;
  for (let page = 0; page < 100; page++) {
    const url = new URL(`${META_BASE}/${path}`);
    for (const [key, value] of Object.entries({ ...params, limit: 100, ...(after ? { after } : {}) })) {
      url.searchParams.set(key, String(value));
    }
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const metaError = payload?.error || {};
      const code = Number(metaError.code);
      const subcode = Number(metaError.error_subcode);
      const message = String(metaError.message || '');
      const retryableCodes = new Set([3, 10, 102, 190, 200, 803]);
      const retryableSubcodes = new Set([458, 459, 460, 463, 464, 466, 467, 492]);
      const error = new Error(message || `Falha ao consultar dados do Meta Ads (HTTP ${res.status}).`);
      error.status = res.status;
      error.metaCode = code || null;
      error.retryableToken = res.status === 401 || retryableCodes.has(code) || retryableSubcodes.has(subcode)
        || /access token|session|permission|unsupported get request/i.test(message);
      throw error;
    }
    if (payload.error || !Array.isArray(payload.data)) throw new Error('Resposta inválida do Meta Ads.');
    rows.push(...payload.data);
    if (!payload.paging?.next) return rows;
    const next = payload.paging?.cursors?.after;
    if (!next || next === after) throw new Error('Não foi possível carregar todas as páginas do Meta Ads.');
    after = next;
  }
  throw new Error('A consulta excedeu o limite de páginas do Meta Ads.');
}

export async function metaRowsWithFallback(path, params, tokens, fetchImpl) {
  let lastError;
  for (const token of tokens) {
    try {
      return { rows: await metaRows(path, params, token, fetchImpl), token };
    } catch (error) {
      lastError = error;
      if (!error.retryableToken) throw error;
    }
  }
  const error = new Error('Nenhuma conexão Meta válida conseguiu acessar esta conta. Reconecte a conta ou revise os tokens das Business Managers em Configurações.');
  error.cause = lastError;
  throw error;
}

function previousPeriodOf(period) {
  const days = Math.round((Date.parse(`${period.until}T12:00:00Z`) - Date.parse(`${period.since}T12:00:00Z`)) / 86400000) + 1;
  const end = new Date(`${period.since}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { days, previous: { since: start.toISOString().slice(0, 10), until: end.toISOString().slice(0, 10) } };
}

/** Tokens e contas Meta alcançáveis pelo perfil conectado e pelas Business Managers. */
async function metaContext({ store, clientToken, connections: suppliedConnections, fetchImpl, env }) {
  const [savedToken, connections] = await Promise.all([
    store.get('meta_provider_token'),
    suppliedConnections === undefined ? readMetaConnectionsSafe() : suppliedConnections,
  ]);
  const profileTokens = [...new Set([clientToken, savedToken, env.META_ACCESS_TOKEN, env.VITE_META_ACCESS_TOKEN]
    .filter(token => typeof token === 'string' && token.trim()).map(token => token.trim()))];
  const registryTokens = connections.map(connection => connection.token).filter(Boolean);
  if (!profileTokens.length && !registryTokens.length) throw new Error('Conecte sua conta Meta em Configurações para gerar os relatórios.');

  const accountMap = new Map();
  for (const account of collectRegistryAccounts(connections)) {
    const id = normalizeAdAccountId(account.id);
    if (id) accountMap.set(id, { ...account, id });
  }
  for (const candidate of profileTokens) {
    try {
      const accounts = await metaRows('me/adaccounts', { fields: 'id,account_id,name' }, candidate, fetchImpl);
      for (const account of accounts) {
        const id = normalizeAdAccountId(account.id || account.account_id);
        if (id && !accountMap.has(id)) accountMap.set(id, { ...account, id });
      }
    } catch (error) {
      if (!error.retryableToken) throw error;
    }
  }
  if (!accountMap.size) throw new Error('Nenhuma conexão Meta válida encontrou contas de anúncio. Reconecte sua conta ou revise os tokens em Configurações.');
  return { accounts: [...accountMap.values()], profileTokens, registryTokens, connections };
}

const agencyOf = (agencyMap, ...ids) => matchReportAgency(ids.map(id => agencyMap[id]).find(Boolean));

/** Contas Meta e Google vinculadas a cada agência, para o seletor da tela de envio. */
export async function listReportAccounts({
  store, clientToken, metaConnections, googleConnections,
  fetchImpl = fetch, env = process.env,
}) {
  const agencyMap = await store.agencies();
  const result = { meta: [], google: [], errors: [] };
  const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
  try {
    const { accounts } = await metaContext({ store, clientToken, connections: metaConnections, fetchImpl, env });
    result.meta = accounts
      .map(account => ({ id: account.id, name: String(account.name || account.id), agency: agencyOf(agencyMap, account.id, account.account_id) }))
      .filter(account => account.agency).sort(byName);
  } catch (error) {
    result.errors.push({ platform: 'meta', error: error.message });
  }
  try {
    const connections = googleConnections === undefined ? await readGoogleConnections() : googleConnections;
    result.google = publicSnapshot(connections).accounts
      .map(account => ({ id: account.accountId, name: String(account.name || account.accountId), agency: agencyOf(agencyMap, account.accountId, account.id) }))
      .filter(account => account.agency).sort(byName);
  } catch (error) {
    result.errors.push({ platform: 'google', error: error.message });
  }
  return result;
}

async function collectMetaReports(rule, selection, period, deps) {
  const { store, clientToken, connections: suppliedConnections, fetchImpl, env } = deps;
  const { accounts, profileTokens, registryTokens, connections } = await metaContext({
    store, clientToken, connections: suppliedConnections, fetchImpl, env,
  });
  const agencyMap = await store.agencies();
  const wanted = new Set(selection.accountIds);
  const selected = accounts.filter(account => wanted.has(account.id)
    && agencyOf(agencyMap, account.id, account.account_id) === rule.id).sort((a, b) => a.id.localeCompare(b.id));
  const { days, previous: previousPeriod } = previousPeriodOf(period);

  return collectInBatches(selected, account => account.name, async account => {
    const matchedConnection = resolveConnectionForAccount(connections, account.id);
    const accountTokens = [...new Set([matchedConnection?.token, ...profileTokens, ...registryTokens].filter(Boolean))];
    const current = (await metaRowsWithFallback(`${account.id}/insights`, {
      fields: FIELDS, time_range: JSON.stringify(period),
    }, accountTokens, fetchImpl)).rows[0];
    if (!current || !(Number(current.spend) > 0 || Number(current.impressions) > 0)) return null;
    const metrics = buildReportFromInsights(current, account.name, { start: dateLabel(period.since), end: dateLabel(period.until) });
    const rows = (await metaRowsWithFallback(`${account.id}/insights`, {
      fields: 'spend,actions,impressions,inline_link_clicks', time_range: JSON.stringify(period), time_increment: 1,
    }, accountTokens, fetchImpl)).rows;
    const byDate = new Map(rows.map(row => [row.date_start, row]));
    const daily = Array.from({ length: days }, (_, day) => {
      const date = new Date(`${period.since}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + day);
      const key = date.toISOString().slice(0, 10);
      const data = buildReportFromInsights(byDate.get(key) || {}, '', {});
      return { date: key, messages: data.conversations, clicks: data.clicks, engagements: data.engagements, spend: data.spend };
    });
    const choice = selection.choices[account.id];
    let text = '';
    if (choice.format === 'text') {
      const [previous, instagram] = await Promise.all([
        metaRowsWithFallback(`${account.id}/insights`, { fields: FIELDS, time_range: JSON.stringify(previousPeriod) }, accountTokens, fetchImpl),
        deps.instagramFor(account.id, period),
      ]);
      text = buildReportText(metrics, {
        showCampaignName: false, agencyName: rule.label, objective: choice.objective, instagram,
        daily: daily.map(day => ({ date: day.date, value: day[choice.objective] })),
        prev: previous.rows[0] ? buildReportFromInsights(previous.rows[0], account.name, {}) : null,
      });
    }
    return { ...choice, platform: 'meta', accountId: account.id, accountNumber: account.account_id, accountName: String(account.name || account.id).slice(0, 200), metrics, daily, text };
  }, wanted, selected.map(account => account.id));
}

async function collectGoogleReports(rule, selection, period, deps) {
  const { store, googleConnections, readGoogle } = deps;
  const connections = googleConnections === undefined ? await readGoogleConnections() : googleConnections;
  const agencyMap = await store.agencies();
  const wanted = new Set(selection.accountIds);
  const selected = publicSnapshot(connections).accounts.filter(account => wanted.has(account.accountId)
    && agencyOf(agencyMap, account.accountId, account.id) === rule.id).sort((a, b) => a.accountId.localeCompare(b.accountId));
  const tokens = new Map();
  const read = readGoogle || ((customerId, range) => readWithAuthorizedRoutes({ customerId }, (token, account) => fetchAccountOverview(
    token, account.accountId, { type: 'custom', startDate: range.since, endDate: range.until }, account.loginCustomerId, account.timeZone,
  ), { connections, tokens }));
  const { previous: previousPeriod } = previousPeriodOf(period);

  return collectInBatches(selected, account => account.name, async account => {
    const current = await read(account.accountId, period);
    const totals = current?.totals || {};
    if (!(Number(totals.spend) > 0 || Number(totals.impressions) > 0)) return null;
    const currency = account.currency || 'BRL';
    const range = { startDate: period.since, endDate: period.until };
    const choice = selection.choices[account.accountId];
    let text = '';
    if (choice.format === 'text') {
      const [previous, instagram] = await Promise.all([
        read(account.accountId, previousPeriod), deps.instagramFor(account.accountId, period),
      ]);
      const dailyKey = choice.objective === 'clicks' ? 'clicks' : 'conversions';
      text = buildReportText(googleTextData(totals, account.name, range, currency), {
        showCampaignName: false, agencyName: rule.label, objective: choice.objective, instagram,
        daily: (current.dailyMetrics || []).map(day => ({ date: day.date, value: day[dailyKey] || 0 })),
        prev: previous?.totals ? googleTextData(previous.totals, '', { startDate: previousPeriod.since, endDate: previousPeriod.until }, currency) : null,
      });
    }
    return {
      ...choice, platform: 'google', accountId: account.accountId, accountName: String(account.name || account.accountId).slice(0, 200),
      currency, metrics: totals, daily: current.dailyMetrics || [], text,
    };
  }, wanted, selected.map(account => account.accountId));
}

async function collectInBatches(selected, nameOf, build, wanted, foundIds) {
  const reports = [];
  const errors = [];
  for (let i = 0; i < selected.length; i += 4) {
    const batch = await Promise.allSettled(selected.slice(i, i + 4).map(build));
    batch.forEach((result, index) => {
      if (result.status === 'fulfilled') { if (result.value) reports.push(result.value); }
      else errors.push({ accountName: nameOf(selected[i + index]), error: result.reason.message });
    });
  }
  const withoutDelivery = selected.length - reports.length - errors.length;
  // Contas pedidas que não pertencem à agência (ou sumiram da conexão) nunca são consultadas.
  for (const id of wanted) {
    if (!foundIds.includes(id)) errors.push({ accountName: id, error: 'Conta não encontrada ou não vinculada a esta agência.' });
  }
  return { reports, errors, linkedAccounts: selected.length, withoutDelivery };
}

/**
 * Resumo do Instagram vinculado à conta de anúncio (Configurações). Falha do Instagram
 * nunca derruba o relatório: o bloco apenas some do texto.
 */
export function instagramResolver(store, readInstagram = collectInstagramSummary, today) {
  let links;
  return async (accountId, period) => {
    links ??= store.get(ACCOUNT_INSTAGRAM_KEY).catch(() => null);
    const igId = (await links)?.[accountId];
    if (!igId || !/^\d+$/.test(String(igId))) return null;
    const { previous } = previousPeriodOf(period);
    try {
      return await readInstagram(String(igId), {
        current: { start: period.since, end: period.until },
        previous: { start: previous.since, end: previous.until },
      }, today);
    } catch (error) {
      console.warn('[relatorios] Instagram indisponível para', accountId, error.message);
      return null;
    }
  };
}

export async function collectAgencyReports(rule, selectionInput, {
  store, period, clientToken, connections, googleConnections, readGoogle, readInstagram,
  now = new Date(), fetchImpl = fetch, env = process.env,
}) {
  const selectedPeriod = validateReportPeriod(period, now);
  const selection = validateReportSelection(selectionInput);
  const instagramFor = instagramResolver(store, readInstagram, reportLocalDate(now));
  const deps = { store, clientToken, connections, googleConnections, readGoogle, instagramFor, fetchImpl, env };
  const collected = selection.platform === 'meta'
    ? await collectMetaReports(rule, selection, selectedPeriod, deps)
    : await collectGoogleReports(rule, selection, selectedPeriod, deps);
  collected.reports = collected.reports.map(report => ({
    ...report, agency: rule.id, agencyLabel: rule.label, period: selectedPeriod,
  }));
  return { ...collected, period: selectedPeriod, selection };
}

export function reportDeliveryKey(rule, report) {
  const id = `${rule.id}:${report.platform}:${report.accountId}:${report.period.since}:${report.period.until}:${report.format}:${report.objective}:v4`;
  return `${AUTOMATIC_REPORTS_KEY}_delivery_${createHash('sha256').update(id).digest('hex')}`;
}

export function buildSlackReport(rule, report, imageUrl) {
  const platformLabel = REPORT_PLATFORMS[report.platform]?.label || '';
  const title = `${rule.label} • ${platformLabel} • ${report.accountName}`;
  const label = `${dateLabel(report.period.since)} a ${dateLabel(report.period.until)}`;
  if (report.format === 'visual') {
    if (!imageUrl) throw new Error('Imagem do relatório não foi gerada.');
    return {
      text: `Relatório visual ${title} — ${label}`,
      blocks: [
        { type: 'section', text: { type: 'plain_text', text: `${title}\n${label}` } },
        { type: 'image', image_url: imageUrl, alt_text: `Relatório de ${report.accountName}, ${label}. Investimento: R$ ${Number(report.metrics.spend || 0).toFixed(2)}.` },
      ],
    };
  }
  if (!report.text) throw new Error('Texto do relatório não foi gerado.');
  return { text: `${escapeSlack(title)}\n\n${escapeSlack(report.text)}`, mrkdwn: false, unfurl_links: false, unfurl_media: false };
}

export function resolveReportImage(report, imagePaths, db = getSupabase()) {
  const path = imagePaths?.[report.accountId];
  const expectedPrefix = `manual/${report.agency}/${report.accountId}/`;
  if (typeof path !== 'string' || !path.startsWith(expectedPrefix)
    || !/^manual\/[a-z0-9]+\/(act_\d+|\d{10})\/[a-f0-9-]{36}\.png$/.test(path)) {
    throw new Error('Imagem do Relatório Visual ausente ou inválida. Gere a prévia novamente.');
  }
  return db.storage.from('report-images').getPublicUrl(path).data.publicUrl;
}

export async function sendAgencyReports({
  agency, selection, period, clientToken, imagePaths, store = createReportStore(), now = new Date(), env = process.env,
  fetchImpl = fetch, publishImage = resolveReportImage, pause = delay, connections, googleConnections, readGoogle, readInstagram,
} = {}) {
  const rule = REPORT_RULES.find(item => item.id === agency);
  if (!rule) throw new Error('Selecione uma agência válida.');
  const selectedPeriod = validateReportPeriod(period, now);
  const summary = { agency: rule.id, platform: selection?.platform, at: now.toISOString(), sent: 0, skipped: 0, uncertain: 0, errors: [] };
  try {
    const webhook = getReportWebhook(rule.id, env);
    if (!webhook) throw new Error(`Configure o webhook Slack para ${rule.label}.`);
    const collected = await collectAgencyReports(rule, selection, {
      store, period: selectedPeriod, clientToken, now, fetchImpl, env, connections, googleConnections, readGoogle, readInstagram,
    });
    Object.assign(summary, { period: collected.period, linkedAccounts: collected.linkedAccounts, withoutDelivery: collected.withoutDelivery });
    summary.errors.push(...collected.errors);
    for (const report of collected.reports) {
      const key = reportDeliveryKey(rule, report);
      const claim = await store.claim(key);
      if (!claim.acquired) {
        if (claim.status === 'sent') summary.skipped++;
        else summary.uncertain++;
        continue;
      }
      let posting = false;
      let accepted = false;
      try {
        const imageUrl = report.format === 'visual' ? await publishImage(report, imagePaths) : null;
        const payload = buildSlackReport(rule, report, imageUrl);
        // Persist the image before posting so an uncertain delivery can be inspected.
        await store.set(key, { status: 'pending', at: now.toISOString(), accountName: report.accountName, imageUrl });
        await pause(1100);
        posting = true;
        const response = await fetchImpl(webhook, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
          posting = false; // Explicit rejection: safe to retry on a later invocation.
          throw new Error(`Slack recusou o envio (HTTP ${response.status}).`);
        }
        accepted = true;
        await store.set(key, { status: 'sent', at: now.toISOString(), accountName: report.accountName, imageUrl });
        summary.sent++;
      } catch (error) {
        const uncertain = posting || accepted;
        if (uncertain) summary.uncertain++;
        await store.set(key, {
          status: uncertain ? 'uncertain' : 'failed', at: now.toISOString(), accountName: report.accountName,
          error: uncertain ? 'Entrega sem confirmação. Confira o canal antes de reenviar.' : error.message,
        });
        summary.errors.push({ accountName: report.accountName, error: uncertain ? 'Entrega sem confirmação. Confira o canal antes de reenviar.' : error.message });
      }
    }
  } catch (error) {
    summary.errors.push({ error: error.message });
  }
  summary.status = summary.errors.length || summary.uncertain ? 'error' : 'success';
  await store.set(`${AUTOMATIC_REPORTS_KEY}_last_${rule.id}`, summary);
  return summary;
}
