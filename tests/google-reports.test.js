import test from 'node:test';
import assert from 'node:assert/strict';
import { googleReportPeriods, googleTextData, googleVisualData } from '../src/shared/utils/googleReports.js';
import { buildReportText } from '../src/shared/utils/reportText.js';
import { googleAdsError } from '../api/_google-ads-errors.js';
import { fetchAccountSpending, fetchAccountOverview } from '../api/google-ads-proxy.js';

test('relatório Google usa datas no fuso da conta e comparação do mesmo tamanho', () => {
  const result = googleReportPeriods('month', 'America/Bahia', new Date('2026-03-01T01:00:00Z'));
  assert.equal(result.current.startDate, '2026-02-01');
  assert.equal(result.current.endDate, '2026-02-28');
  assert.equal(result.previous.startDate, '2026-01-04');
  assert.equal(result.previous.endDate, '2026-01-31');
  assert.throws(() => googleReportPeriods({ type: 'custom', startDate: '2026-02-30', endDate: '2026-03-04' }));
});

test('texto e visual preservam conversões fracionadas e não inventam métricas Meta', () => {
  const period = { startDate: '2026-09-01', endDate: '2026-09-03' };
  const totals = { spend: 100, clicks: 20, impressions: 1000, conversions: 2.5 };
  const text = buildReportText(googleTextData(totals, 'Busca', period, 'USD'));
  assert.match(text, /Conversões: 2,5/);
  assert.match(text, /US\$/);
  assert.doesNotMatch(text, /Alcance|Mensagens|Meta Ads/);
  const visual = googleVisualData({ totals, dailyMetrics: [{ date: '2026-09-02', conversions: 2.5, clicks: 20 }] }, null, { clientName: 'Cliente', currency: 'USD' }, period);
  assert.deepEqual(visual.dailyLeads.map(d => d.leads), [0, 2.5, 0]);
  assert.equal(visual.reach, null);
  assert.equal(visual.costPerLead, 40);
});

test('recusa de acesso mantém código e orientação sem concluir suspensão', () => {
  const error = googleAdsError({ error: { message: 'The caller does not have permission', details: [{ errors: [{ errorCode: { authorizationError: 'USER_PERMISSION_DENIED' } }] }] } }, new Response('', { status: 403, headers: { 'request-id': 'ref-1' } }));
  assert.deepEqual(error.diagnostic.codes, ['USER_PERMISSION_DENIED']);
  assert.match(error.diagnostic.guidance, /Acesso e segurança/);
  assert.equal(error.diagnostic.requestId, 'ref-1');
  assert.doesNotMatch(error.message, /suspens/);
});

test('saldos Google usa gastos reais e deixa saldo em caixa indisponível', async t => {
  const old = globalThis.fetch;
  t.after(() => { globalThis.fetch = old; });
  const queries = [];
  globalThis.fetch = async (_url, options) => {
    queries.push(JSON.parse(options.body).query);
    return new Response(JSON.stringify({ results: [{ metrics: { costMicros: '70000000' } }] }));
  };
  const data = await fetchAccountSpending('token', { accountId: '1234567890', timeZone: 'UTC', currency: 'BRL' });
  assert.equal(data.spentThisMonth, 70);
  assert.equal(data.avgDailySpend7d, 10);
  assert.equal(data.currentBalance, null);
  assert.equal(data.hasReliableBalance, false);
  assert.ok(queries.every(q => q.includes('FROM customer')));
});

test('filtro de campanhas vale para totais e série diária e rejeita injeção', async t => {
  const old = globalThis.fetch;
  t.after(() => { globalThis.fetch = old; });
  const queries = [];
  globalThis.fetch = async (_url, options) => {
    queries.push(JSON.parse(options.body).query);
    return new Response(JSON.stringify({ results: [] }));
  };
  await fetchAccountOverview('token', '1234567890', '7d', null, 'UTC', ['123', '456']);
  assert.equal(queries.length, 2);
  assert.ok(queries.every(q => q.includes('campaign.id IN (123,456)')));
  await assert.rejects(fetchAccountOverview('token', '1234567890', '7d', null, 'UTC', ['1) OR 1=1']), /Filtro/);
});
