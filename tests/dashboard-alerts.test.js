import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAutomaticAlerts } from '../src/shared/utils/automaticAlerts.js';

const now = new Date('2026-09-27T15:00:00Z');
const account = { id: 'act_1', clientName: 'Cliente', status: 'active' };
const evaluate = (overrides = {}) => generateAutomaticAlerts({ accounts: [account], now, ...overrides });

test('saldo zero gera aviso; saldo indisponível e cartão não geram falso alerta de recarga', () => {
  const balances = [{ accountId: 'act_1', currentBalance: 0, hasReliableBalance: true }];
  assert.equal(evaluate({ balances })[0].id, 'payment-zero-act_1');
  assert.equal(evaluate({ balances, paymentMethodsMap: { act_1: 'credit_card' } }).length, 0);
  assert.equal(evaluate({ balances: [{ ...balances[0], hasReliableBalance: false }] }).length, 0);
});

test('limites personalizados e agência são usados pelos avisos', () => {
  const result = evaluate({ balances: [{ accountId: 'act_1', currentBalance: 170 }], thresholds: { balance_critical: 200, balance_warning: 300 }, accountAgencies: { act_1: 'Agência' } });
  assert.equal(result[0].severity, 'danger');
  assert.equal(result[0].agency, 'Agência');
  assert.equal(result[0].accountId, 'act_1');
});

test('dados de outro período não são apresentados como gasto de hoje', () => {
  assert.deepEqual(evaluate({ accounts: [{ ...account, dailyMetrics: [{ date: '2026-09-26', spend: 200, messages: 0 }] }] }), []);
  const result = evaluate({ accounts: [{ ...account, dailyMetrics: [{ date: '2026-09-27', spend: 80, messages: 0 }] }] });
  assert.equal(result[0].type, 'no_messages');
});

test('custo por lead respeita limite e aumenta a gravidade sem depender da ordem das contas', () => {
  const dailyMetrics = [{ date: '2026-09-27', spend: 60, messages: 2 }];
  const warning = evaluate({ accounts: [{ ...account, dailyMetrics }] })[0];
  const reordered = evaluate({ accounts: [{ id: 'act_2' }, { ...account, dailyMetrics }] })[0];
  assert.equal(warning.severity, 'warning');
  assert.equal(warning.id, reordered.id);
  const critical = evaluate({ accounts: [{ ...account, dailyMetrics: [{ ...dailyMetrics[0], spend: 100 }] }] })[0];
  assert.equal(critical.severity, 'danger');
});

test('dia de referência segue Brasília na virada UTC', () => {
  const result = evaluate({ now: new Date('2026-09-28T01:00:00Z'), accounts: [{ ...account, dailyMetrics: [{ date: '2026-09-27', spend: 20, messages: 0 }] }] });
  assert.equal(result[0].type, 'no_messages');
});

test('possível falha de cobrança mantém a identificação estável', () => {
  const result = evaluate({ accounts: [{ ...account, status: 'disabled' }], paymentMethodsMap: { act_1: 'credit_card' } });
  assert.equal(result[0].id, 'payment-card-act_1');
  assert.match(result[0].message, /Possível/);
});
