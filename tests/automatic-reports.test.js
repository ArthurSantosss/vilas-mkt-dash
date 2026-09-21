import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import {
  REPORT_RULES, DEFAULT_REPORT_SETTINGS, reportIsDue, getReportPeriod,
  matchReportAgency, validateReportSettings,
} from '../src/shared/constants/automaticReports.js';
import {
  collectAgencyReports, runAutomaticReports, buildSlackReport, getReportWebhook,
} from '../api/_automatic-reports.js';
import { renderReportPng } from '../api/_report-image.js';
import { buildAutomaticReportSvg } from '../src/shared/utils/automaticReportVisual.js';
import cronHandler from '../api/cron/slack-reports.js';

const monday = new Date('2026-09-21T08:25:00Z');
const friday = new Date('2026-09-25T08:05:00Z');
const env = { META_ACCESS_TOKEN: 'test-token', SLACK_WEBHOOK_ALERTS: 'https://hooks.slack.test/reports' };
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
function networkFixture({ failureId, slackStatus = 200, slackTimeout = false } = {}) {
  const posts = []; const reads = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    if (url.hostname === 'hooks.slack.test') {
      posts.push(JSON.parse(options.body));
      if (slackTimeout) throw new Error('timeout');
      return { ok: slackStatus === 200, status: slackStatus };
    }
    assert.equal(url.hostname, 'graph.facebook.com');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
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

test('regras seguem agências, dia e 05h de Brasília, incluindo atraso dentro da hora', () => {
  assert.equal(reportIsDue(rules.tagb, DEFAULT_REPORT_SETTINGS, monday), true);
  assert.equal(reportIsDue(rules.gdm, DEFAULT_REPORT_SETTINGS, monday), true);
  assert.equal(reportIsDue(rules.vilasmkt, DEFAULT_REPORT_SETTINGS, monday), false);
  assert.equal(reportIsDue(rules.vilasmkt, DEFAULT_REPORT_SETTINGS, friday), true);
  assert.equal(reportIsDue(rules.tagb, DEFAULT_REPORT_SETTINGS, friday), false);
  assert.equal(reportIsDue(rules.gdm, DEFAULT_REPORT_SETTINGS, new Date('2026-09-21T07:59:59Z')), false);
  assert.equal(reportIsDue(rules.gdm, { enabled: { gdm: false } }, monday), false);
});

test('período tem sete dias completos e respeita viradas de mês, ano e fuso', () => {
  assert.deepEqual(getReportPeriod(monday), { since: '2026-09-14', until: '2026-09-20' });
  assert.deepEqual(getReportPeriod(friday), { since: '2026-09-18', until: '2026-09-24' });
  assert.deepEqual(getReportPeriod(new Date('2026-01-01T08:00:00Z')), { since: '2025-12-25', until: '2025-12-31' });
  assert.deepEqual(getReportPeriod(new Date('2026-03-01T01:00:00Z')), { since: '2026-02-21', until: '2026-02-27' });
});

test('normaliza nomes reais sem confundir outras agências e valida configuração', () => {
  for (const name of ['TAG', 'TAGB', 'Agência TAGB']) assert.equal(matchReportAgency(name), 'tagb');
  assert.equal(matchReportAgency('VILAS MKT'), 'vilasmkt');
  assert.equal(matchReportAgency('GDM'), 'gdm');
  assert.equal(matchReportAgency('Outra TAGB'), null);
  assert.throws(() => validateReportSettings({ enabled: { tagb: 'true' } }));
  assert.deepEqual(validateReportSettings(DEFAULT_REPORT_SETTINGS), DEFAULT_REPORT_SETTINGS);
  assert.equal(getReportWebhook('gdm', { ...env, SLACK_WEBHOOK_REPORTS_GDM: 'specific' }), 'specific');
});

test('paginação, filtro de agência e veiculação incluem pausadas e excluem contas sem entrega', async () => {
  const network = networkFixture();
  const result = await collectAgencyReports(rules.tagb, { store: storeFixture(), now: monday, env, fetchImpl: network.fetchImpl });
  assert.equal(result.linkedAccounts, 2);
  assert.equal(result.withoutDelivery, 1);
  assert.deepEqual(result.reports.map(report => report.accountId), ['act_1']);
  assert.equal(result.reports[0].metrics.conversations, 43); // Aliases must not be summed.
  assert.equal(result.reports[0].daily.length, 7);
  assert.equal(result.reports[0].daily[1].messages, 0);
  assert.equal(network.posts.length, 0); // Preview never sends.
  assert.equal(network.reads.some(url => /act_[3456]\/insights/.test(url.pathname)), false);
});

test('GDM reutiliza texto com comparação ao período anterior e aceita impressões sem gasto', async () => {
  const network = networkFixture();
  const result = await collectAgencyReports(rules.gdm, { store: storeFixture(), now: monday, env, fetchImpl: network.fetchImpl });
  assert.equal(result.reports.length, 2);
  assert.match(result.reports[0].text, /Relatório de Desempenho/);
  assert.match(result.reports[0].text, /14\/09\/2026 a 20\/09\/2026/);
  assert.match(result.reports[0].text, /#GDM/);
  assert.equal(network.reads.some(url => url.searchParams.get('time_range') === JSON.stringify({ since: '2026-09-07', until: '2026-09-13' })), true);
});

test('falhas de consulta são informadas sem inventar métricas zeradas', async () => {
  const network = networkFixture({ failureId: 'act_1' });
  const result = await collectAgencyReports(rules.tagb, { store: storeFixture(), now: monday, env, fetchImpl: network.fetchImpl });
  assert.equal(result.reports.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.withoutDelivery, 1);
});

test('cron entrega PNG na TAGB e texto na GDM e não repete conta/período', async () => {
  const store = storeFixture(); const network = networkFixture(); const images = [];
  const options = {
    store, now: monday, env, fetchImpl: network.fetchImpl, pause: async () => {},
    publishImage: async report => { images.push(report); return 'https://images.test/report.png'; },
  };
  const first = await runAutomaticReports(options);
  assert.equal(first.results.reduce((sum, result) => sum + result.sent, 0), 3);
  assert.equal(images.length, 1);
  assert.equal(network.posts[0].blocks[1].type, 'image');
  assert.match(network.posts[1].text, /Relatório de Desempenho/);
  assert.equal(network.posts[1].blocks, undefined);
  const again = await runAutomaticReports(options);
  assert.equal(again.results.reduce((sum, result) => sum + result.skipped, 0), 3);
  assert.equal(network.posts.length, 3);
});

test('invocações concorrentes não entregam relatórios duplicados', async () => {
  const store = storeFixture(); const network = networkFixture();
  const options = { store, now: monday, env, fetchImpl: network.fetchImpl, pause: async () => {}, publishImage: async () => 'https://images.test/report.png' };
  await Promise.all([runAutomaticReports(options), runAutomaticReports(options)]);
  assert.equal(network.posts.length, 3);
});

test('sexta-feira entrega somente VilasMKT e pausa impede todo envio', async () => {
  const store = storeFixture(); const network = networkFixture();
  const options = { store, now: friday, env, fetchImpl: network.fetchImpl, pause: async () => {}, publishImage: async () => 'https://images.test/report.png' };
  const result = await runAutomaticReports(options);
  assert.deepEqual(result.results.map(item => item.agency), ['vilasmkt']);
  assert.equal(network.posts.length, 1);
  await store.set('automatic_slack_reports', { enabled: { tagb: false, gdm: false, vilasmkt: false } });
  assert.deepEqual((await runAutomaticReports(options)).results, []);
  assert.equal(network.posts.length, 1);
});

test('rejeição explícita permite nova tentativa; timeout bloqueia reenvio automático', async () => {
  for (const timeout of [false, true]) {
    const store = storeFixture();
    const network = networkFixture({ slackStatus: 429, slackTimeout: timeout });
    const options = { store, now: friday, env, fetchImpl: network.fetchImpl, pause: async () => {}, publishImage: async () => 'https://images.test/report.png' };
    const first = await runAutomaticReports(options);
    assert.equal(first.results[0].status, 'error');
    const healthy = networkFixture();
    const second = await runAutomaticReports({ ...options, fetchImpl: healthy.fetchImpl });
    assert.equal(healthy.posts.length, timeout ? 0 : 1);
    assert.equal(second.results[0].uncertain, timeout ? 1 : 0);
  }
});

test('falha na imagem não publica texto como substituto do relatório visual', async () => {
  const network = networkFixture();
  const result = await runAutomaticReports({ store: storeFixture(), now: friday, env, fetchImpl: network.fetchImpl, pause: async () => {}, publishImage: async () => { throw new Error('Falha no armazenamento'); } });
  assert.equal(result.results[0].status, 'error');
  assert.equal(network.posts.length, 0);
});

test('segredo cron ausente e autorização inválida não executam envios', async () => {
  let status;
  const res = { setHeader() {}, status(code) { status = code; return this; }, json(value) { return value; } };
  await cronHandler({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, res);
  assert.equal(status, 401);
  await cronHandler({ method: 'POST', headers: {} }, res);
  assert.equal(status, 405);
});

test('relatório visual renderiza PNG com fontes e logos locais e escapa conteúdo', async () => {
  const network = networkFixture();
  const { reports } = await collectAgencyReports(rules.tagb, { store: storeFixture(), now: monday, env, fetchImpl: network.fetchImpl });
  const report = reports[0];
  const png = await renderReportPng(report);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 866);
  assert.ok(png.length > 15000);
  await writeFile('/tmp/vilas-automatic-report-preview.png', png);
  const svg = buildAutomaticReportSvg({ ...report, accountName: '<script>alert(1)</script>' });
  assert.equal(svg.includes('<script>'), false);
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.throws(() => buildSlackReport(rules.tagb, report));
});
