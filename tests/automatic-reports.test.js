import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPORT_RULES, getReportPeriod, validateReportPeriod,
  matchReportAgency,
} from '../src/shared/constants/automaticReports.js';
import {
  collectAgencyReports, sendAgencyReports, buildSlackReport, getReportWebhook, reportDeliveryKey, resolveReportImage,
} from '../api/_automatic-reports.js';
import { toVisualReportData } from '../src/shared/utils/visualReportData.js';

const monday = new Date('2026-09-21T08:25:00Z');
const env = { META_ACCESS_TOKEN: 'test-token', SLACK_WEBHOOK_REPORTS_TAGB: 'https://hooks.slack.test/tagb', SLACK_WEBHOOK_REPORTS_GDM: 'https://hooks.slack.test/gdm', SLACK_WEBHOOK_REPORTS_VILASMKT: 'https://hooks.slack.test/vilasmkt' };
const rules = Object.fromEntries(REPORT_RULES.map(rule => [rule.id, rule]));

function storeFixture() {
  const values = new Map();
  return {
    values,
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
    async claim(key) {
      const previous = values.get(key);
      if (previous && previous.status !== 'failed') return { acquired: false, status: previous.status };
      values.set(key, { status: 'pending' });
      return { acquired: true };
    },
    async agencies() { return { act_1: 'TAGB', act_2: 'TAG', act_3: 'GDM', act_4: 'VILAS MKT', act_5: 'Outra', act_6: 'GDM' }; },
  };
}
function networkFixture({ failureId, slackStatus = 200, slackTimeout = false, validTokens = ['test-token'] } = {}) {
  const posts = []; const reads = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    if (url.hostname === 'hooks.slack.test') {
      posts.push(JSON.parse(options.body));
      if (slackTimeout) throw new Error('timeout');
      return { ok: slackStatus === 200, status: slackStatus };
    }
    assert.equal(url.hostname, 'graph.facebook.com');
    if (!validTokens.includes(options.headers.Authorization.replace(/^Bearer /, ''))) {
      return { ok: false, status: 401 };
    }
    assert.equal(url.searchParams.has('access_token'), false);
    reads.push(url);
    if (url.pathname.endsWith('/me/adaccounts')) {
      // Include pagination and a paused account which still delivered during the period.
      if (!url.searchParams.has('after')) return { ok: true, json: async () => ({
        data: [{ id: 'act_1', account_id: '1', name: 'Clínica Exemplo', account_status: 2 }, { id: 'act_2', account_id: '2', name: 'Sem entrega' }],
        paging: { next: 'yes', cursors: { after: 'page2' } },
      }) };
      return { ok: true, json: async () => ({ data: [
        { id: 'act_3', account_id: '3', name: 'Cliente GDM' },
        { id: 'act_4', account_id: '4', name: 'Cliente Vilas' },
        { id: 'act_5', account_id: '5', name: 'Outra agência' },
        { id: 'act_6', account_id: '6', name: 'Só impressões' },
      ] }) };
    }
    const id = url.pathname.split('/')[2];
    if (id === failureId) return { ok: false, status: 503 };
    const { since } = JSON.parse(url.searchParams.get('time_range'));
    const metric = {
      spend: id === 'act_2' || id === 'act_6' ? '0' : '352.90', impressions: id === 'act_2' ? '0' : '19860',
      reach: '12345', inline_link_clicks: '378', ctr: '1.90', cpm: '17.77', frequency: '1.61',
      actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '43' }, { action_type: 'messaging_conversation_started_7d', value: '43' }, { action_type: 'post_engagement', value: '570' }],
      date_start: since,
    };
    return { ok: true, json: async () => ({ data: [metric] }) };
  };
  return { fetchImpl, posts, reads };
}


const period = { since: '2026-09-14', until: '2026-09-20' };

test('período aceita datas personalizadas completas e rejeita intervalos inválidos', () => {
  assert.deepEqual(getReportPeriod(monday), period);
  assert.deepEqual(validateReportPeriod(period, monday), period);
  assert.deepEqual(validateReportPeriod({ since: '2026-09-01', until: '2026-09-20' }, monday), { since: '2026-09-01', until: '2026-09-20' });
  assert.throws(() => validateReportPeriod({ since: '2026-09-21', until: '2026-09-21' }, monday));
  assert.throws(() => validateReportPeriod({ since: '2026-08-01', until: '2026-09-20' }, monday));
  assert.throws(() => validateReportPeriod({ since: '2026-09-31', until: '2026-09-31' }, monday));
});

