import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSlackBriefing, buildBriefingPayload, changedAlerts, createBriefingHandler } from '../api/_slack-briefing.js';
import { collectBriefingData } from '../api/_briefing-data.js';
import { normalizeAutoAlertThresholds } from '../src/shared/constants/autoAlerts.js';
const now = new Date('2026-10-12T10:00:00Z');
const env = { SLACK_WEBHOOK_ALERTS: 'https://hooks.slack.test/alerts', CRON_SECRET: 'test' };
const data = () => ({ accounts: [{ id: 'act_1', name: '<!channel>', platform: 'meta', currency: 'BRL', insightsComplete: true, coverage: { since: '2026-09-28', until: '2026-10-11' }, dailyMetrics: [{ date: '2026-10-01', spend: 100, results: 10 }, { date: '2026-10-11', spend: 200, results: 5 }] }], balances: [], issues: [], thresholds: normalizeAutoAlertThresholds() });
function memoryStore() {
  const values = new Map();
  return { values, async get(k) { return values.get(k) ?? null; }, async set(k, v) { values.set(k, v); }, async agencies() { return {}; }, async claim(k) { const previous = values.get(k); if (previous && previous.status !== 'failed') return { acquired: false, status: previous.status }; values.set(k, { status: 'pending' }); return { acquired: true }; } };
}
test('briefing envia uma vez por data mesmo com invocações concorrentes', async () => {
  const store = memoryStore(); let posts = 0;
  const options = { now, env, store, collect: async () => data(), fetchImpl: async () => { posts++; return { ok: true }; } };
  const results = await Promise.all([runSlackBriefing(options), runSlackBriefing(options)]);
  assert.equal(posts, 1); assert.equal(results.filter(r => r.sent).length, 1);
  assert.equal((await runSlackBriefing(options)).status, 'already_sent');
});
test('meio-dia silencioso sem mudança, envia quando piora', async () => {
  const store = memoryStore(); let posts = 0;
  const options = { now, env, store, collect: async () => data(), fetchImpl: async () => { posts++; return { ok: true }; } };
  await runSlackBriefing(options);
  assert.equal((await runSlackBriefing({ ...options, mode: 'alerts' })).sent, false);
  assert.equal(posts, 1);
  const base = { id: 'a', severity: 'warning', value: 100, type: 'high_cost' };
  assert.equal(changedAlerts([{ ...base, value: 110 }], { a: base }).length, 0);
  assert.equal(changedAlerts([{ ...base, value: 130 }], { a: base }).length, 1);
  assert.equal(changedAlerts([{ ...base, severity: 'danger' }], { a: base }).length, 1);
});
test('prévia não envia nem reserva entrega; erro de consulta não vira conta saudável', async () => {
  const store = memoryStore();
  const result = await runSlackBriefing({ now, env, store, dryRun: true, collect: async () => ({ ...data(), accounts: [], issues: [{ message: 'Meta indisponível' }] }), fetchImpl: async () => assert.fail('Não deve enviar') });
  assert.equal(store.values.size, 0); assert.match(JSON.stringify(result.payload), /incompleta/);
});
test('timeout Slack bloqueia reenvio; recusa explícita permite nova tentativa', async () => {
  const store = memoryStore(); let posts = 0;
  const options = { now, env, store, collect: async () => data(), fetchImpl: async () => { posts++; throw new Error('timeout'); } };
  await assert.rejects(runSlackBriefing(options));
  assert.equal((await runSlackBriefing(options)).status, 'needs_review'); assert.equal(posts, 1);
  const retryStore = memoryStore();
  await assert.rejects(runSlackBriefing({ ...options, store: retryStore, fetchImpl: async () => ({ ok: false, status: 429 }) }));
  assert.equal((await runSlackBriefing({ ...options, store: retryStore, fetchImpl: async () => ({ ok: true }) })).sent, true);
});
test('Slack limita tamanho e usa plain_text para nomes externos', () => {
  const alerts = Array.from({ length: 70 }, (_, i) => ({ accountName: `<!channel> ${i}`, platform: 'meta', severity: 'warning', message: 'x'.repeat(4000), detail: 'dados', nextAction: 'revisar' }));
  const payload = buildBriefingPayload(data(), alerts, 'morning', now);
  assert.ok(payload.blocks.length < 50);
  assert.ok(payload.blocks.filter(b => b.type === 'section').every(b => b.text.type === 'plain_text' && b.text.text.length <= 3000));
  assert.match(JSON.stringify(payload), /Mais 58/);
});
test('cron exige secret, método e janela; 7h Bahia = 10 UTC', async () => {
  const invoke = async (environment, request, clock = now) => {
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await createBriefingHandler('morning', { env: environment, clock: () => clock, run: async () => ({ status: 'ran' }) })(request, res);
    return res;
  };
  assert.equal((await invoke({}, { method: 'GET', headers: {} })).code, 401);
  assert.equal((await invoke(env, { method: 'POST', headers: {} })).code, 405);
  const req = { method: 'GET', headers: { authorization: 'Bearer test' } };
  assert.equal((await invoke(env, req)).body.status, 'ran');
  assert.equal((await invoke(env, req, new Date('2026-10-12T09:59:00Z'))).body.status, 'outside_window');
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  assert.ok(config.crons.some(job => job.path === '/api/cron/morning-briefing' && job.schedule === '0 10 * * *'));
});
test('coleta respeita contas desativadas e não transforma falha de insights em zero', async () => {
  const store = memoryStore(); await store.set('disabled_ad_accounts', ['act_2']);
  const paths = [];
  const fetchImpl = async input => {
    const url = new URL(input); paths.push(url.pathname);
    if (url.pathname.endsWith('/me/adaccounts')) return { ok: true, json: async () => ({ data: [{ id: 'act_1', name: 'A', account_status: 1 }, { id: 'act_2', name: 'B' }] }) };
    return { ok: false, status: 503, json: async () => ({ error: { message: 'Unavailable' } }) };
  };
  const snapshot = await collectBriefingData({ store, now, env: { META_ACCESS_TOKEN: 'fixture' }, fetchImpl, metaConnections: [], googleConnections: [] });
  assert.equal(snapshot.accounts.length, 1); assert.equal(snapshot.accounts[0].insightsComplete, false); assert.equal(snapshot.issues.length, 1);
  assert.ok(!paths.some(p => p.includes('act_2/insights')));
});
test('Google preserva frações e solicita janela completa sem dias de hoje', async () => {
  const store = memoryStore();
  const googleConnections = [{ id: 'profile', accounts: [{ accountId: '1234567890', name: 'G', currency: 'USD', timeZone: 'America/Bahia' }] }];
  const snapshot = await collectBriefingData({ store, now, env: {}, metaConnections: [], googleConnections, googleRead: async () => ({ results: [{ segments: { date: '2026-10-09' }, metrics: { costMicros: '15000000', conversions: '2.5' } }] }) });
  const account = snapshot.accounts[0];
  assert.equal(account.coverage.since, '2026-09-26'); assert.equal(account.coverage.until, '2026-10-11'); assert.equal(account.dailyMetrics[0].results, 2.5); assert.equal(account.dailyMetrics[0].spend, 15);
});
