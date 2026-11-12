import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPORT_RULES, getReportPeriod, validateReportPeriod, validateReportSelection,
  matchReportAgency,
} from '../src/shared/constants/automaticReports.js';
import {
  collectAgencyReports, sendAgencyReports, buildSlackReport, getReportWebhook, reportDeliveryKey, resolveReportImage,
  listReportAccounts,
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
    async agencies() { return { act_1: 'TAGB', act_2: 'TAG', act_3: 'GDM', act_4: 'VILAS MKT', act_5: 'Outra', act_6: 'GDM', '1111111111': 'GDM', '2222222222': 'TAGB' }; },
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
      return { ok: false, status: 401, json: async () => ({ error: { code: 190, message: 'Invalid OAuth access token.' } }) };
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
const meta = (format, accountIds, objective = 'messages') => ({ platform: 'meta', accounts: accountIds.map(id => ({ id, objective, format })) });
const googleSel = (format, accountIds, objective) => ({ platform: 'google', accounts: accountIds.map(id => ({ id, objective, format })) });
const TAGB_META = ['act_1', 'act_2'];
const GDM_META = ['act_3', 'act_6'];

const googleConnections = [{ id: 'g1', user_email: 'ads@test', accounts: [
  { accountId: '1111111111', name: 'Cliente Google GDM', currency: 'BRL', timeZone: 'America/Sao_Paulo' },
  { accountId: '2222222222', name: 'Cliente Google TAGB', currency: 'BRL', timeZone: 'America/Sao_Paulo' },
] }];
function googleReader() {
  const calls = [];
  const readGoogle = async (customerId, range) => {
    calls.push({ customerId, range });
    return {
      totals: { spend: 200, impressions: 4000, clicks: 160, conversions: 8, conversionsValue: 0 },
      dailyMetrics: [{ date: range.since, spend: 200, impressions: 4000, clicks: 160, conversions: 8 }],
    };
  };
  return { calls, readGoogle };
}

test('período aceita datas personalizadas completas e rejeita intervalos inválidos', () => {
  assert.deepEqual(getReportPeriod(monday), period);
  assert.deepEqual(validateReportPeriod(period, monday), period);
  assert.deepEqual(validateReportPeriod({ since: '2026-09-01', until: '2026-09-20' }, monday), { since: '2026-09-01', until: '2026-09-20' });
  assert.throws(() => validateReportPeriod({ since: '2026-09-21', until: '2026-09-21' }, monday));
  assert.throws(() => validateReportPeriod({ since: '2026-08-01', until: '2026-09-20' }, monday));
  assert.throws(() => validateReportPeriod({ since: '2026-09-31', until: '2026-09-31' }, monday));
});

test('cada conta marcada exige seu próprio modelo e formato', () => {
  const mixed = validateReportSelection({ platform: 'meta', accounts: [
    { id: 'act_1', objective: 'engagements', format: 'visual' }, { id: 'act_2', objective: 'clicks', format: 'text' },
  ] });
  assert.deepEqual(mixed.choices, { act_1: { objective: 'engagements', format: 'visual' }, act_2: { objective: 'clicks', format: 'text' } });
  assert.deepEqual(mixed.accountIds, ['act_1', 'act_2']);
  assert.throws(() => validateReportSelection(meta('visual', [])), /ao menos uma conta/);
  assert.throws(() => validateReportSelection({ platform: 'meta', accounts: [{ id: 'act_1', objective: 'clicks', format: 'text' }, { id: 'act_2', objective: 'clicks' }] }), /formato de cada conta/);
  assert.throws(() => validateReportSelection({ platform: 'meta', accounts: [{ id: 'act_1', format: 'text' }] }), /modelo de cada conta/);
  assert.throws(() => validateReportSelection(meta('text', ['act_1'], 'conversions')), /modelo/);
  assert.throws(() => validateReportSelection(googleSel('text', ['1111111111'], 'messages')), /modelo/);
  assert.throws(() => validateReportSelection(googleSel('text', ['act_1'], 'clicks')), /inválida/);
  assert.throws(() => validateReportSelection({ platform: 'meta', accounts: [{ id: 'act_1', objective: 'clicks', format: 'text' }, { id: 'act_1', objective: 'messages', format: 'visual' }] }), /inválida/);
});

test('um mesmo envio respeita modelo e formato escolhidos para cada conta', async () => {
  const network = networkFixture();
  const options = { agency: 'gdm', period, store: storeFixture(), now: monday, env, connections: [], fetchImpl: network.fetchImpl,
    pause: async () => {}, publishImage: async report => { assert.equal(report.accountId, 'act_3'); return 'https://images.test/report.png'; },
    selection: { platform: 'meta', accounts: [
      { id: 'act_3', objective: 'engagements', format: 'visual' },
      { id: 'act_6', objective: 'clicks', format: 'text' },
    ] } };
  const collected = await collectAgencyReports(rules.gdm, options.selection, options);
  const byId = Object.fromEntries(collected.reports.map(report => [report.accountId, report]));
  assert.equal(byId.act_3.format, 'visual');
  assert.equal(byId.act_3.objective, 'engagements');
  assert.equal(byId.act_3.text, '');
  assert.equal(toVisualReportData(byId.act_3).objective, 'engagements');
  assert.equal(byId.act_6.format, 'text');
  assert.match(byId.act_6.text, /Cliques no link: 378/);

  const sent = await sendAgencyReports(options);
  assert.equal(sent.sent, 2);
  const image = network.posts.find(post => post.blocks);
  const text = network.posts.find(post => !post.blocks);
  assert.match(image.text, /Cliente GDM/);
  assert.match(text.text, /Só impressões/);
});

test('cada agência exige seu próprio webhook', () => {
  assert.equal(getReportWebhook('gdm', env), env.SLACK_WEBHOOK_REPORTS_GDM);
  assert.equal(getReportWebhook('gdm', { SLACK_WEBHOOK_ALERTS: 'https://hooks.slack.test/alerts' }), '');
  assert.equal(matchReportAgency('Agência TAGB'), 'tagb');
  assert.equal(matchReportAgency('VILAS MKT'), 'vilasmkt');
});

test('lista contas Meta e Google separadas por agência', async () => {
  const network = networkFixture();
  const list = await listReportAccounts({ store: storeFixture(), env, fetchImpl: network.fetchImpl, metaConnections: [], googleConnections });
  assert.deepEqual(list.meta.filter(a => a.agency === 'tagb').map(a => a.id).sort(), TAGB_META);
  assert.equal(list.meta.some(a => a.id === 'act_5'), false);
  assert.deepEqual(list.google.map(a => [a.id, a.agency]), [['1111111111', 'gdm'], ['2222222222', 'tagb']]);
  assert.deepEqual(list.errors, []);
});

test('usa o token conectado no painel e recupera quando um token expira', async () => {
  const network = networkFixture({ validTokens: ['current-token'] });
  const result = await collectAgencyReports(rules.tagb, meta('visual', TAGB_META), {
    store: storeFixture(), period, now: monday, connections: [],
    clientToken: 'current-token', env: { ...env, META_ACCESS_TOKEN: 'expired-token' }, fetchImpl: network.fetchImpl,
  });
  assert.equal(result.reports.length, 1);

  const fallback = networkFixture();
  const recovered = await collectAgencyReports(rules.gdm, meta('text', GDM_META), {
    store: storeFixture(), period, now: monday, connections: [],
    clientToken: 'expired-token', env, fetchImpl: fallback.fetchImpl,
  });
  assert.equal(recovered.reports.length, 2);
  await assert.rejects(collectAgencyReports(rules.tagb, meta('visual', TAGB_META), {
    store: storeFixture(), period, now: monday, connections: [],
    clientToken: 'expired-token', env: { META_ACCESS_TOKEN: 'also-expired' }, fetchImpl: fallback.fetchImpl,
  }), /Reconecte sua conta/);
});

test('relatórios usam primeiro o token da Business Manager que cobre cada conta', async () => {
  const reads = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    const token = options.headers.Authorization.replace(/^Bearer /, '');
    reads.push({ path: url.pathname, token });
    if (url.pathname.endsWith('/me/adaccounts')) {
      return { ok: false, status: 400, json: async () => ({ error: { code: 190, message: 'Token expirado' } }) };
    }
    if (token !== 'bm-vilas-token') {
      return { ok: false, status: 401, json: async () => ({ error: { code: 190, message: 'Token inválido' } }) };
    }
    const { since } = JSON.parse(url.searchParams.get('time_range'));
    return { ok: true, status: 200, json: async () => ({ data: [{
      spend: '120', impressions: '5000', reach: '3500', inline_link_clicks: '80', ctr: '1.6', cpm: '24', frequency: '1.4',
      actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '12' }], date_start: since,
    }] }) };
  };
  const connections = [{ token: 'bm-vilas-token', accounts: [{ id: 'act_4', account_id: '4', name: 'Cliente Vilas' }] }];
  const result = await collectAgencyReports(rules.vilasmkt, meta('visual', ['act_4']), {
    store: storeFixture(), period, now: monday, clientToken: 'expired-profile-token',
    connections, env: {}, fetchImpl,
  });
  assert.equal(result.reports.length, 1);
  assert.equal(result.reports[0].accountId, 'act_4');
  const insightReads = reads.filter(item => item.path.includes('/act_4/insights'));
  assert.ok(insightReads.length >= 2);
  assert.equal(insightReads.every(item => item.token === 'bm-vilas-token'), true);
});