test('cada agência exige seu próprio webhook', () => {
  assert.equal(getReportWebhook('gdm', env), env.SLACK_WEBHOOK_REPORTS_GDM);
  assert.equal(getReportWebhook('gdm', { SLACK_WEBHOOK_ALERTS: 'https://hooks.slack.test/alerts' }), '');
  assert.equal(matchReportAgency('Agência TAGB'), 'tagb');
  assert.equal(matchReportAgency('VILAS MKT'), 'vilasmkt');
});

test('usa o token conectado no painel e recupera quando um token expira', async () => {
  const network = networkFixture({ validTokens: ['current-token'] });
  const result = await collectAgencyReports(rules.tagb, {
    store: storeFixture(), period, now: monday,
    clientToken: 'current-token', env: { ...env, META_ACCESS_TOKEN: 'expired-token' }, fetchImpl: network.fetchImpl,
  });
  assert.equal(result.reports.length, 1);

  const fallback = networkFixture();
  const recovered = await collectAgencyReports(rules.gdm, {
    store: storeFixture(), period, now: monday,
    clientToken: 'expired-token', env, fetchImpl: fallback.fetchImpl,
  });
  assert.equal(recovered.reports.length, 2);
  await assert.rejects(collectAgencyReports(rules.tagb, {
    store: storeFixture(), period, now: monday,
    clientToken: 'expired-token', env: { META_ACCESS_TOKEN: 'also-expired' }, fetchImpl: fallback.fetchImpl,
  }), /Reconecte sua conta/);
});

test('prévia filtra agência e veiculação, inclusive conta pausada, sem enviar ao Slack', async () => {
  const network = networkFixture();
  const result = await collectAgencyReports(rules.tagb, { store: storeFixture(), period, now: monday, env, fetchImpl: network.fetchImpl });
  assert.equal(result.linkedAccounts, 2);
  assert.equal(result.withoutDelivery, 1);
  assert.deepEqual(result.reports.map(report => report.accountId), ['act_1']);
  assert.equal(result.reports[0].daily.length, 7);
  assert.equal(network.posts.length, 0);
  assert.equal(network.reads.some(url => /act_[3456]\/insights/.test(url.pathname)), false);
});

test('período de 20 dias gera série diária e comparação anterior do mesmo tamanho', async () => {
  const network = networkFixture();
  const custom = { since: '2026-09-01', until: '2026-09-20' };
  const visual = await collectAgencyReports(rules.tagb, { store: storeFixture(), period: custom, now: monday, env, fetchImpl: network.fetchImpl });
  assert.equal(visual.reports[0].daily.length, 20);
  const textReport = await collectAgencyReports(rules.gdm, { store: storeFixture(), period: custom, now: monday, env, fetchImpl: network.fetchImpl });
  assert.equal(textReport.reports.length, 2);
  assert.match(textReport.reports[0].text, /01\/09\/2026 a 20\/09\/2026/);
  assert.equal(network.reads.some(url => url.searchParams.get('time_range') === JSON.stringify({ since: '2026-08-12', until: '2026-08-31' })), true);
});

