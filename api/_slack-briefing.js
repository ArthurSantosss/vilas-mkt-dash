/* global process */
import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createReportStore } from './_automatic-reports.js';
import { collectBriefingData } from './_briefing-data.js';
import { generateAutomaticAlerts, localAlertDate, shiftAlertDate, aggregateAlertDays } from '../src/shared/utils/automaticAlerts.js';

export function changedAlerts(alerts, previous = {}) {
  return alerts.filter(alert => {
    const before = previous[alert.id];
    if (!before) return true;
    const severity = { info: 0, warning: 1, danger: 2 };
    if (severity[alert.severity] > severity[before.severity]) return true;
    if (alert.type === 'balance_low') return alert.value < before.value * 0.8;
    return alert.value > 0 && alert.value > before.value * 1.2;
  });
}

export function buildBriefingPayload(data, alerts, mode = 'morning', now = new Date()) {
  const date = localAlertDate(now).split('-').reverse().join('/');
  const title = mode === 'morning' ? `☀️ Briefing matinal — ${date}` : `🔔 Novos alertas e agravamentos — ${date}`;
  const section = text => ({ type: 'section', text: { type: 'plain_text', text: text.slice(0, 2900), emoji: true } });
  const valid = data.accounts.filter(a => a.insightsComplete);
  const blocks = [{ type: 'header', text: { type: 'plain_text', text: title } }];
  if (mode === 'morning') {
    const groups = new Map();
    for (const account of valid) {
      const yesterday = shiftAlertDate(localAlertDate(now, account.timeZone || 'America/Bahia'), -1);
      const metrics = aggregateAlertDays(account.dailyMetrics, yesterday, yesterday);
      const label = account.platform === 'google' ? 'conversões' : account.dailyMetrics[0]?.resultLabel || 'resultados';
      const key = `${account.platform}|${account.currency}|${label}`;
      const group = groups.get(key) || { platform: account.platform, currency: account.currency, label, spend: 0, results: 0 };
      group.spend += metrics.spend; group.results += metrics.results;
      groups.set(key, group);
    }
    const lines = [...groups.values()].map(group => `${group.platform === 'google' ? 'Google Ads' : 'Meta Ads'}: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: group.currency || 'BRL' }).format(group.spend)} • ${group.results.toLocaleString('pt-BR')} ${group.label}`);
    blocks.push(section(`Resumo de ontem (dia completo no fuso de cada conta)\n${lines.join('\n') || 'Nenhuma conta com dados confirmados.'}\nConversões recentes podem ser atualizadas posteriormente.`));
  }
  blocks.push(section(`${valid.length}/${data.accounts.length} contas com desempenho consultado. ${alerts.length} prioridade(s).\nAnálise: 7 dias completos contra os 7 anteriores. Google exclui ${data.thresholds.google_lag_days} dias completos recentes.`));
  for (const alert of alerts.slice(0, 12)) {
    blocks.push(section(`${alert.severity === 'danger' ? '🔴' : '🟡'} ${alert.accountName} • ${alert.platform === 'google' ? 'Google' : 'Meta'}${alert.agency ? ` • ${alert.agency}` : ''}\n${alert.message}\n${alert.detail}\nPróximo passo: ${alert.nextAction}`));
  }
  if (alerts.length > 12) blocks.push(section(`Mais ${alerts.length - 12} prioridade(s) disponíveis no painel em Avisos e prioridades.`));
  if (!alerts.length) blocks.push(section(data.issues.length || !valid.length ? 'Nenhum alerta confirmado nos dados disponíveis. A cobertura está incompleta; confira as pendências abaixo.' : 'Nenhum alerta atingiu os critérios configurados.'));
  if (data.issues.length) blocks.push(section(`Dados indisponíveis (${data.issues.length})\n${data.issues.slice(0, 10).map(issue => `• ${issue.message}`).join('\n')}${data.issues.length > 10 ? '\nConsulte o painel para a lista completa.' : ''}`));
  blocks.push({ type: 'context', elements: [{ type: 'plain_text', text: `Vilas MKT • ${mode === 'morning' ? 'Briefing diário programado para 7h' : 'Revisão das 12h'} • America/Bahia • Recomendações para revisão; nenhuma campanha foi alterada.` }] });
  return { text: `${title} — ${alerts.length} prioridade(s); ${valid.length}/${data.accounts.length} contas consultadas.`, blocks, unfurl_links: false, unfurl_media: false };
}