test('prévia consulta só as contas marcadas da agência, inclusive conta pausada, sem enviar ao Slack', async () => {
  const network = networkFixture();
  const result = await collectAgencyReports(rules.tagb, meta('visual', TAGB_META), { store: storeFixture(), period, now: monday, env, connections: [], fetchImpl: network.fetchImpl });
  assert.equal(result.linkedAccounts, 2);
  assert.equal(result.withoutDelivery, 1);
  assert.deepEqual(result.reports.map(report => report.accountId), ['act_1']);
  assert.equal(result.reports[0].daily.length, 7);
  assert.equal(network.posts.length, 0);
  assert.equal(network.reads.some(url => /act_[3456]\/insights/.test(url.pathname)), false);

  const onlyOne = networkFixture();
  const partial = await collectAgencyReports(rules.gdm, meta('text', ['act_6', 'act_4']), { store: storeFixture(), period, now: monday, env, connections: [], fetchImpl: onlyOne.fetchImpl });
  assert.equal(onlyOne.reads.some(url => /act_[1234]\/insights/.test(url.pathname)), false);
  assert.deepEqual(partial.errors.map(item => item.accountName), ['act_4']);
});

test('período de 20 dias gera série diária e comparação anterior do mesmo tamanho', async () => {
  const network = networkFixture();
  const custom = { since: '2026-09-01', until: '2026-09-20' };
  const visual = await collectAgencyReports(rules.tagb, meta('visual', TAGB_META), { store: storeFixture(), period: custom, now: monday, env, connections: [], fetchImpl: network.fetchImpl });
  assert.equal(visual.reports[0].daily.length, 20);
  assert.equal(visual.reports[0].text, '');
  const textReport = await collectAgencyReports(rules.gdm, meta('text', GDM_META), { store: storeFixture(), period: custom, now: monday, env, connections: [], fetchImpl: network.fetchImpl });
  assert.equal(textReport.reports.length, 2);
  assert.match(textReport.reports[0].text, /01\/09\/2026 a 20\/09\/2026/);
  assert.match(textReport.reports[0].text, /#GDM/);
  assert.equal(network.reads.some(url => url.searchParams.get('time_range') === JSON.stringify({ since: '2026-08-12', until: '2026-08-31' })), true);
});

test('texto Meta destaca a métrica do modelo escolhido', async () => {
  const network = networkFixture();
  const run = objective => collectAgencyReports(rules.gdm, meta('text', ['act_3'], objective), { store: storeFixture(), period, now: monday, env, connections: [], fetchImpl: network.fetchImpl });
  const [messages, clicks, engagements] = await Promise.all(['messages', 'clicks', 'engagements'].map(run));
  assert.match(messages.reports[0].text, /Conversas iniciadas: 43/);
  assert.match(clicks.reports[0].text, /Cliques no link: 378/);
  assert.match(clicks.reports[0].text, /Custo por clique/);
  assert.doesNotMatch(clicks.reports[0].text, /Conversas iniciadas/);
  assert.match(engagements.reports[0].text, /Custo por engajamento/);
  assert.equal(engagements.reports[0].objective, 'engagements');
});

test('Google gera texto por modelo e dados visuais só para as contas da agência', async () => {
  const google = googleReader();
  const options = { store: storeFixture(), period, now: monday, env, googleConnections, readGoogle: google.readGoogle };
  const clicks = await collectAgencyReports(rules.gdm, googleSel('text', ['1111111111', '2222222222'], 'clicks'), options);
  assert.equal(clicks.reports.length, 1);
  assert.match(clicks.reports[0].text, /Cliques: 160/);
  assert.doesNotMatch(clicks.reports[0].text, /Conversões/);
  assert.deepEqual(clicks.errors.map(item => item.accountName), ['2222222222']);
  assert.equal(google.calls.some(call => call.customerId === '2222222222'), false);
  assert.deepEqual(google.calls.find(call => call.range.since === '2026-09-07').range, { since: '2026-09-07', until: '2026-09-13' });

  const visual = await collectAgencyReports(rules.gdm, googleSel('visual', ['1111111111'], 'conversions'), options);
  const card = toVisualReportData(visual.reports[0]);
  assert.equal(card.leads, 8);
  assert.equal(card.objective, 'conversions');
  assert.equal(card.dailyLeads.length, 7);
});

test('formato visual envia só a imagem; formato texto envia só o texto', async () => {
  const network = networkFixture();
  const options = { agency: 'vilasmkt', selection: meta('visual', ['act_4']), period, store: storeFixture(), now: monday, env, connections: [],
    fetchImpl: network.fetchImpl, pause: async () => {}, publishImage: async () => 'https://images.test/report.png' };
  const sent = await sendAgencyReports(options);
  assert.equal(sent.sent, 1);
  assert.equal(network.posts[0].blocks.length, 2);
  assert.equal(network.posts[0].blocks[1].type, 'image');

  const text = await sendAgencyReports({ ...options, selection: meta('text', ['act_4']) });
  assert.equal(text.sent, 1);
  assert.equal(network.posts[1].blocks, undefined);
  assert.match(network.posts[1].text, /VilasMKT • Meta Ads • Cliente Vilas/);
  assert.match(network.posts[1].text, /Relatório de Desempenho/);
});

test('mudar modelo ou formato gera nova entrega; repetir a mesma escolha não duplica', async () => {
  const store = storeFixture(); const network = networkFixture(); const images = [];
  const options = { agency: 'tagb', selection: meta('visual', TAGB_META), period, store, now: monday, env, connections: [], fetchImpl: network.fetchImpl,
    pause: async () => {}, publishImage: async report => { images.push(report); return 'https://images.test/report.png'; } };
  const first = await sendAgencyReports(options);
  assert.equal(first.sent, 1);
  assert.equal(images.length, 1);
  const second = await sendAgencyReports(options);
  assert.equal(second.skipped, 1);
  assert.equal(network.posts.length, 1);
  const otherModel = await sendAgencyReports({ ...options, selection: meta('visual', TAGB_META, 'clicks') });
  assert.equal(otherModel.sent, 1);
  assert.equal(network.posts.length, 2);
});

test('envios concorrentes não duplicam conta e período', async () => {
  const store = storeFixture(); const network = networkFixture();
  const options = { agency: 'gdm', selection: meta('text', GDM_META), period, store, now: monday, env, connections: [], fetchImpl: network.fetchImpl, pause: async () => {} };
  await Promise.all([sendAgencyReports(options), sendAgencyReports(options)]);
  assert.equal(network.posts.length, 2);
});

test('falhas de consulta e de imagem não geram envio falso', async () => {
  const network = networkFixture({ failureId: 'act_1' });
  const collected = await collectAgencyReports(rules.tagb, meta('visual', TAGB_META), { store: storeFixture(), period, now: monday, env, connections: [], fetchImpl: network.fetchImpl });
  assert.equal(collected.reports.length, 0);
  assert.equal(collected.errors.length, 1);
  const healthy = networkFixture();
  const result = await sendAgencyReports({ agency: 'tagb', selection: meta('visual', TAGB_META), period, store: storeFixture(), now: monday, env, connections: [], fetchImpl: healthy.fetchImpl,
    pause: async () => {}, publishImage: async () => { throw new Error('Falha no armazenamento'); } });
  assert.equal(result.status, 'error');
  assert.equal(healthy.posts.length, 0);
});

test('rejeição explícita permite tentar de novo; timeout não repete entrega incerta', async () => {
  for (const timeout of [false, true]) {
    const store = storeFixture(); const network = networkFixture({ slackStatus: 429, slackTimeout: timeout });
    const options = { agency: 'vilasmkt', selection: meta('visual', ['act_4']), period, store, now: monday, env, connections: [], fetchImpl: network.fetchImpl,
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
  const { reports } = await collectAgencyReports(rules.tagb, meta('visual', TAGB_META, 'engagements'), { store: storeFixture(), period, now: monday, env, connections: [], fetchImpl: network.fetchImpl });
  const report = reports[0];
  const visual = toVisualReportData(report);
  assert.equal(visual.objective, 'engagements');
  assert.equal(visual.leads, report.metrics.conversations);
  assert.equal(visual.spend, report.metrics.spend);
  assert.equal(visual.period.start, '14/09/2026');
  assert.equal(visual.dailyEngagements.length, 7);
  assert.equal(visual.dailyClicks[0].clicks, report.daily[0].clicks);
  assert.throws(() => buildSlackReport(rules.tagb, report));
  assert.notEqual(reportDeliveryKey(rules.tagb, report), reportDeliveryKey(rules.tagb, { ...report, objective: 'clicks' }));
  assert.notEqual(reportDeliveryKey(rules.tagb, report), reportDeliveryKey(rules.tagb, { ...report, format: 'text' }));
});

test('imagem do ReportCard deve pertencer à agência e conta antes do envio', () => {
  const db = { storage: { from: () => ({ getPublicUrl: value => ({ data: { publicUrl: `https://images.test/${value}` } }) }) } };
  const report = { agency: 'tagb', accountId: 'act_123' };
  const path = 'manual/tagb/act_123/00000000-0000-4000-8000-000000000000.png';
  assert.equal(resolveReportImage(report, { act_123: path }, db), `https://images.test/${path}`);
  assert.throws(() => resolveReportImage(report, { act_123: 'manual/gdm/act_123/00000000-0000-4000-8000-000000000000.png' }, db));
  assert.throws(() => resolveReportImage(report, {}, db));
  const googlePath = 'manual/gdm/1111111111/00000000-0000-4000-8000-000000000000.png';
  assert.equal(resolveReportImage({ agency: 'gdm', accountId: '1111111111' }, { 1111111111: googlePath }, db), `https://images.test/${googlePath}`);
});