test('VilasMKT prepara imagem e texto do mesmo período para cada conta com veiculação', async () => {
  const network = networkFixture();
  const collected = await collectAgencyReports(rules.vilasmkt, { store: storeFixture(), period, now: monday, env, fetchImpl: network.fetchImpl });
  assert.equal(collected.reports.length, 1);
  assert.equal(collected.reports[0].daily.length, 7);
  assert.match(collected.reports[0].text, /Relatório de Desempenho/);
  assert.match(collected.reports[0].text, /14\/09\/2026 a 20\/09\/2026/);
  assert.match(collected.reports[0].text, /#VILASMKT/);
  assert.equal(network.reads.some(url => url.searchParams.get('time_range') === JSON.stringify({ since: '2026-09-07', until: '2026-09-13' })), true);
});

test('VilasMKT envia uma mensagem com imagem e texto completos; TAGB segue apenas com imagem', async () => {
  const network = networkFixture();
  const options = { agency: 'vilasmkt', period, store: storeFixture(), now: monday, env,
    fetchImpl: network.fetchImpl, pause: async () => {}, publishImage: async () => 'https://images.test/report.png' };
  const sent = await sendAgencyReports(options);
  assert.equal(sent.sent, 1);
  assert.equal(network.posts.length, 1);
  assert.equal(network.posts[0].blocks[1].type, 'image');
  assert.equal(network.posts[0].blocks[2].type, 'section');
  assert.match(network.posts[0].blocks[2].text.text, /Relatório de Desempenho/);
  assert.match(network.posts[0].blocks[2].text.text, /#VILASMKT/);
  assert.match(network.posts[0].text, /Relatório de Desempenho/);

  const tagb = await collectAgencyReports(rules.tagb, { store: storeFixture(), period, now: monday, env, fetchImpl: network.fetchImpl });
  assert.equal(tagb.reports[0].text, '');
  assert.equal(buildSlackReport(rules.tagb, tagb.reports[0], 'https://images.test/report.png').blocks.length, 2);
  assert.notEqual(reportDeliveryKey(rules.vilasmkt, { ...tagb.reports[0], agency: 'vilasmkt' }),
    reportDeliveryKey({ ...rules.vilasmkt, includeText: false }, { ...tagb.reports[0], agency: 'vilasmkt' }));
});

test('botão de uma agência envia apenas suas contas com veiculação e evita duplicidade', async () => {
  const store = storeFixture(); const network = networkFixture(); const images = [];
  const options = { agency: 'tagb', period, store, now: monday, env, fetchImpl: network.fetchImpl,
    pause: async () => {}, publishImage: async report => { images.push(report); return 'https://images.test/report.png'; } };
  const first = await sendAgencyReports(options);
  assert.equal(first.sent, 1);
  assert.equal(network.posts.length, 1);
  assert.equal(network.posts[0].blocks[1].type, 'image');
  assert.equal(images.length, 1);
  const second = await sendAgencyReports(options);
  assert.equal(second.skipped, 1);
  assert.equal(network.posts.length, 1);
  const gdm = await sendAgencyReports({ ...options, agency: 'gdm' });
  assert.equal(gdm.sent, 2);
  assert.equal(network.posts.length, 3);
  assert.match(network.posts[1].text, /Relatório de Desempenho/);
});

test('envios concorrentes não duplicam conta e período', async () => {
  const store = storeFixture(); const network = networkFixture();
  const options = { agency: 'gdm', period, store, now: monday, env, fetchImpl: network.fetchImpl, pause: async () => {} };
  await Promise.all([sendAgencyReports(options), sendAgencyReports(options)]);
  assert.equal(network.posts.length, 2);
});

test('falhas de consulta e de imagem não geram envio falso', async () => {
  const network = networkFixture({ failureId: 'act_1' });
  const collected = await collectAgencyReports(rules.tagb, { store: storeFixture(), period, now: monday, env, fetchImpl: network.fetchImpl });
  assert.equal(collected.reports.length, 0);
  assert.equal(collected.errors.length, 1);
  const healthy = networkFixture();
  const result = await sendAgencyReports({ agency: 'tagb', period, store: storeFixture(), now: monday, env, fetchImpl: healthy.fetchImpl,
    pause: async () => {}, publishImage: async () => { throw new Error('Falha no armazenamento'); } });
  assert.equal(result.status, 'error');
  assert.equal(healthy.posts.length, 0);
});

test('rejeição explícita permite tentar de novo; timeout não repete entrega incerta', async () => {
  for (const timeout of [false, true]) {
    const store = storeFixture(); const network = networkFixture({ slackStatus: 429, slackTimeout: timeout });
    const options = { agency: 'vilasmkt', period, store, now: monday, env, fetchImpl: network.fetchImpl,
      pause: async () => {}, publishImage: async () => 'https://images.test/report.png' };
    const first = await sendAgencyReports(options);
    assert.equal(first.status, 'error');
    const healthy = networkFixture();
    const second = await sendAgencyReports({ ...options, fetchImpl: healthy.fetchImpl });
    assert.equal(healthy.posts.length, timeout ? 0 : 1);
    assert.equal(second.uncertain, timeout ? 1 : 0);
  }
});

test('relatório enviado usa o mesmo contrato de dados do ReportCard visual', async () => {
  const network = networkFixture();
  const { reports } = await collectAgencyReports(rules.tagb, { store: storeFixture(), period, now: monday, env, fetchImpl: network.fetchImpl });
  const report = reports[0];
  const visual = toVisualReportData(report);
  assert.equal(visual.leads, report.metrics.conversations);
  assert.equal(visual.spend, report.metrics.spend);
  assert.equal(visual.period.start, '14/09/2026');
  assert.equal(visual.dailyLeads.length, 7);
  assert.equal(visual.dailyClicks[0].clicks, report.daily[0].clicks);
  assert.throws(() => buildSlackReport(rules.tagb, report));
});

test('imagem do ReportCard deve pertencer à agência e conta antes do envio', () => {
  const report = { agency: 'tagb', accountId: 'act_123' };
  const path = 'manual/tagb/act_123/00000000-0000-4000-8000-000000000000.png';
  const db = { storage: { from: () => ({ getPublicUrl: value => ({ data: { publicUrl: `https://images.test/${value}` } }) }) } };
  assert.equal(resolveReportImage(report, { act_123: path }, db), `https://images.test/${path}`);
  assert.throws(() => resolveReportImage(report, { act_123: 'manual/gdm/act_123/00000000-0000-4000-8000-000000000000.png' }, db));
  assert.throws(() => resolveReportImage(report, {}, db));
});
