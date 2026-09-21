/* global process */
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { getSupabase } from './_supabase-server.js';
import { getConfiguredAuth } from './_auth.js';
import {
  AUTOMATIC_REPORTS_KEY, DEFAULT_REPORT_SETTINGS, REPORT_RULES,
  validateReportSettings, matchReportAgency, reportIsDue, getReportPeriod,
} from '../src/shared/constants/automaticReports.js';
import { buildReportFromInsights, buildReportText } from '../src/shared/utils/reportText.js';

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
  return env[`SLACK_WEBHOOK_REPORTS_${ruleId.toUpperCase()}`]
    || env.SLACK_WEBHOOK_REPORTS || env.SLACK_WEBHOOK_ALERTS || env.VITE_SLACK_WEBHOOK_ALERTS || '';
}

export async function getReportSettings(store) {
  return validateReportSettings(await store.get(AUTOMATIC_REPORTS_KEY) || DEFAULT_REPORT_SETTINGS);
}

export async function getReportSetup(store, env = process.env) {
  const token = env.META_ACCESS_TOKEN || env.VITE_META_ACCESS_TOKEN || await store.get('meta_provider_token');
  return {
    meta: Boolean(token), cron: Boolean(env.CRON_SECRET),
    slack: Object.fromEntries(REPORT_RULES.map(rule => [rule.id, Boolean(getReportWebhook(rule.id, env))])),
  };
}

async function metaRows(path, params, token, fetchImpl) {
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
    if (!res.ok) throw new Error(`Falha ao consultar dados do Meta Ads (HTTP ${res.status}).`);
    const payload = await res.json();
    if (payload.error || !Array.isArray(payload.data)) throw new Error('Resposta inválida do Meta Ads.');
    rows.push(...payload.data);
    if (!payload.paging?.next) return rows;
    const next = payload.paging?.cursors?.after;
    if (!next || next === after) throw new Error('Não foi possível carregar todas as páginas do Meta Ads.');
    after = next;
  }
  throw new Error('A consulta excedeu o limite de páginas do Meta Ads.');
}

export async function collectAgencyReports(rule, { store, now = new Date(), fetchImpl = fetch, env = process.env }) {
  const token = env.META_ACCESS_TOKEN || env.VITE_META_ACCESS_TOKEN || await store.get('meta_provider_token');
  if (!token) throw new Error('Configure o token Meta no servidor para gerar os relatórios.');
  const [accounts, agencyMap] = await Promise.all([
    metaRows('me/adaccounts', { fields: 'id,account_id,name' }, token, fetchImpl),
    store.agencies(),
  ]);
  const selected = accounts.filter(account => matchReportAgency(agencyMap[account.id] || agencyMap[account.account_id]) === rule.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const period = getReportPeriod(now);
  const previousDate = new Date(`${period.since}T12:00:00Z`);
  const previousPeriod = getReportPeriod(previousDate);
  const reports = [];
  const errors = [];
  for (let i = 0; i < selected.length; i += 4) {
    const batch = await Promise.allSettled(selected.slice(i, i + 4).map(async account => {
      const current = (await metaRows(`${account.id}/insights`, {
        fields: FIELDS, time_range: JSON.stringify(period),
      }, token, fetchImpl))[0];
      if (!current || !(Number(current.spend) > 0 || Number(current.impressions) > 0)) return null;
      const metrics = buildReportFromInsights(current, account.name, {
        start: dateLabel(period.since), end: dateLabel(period.until),
      });
      let text = '';
      let daily = [];
      if (rule.format === 'text') {
        const previous = (await metaRows(`${account.id}/insights`, {
          fields: FIELDS, time_range: JSON.stringify(previousPeriod),
        }, token, fetchImpl))[0];
        text = buildReportText(metrics, {
          showCampaignName: false, agencyName: rule.label,
          prev: previous ? buildReportFromInsights(previous, account.name, {}) : null,
        });
      } else {
        const rows = await metaRows(`${account.id}/insights`, {
          fields: 'spend,actions,impressions,inline_link_clicks', time_range: JSON.stringify(period), time_increment: 1,
        }, token, fetchImpl);
        const byDate = new Map(rows.map(row => [row.date_start, row]));
        daily = Array.from({ length: 7 }, (_, day) => {
          const date = new Date(`${period.since}T12:00:00Z`);
          date.setUTCDate(date.getUTCDate() + day);
          const key = date.toISOString().slice(0, 10);
          const data = buildReportFromInsights(byDate.get(key) || {}, '', {});
          return { date: key, messages: data.conversations, spend: data.spend };
        });
      }
      return { accountId: account.id, accountName: String(account.name || account.id).slice(0, 200), agency: rule.id, agencyLabel: rule.label, period, metrics, daily, text };
    }));
    batch.forEach((result, index) => {
      if (result.status === 'fulfilled') { if (result.value) reports.push(result.value); }
      else errors.push({ accountName: selected[i + index].name, error: result.reason.message });
    });
  }
  return { reports, errors, period, linkedAccounts: selected.length, withoutDelivery: selected.length - reports.length - errors.length };
}

export function reportDeliveryKey(rule, report) {
  const id = `${rule.id}:${report.accountId}:${report.period.since}:${report.period.until}`;
  return `${AUTOMATIC_REPORTS_KEY}_delivery_${createHash('sha256').update(id).digest('hex')}`;
}

export function buildSlackReport(rule, report, imageUrl) {
  const title = `${rule.label} • ${report.accountName}`;
  const label = `${dateLabel(report.period.since)} a ${dateLabel(report.period.until)}`;
  if (rule.format === 'visual') {
    if (!imageUrl) throw new Error('Imagem do relatório não foi gerada.');
    return {
      text: `Relatório visual ${title} — ${label}`,
      blocks: [
        { type: 'section', text: { type: 'plain_text', text: `${title}\n${label}` } },
        { type: 'image', image_url: imageUrl, alt_text: `Relatório de ${report.accountName}, ${label}. Investimento: R$ ${report.metrics.spend.toFixed(2)}; conversas: ${report.metrics.conversations}.` },
      ],
    };
  }
  return { text: `${escapeSlack(title)}\n\n${escapeSlack(report.text)}`, mrkdwn: false, unfurl_links: false, unfurl_media: false };
}

export async function publishReportImage(report, db = getSupabase()) {
  const { renderReportPng } = await import('./_report-image.js');
  const png = await renderReportPng(report);
  const path = `automatic/${report.agency}/${randomUUID()}.png`;
  const { error } = await db.storage.from('report-images').upload(path, png, { contentType: 'image/png', upsert: false });
  if (error) throw new Error('Não foi possível armazenar a imagem. Verifique o bucket report-images.');
  return db.storage.from('report-images').getPublicUrl(path).data.publicUrl;
}

export async function runAutomaticReports({
  store = createReportStore(), now = new Date(), env = process.env,
  fetchImpl = fetch, publishImage = publishReportImage, pause = delay,
} = {}) {
  const settings = await getReportSettings(store);
  const results = [];
  for (const rule of REPORT_RULES.filter(item => reportIsDue(item, settings, now))) {
    const summary = { agency: rule.id, at: now.toISOString(), sent: 0, skipped: 0, uncertain: 0, errors: [] };
    try {
      const webhook = getReportWebhook(rule.id, env);
      if (!webhook) throw new Error(`Configure o webhook Slack para ${rule.label}.`);
      const collected = await collectAgencyReports(rule, { store, now, fetchImpl, env });
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
          const imageUrl = rule.format === 'visual' ? await publishImage(report) : null;
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
    results.push(summary);
  }
  return { results };
}
