import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAutomaticAlerts, alertPeriods, normalizeMetaAlertDays } from '../src/shared/utils/automaticAlerts.js';
import { normalizeAutoAlertThresholds } from '../src/shared/constants/autoAlerts.js';
const now = new Date('2026-10-12T10:00:00Z');
const account = { id: 'act_1', name: 'Cliente', status: 'active', insightsComplete: true, coverage: { since: '2026-09-28', until: '2026-10-11' }, dailyMetrics: [] };
const evaluate = (overrides = {}) => generateAutomaticAlerts({ accounts: [account], now, ...overrides });
const metrics = (current, previous = { spend: 100, results: 10 }) => [{ date: '2026-10-01', ...previous }, { date: '2026-10-10', ...current }];

test('saldo real zero alerta; saldo indisponível, limite de gasto e cartão não pedem recarga', () => {
  const balance = { accountId: 'act_1', currentBalance: 0, hasReliableBalance: true, balanceSource: 'prepaid' };
  assert.equal(evaluate({ balances: [balance] })[0].type, 'payment_error');
  assert.equal(evaluate({ balances: [balance], paymentMethodsMap: { act_1: 'credit_card' } }).length, 0);
  for (const invalid of [{ ...balance, hasReliableBalance: false }, { ...balance, balanceSource: 'spend_cap' }]) assert.equal(evaluate({ balances: [invalid] }).length, 0);
});
test('mínimos evitam alertas com pouco gasto ou poucas conversões', () => {
  for (const current of [{ spend: 5, results: 0 }, { spend: 200, results: 1 }]) assert.deepEqual(evaluate({ accounts: [{ ...account, dailyMetrics: metrics(current) }] }), []);
});
test('zero resultados requer histórico suficiente e gasto relevante', () => {
  const dailyMetrics = metrics({ spend: 80, results: 0 });
  assert.equal(evaluate({ accounts: [{ ...account, dailyMetrics }] })[0].type, 'no_results');
  assert.deepEqual(evaluate({ accounts: [{ ...account, dailyMetrics: metrics({ spend: 800, results: 0 }, { spend: 200, results: 0 }) }] }), []);
});
test('piora relativa dispara mesmo abaixo da meta absoluta, sem duplicar custo alto', () => {
  const alerts = evaluate({ accounts: [{ ...account, dailyMetrics: metrics({ spend: 180, results: 10 }) }] });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'cost_increase');
  assert.equal(alerts[0].severity, 'danger');
  assert.match(alerts[0].message, /80%/);
});
test('amostra suficiente respeita meta de custo', () => {
  const alerts = evaluate({ accounts: [{ ...account, dailyMetrics: metrics({ spend: 300, results: 10 }, { spend: 300, results: 10 }) }] });
  assert.equal(alerts[0].type, 'high_cost');
  assert.equal(alerts[0].severity, 'warning');
});
test('erro, cobertura parcial e dados de hoje não viram conclusões de desempenho', () => {
  const dailyMetrics = metrics({ spend: 500, results: 0 });
  assert.deepEqual(evaluate({ accounts: [{ ...account, dailyMetrics, insightsComplete: false }] }), []);
  assert.deepEqual(evaluate({ accounts: [{ ...account, dailyMetrics, coverage: { since: '2026-10-05', until: '2026-10-11' } }] }), []);
  assert.deepEqual(evaluate({ accounts: [{ ...account, dailyMetrics: [{ date: '2026-10-12', spend: 500, results: 0 }] }] }), []);
});
test('fuso Bahia e janelas Google excluem dias recentes; conversões fracionadas preservadas', () => {
  assert.equal(alertPeriods(new Date('2026-10-13T01:00:00Z')).today, '2026-10-12');
  const period = alertPeriods(now, 'google');
  assert.equal(period.until, '2026-10-09');
  assert.equal(period.previousSince, '2026-09-26');
  const alerts = evaluate({ accounts: [{ ...account, platform: 'google', coverage: { since: period.previousSince, until: period.yesterday }, dailyMetrics: [{ date: '2026-09-28', spend: 100, results: 10.5 }, { date: '2026-10-08', spend: 200, results: 5.5 }, { date: '2026-10-11', spend: 9000, results: 0 }] }] });
  assert.match(alerts[0].detail, /5,5 conversões/);
  assert.doesNotMatch(alerts[0].detail, /9.000/);
});
test('conta desativada não é diagnosticada como falha de cobrança', () => {
  const alerts = evaluate({ accounts: [{ ...account, status: 'disabled' }] });
  assert.equal(alerts[0].type, 'account_status');
  assert.doesNotMatch(alerts[0].message, /cobrança|cartão/);
});
test('Meta não soma aliases e preserva um tipo de resultado na comparação', () => {
  const rows = [{ date_start: '2026-10-01', actions: [{ action_type: 'lead', value: '8' }] }, { date_start: '2026-10-10', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '4' }, { action_type: 'messaging_conversation_started_7d', value: '4' }, { action_type: 'lead', value: '10' }] }];
  assert.deepEqual(normalizeMetaAlertDays(rows).map(day => day.results), [0, 4]);
});
test('normalização mantém amostra positiva e dias de atraso limitados', () => {
  const config = normalizeAutoAlertThresholds({ min_results: 0, google_lag_days: 999, min_spend: -1, balance_critical: 300, balance_warning: 50 });
  assert.equal(config.min_results, 1); assert.equal(config.google_lag_days, 14); assert.equal(config.min_spend, 50); assert.equal(config.balance_warning, 300);
});