export async function runSlackBriefing({ mode = 'morning', now = new Date(), env = process.env, store = createReportStore(), collect = collectBriefingData, fetchImpl = fetch, dryRun = false } = {}) {
  const webhook = env.SLACK_WEBHOOK_ALERTS || env.VITE_SLACK_WEBHOOK_ALERTS;
  if (!webhook && !dryRun) throw new Error('Configure SLACK_WEBHOOK_ALERTS no servidor.');
  // Hash includes the destination, without storing or exposing the secret URL.
  const destination = createHash('sha256').update(webhook || 'preview').digest('hex').slice(0, 16);
  const key = `briefing_delivery_${destination}_${localAlertDate(now)}_${mode}`;
  const snapshotKey = `briefing_alert_state_${destination}`;
  if (!dryRun) {
    const claim = await store.claim(key);
    if (!claim.acquired) return { status: claim.status === 'sent' ? 'already_sent' : 'needs_review', sent: false };
  }
  let posting = false;
  try {
    const data = await collect({ store, now, env, fetchImpl });
    const alerts = generateAutomaticAlerts({ ...data, now });
    const previous = await store.get(snapshotKey) || {};
    const selected = mode === 'morning' ? alerts : changedAlerts(alerts, previous);
    const payload = buildBriefingPayload(data, selected, mode, now);
    if (dryRun) return { status: 'preview', sent: false, payload, alerts: selected, issues: data.issues };
    const shouldSend = mode === 'morning' || selected.length > 0;
    if (shouldSend) {
      posting = true;
      const response = await fetchImpl(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
      if (!response.ok) {
        // An explicit 4xx rejection is safe to retry. 5xx may be ambiguous.
        posting = response.status >= 500;
        throw new Error(`Slack recusou o envio (HTTP ${response.status}).`);
      }
    }
    const snapshot = data.issues.length ? { ...previous } : {};
    for (const alert of alerts) snapshot[alert.id] = { severity: alert.severity, value: alert.value };
    await store.set(snapshotKey, snapshot);
    await store.set(key, { status: 'sent', at: now.toISOString(), alerts: selected.length, sent: shouldSend });
    await store.set(`briefing_last_${mode}`, { at: now.toISOString(), alerts: selected.length, sent: shouldSend, incomplete: data.issues.length });
    return { status: 'ok', sent: shouldSend, alerts: selected.length, incomplete: data.issues.length };
  } catch (error) {
    if (!dryRun) await store.set(key, { status: posting ? 'uncertain' : 'failed', at: now.toISOString() });
    throw error;
  }
}

export function createBriefingHandler(mode, { run = runSlackBriefing, env = process.env, clock = () => new Date() } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
    const expected = env.CRON_SECRET ? Buffer.from(`Bearer ${env.CRON_SECRET}`) : null;
    const actual = Buffer.from(req.headers?.authorization || '');
    if (!expected || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'Unauthorized' });
    const now = clock();
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bahia', hour: '2-digit', hourCycle: 'h23' }).format(now));
    if (hour !== (mode === 'morning' ? 7 : 12)) return res.status(200).json({ status: 'outside_window' });
    try { return res.status(200).json(await run({ mode, now, env })); }
    catch { return res.status(500).json({ error: 'Falha no briefing. Confira conexões, Slack e histórico de entrega no servidor.' }); }
  };
}
