import test from 'node:test';
import assert from 'node:assert/strict';
import { applyManualGoogleBalance, splitBalanceUntil, resolveGooglePayment } from '../src/shared/utils/googleBalance.js';
import { fetchAccountSpending, spentAfterFilter } from '../api/google-ads-proxy.js';

const apiData = { balanceSource: 'unavailable', hasReliableBalance: false, currentBalance: null, avgDailySpend7d: 20, balanceSince: '2026-11-01', spentSinceBalance: 150 };

test('saldo informado desconta o gasto feito depois da data informada', () => {
  const data = applyManualGoogleBalance(apiData, { amount: 500, date: '2026-11-01' });
  assert.equal(data.currentBalance, 350);
  assert.equal(data.balanceSource, 'manual');
  assert.equal(data.hasReliableBalance, true);
  assert.equal(data.estimatedDaysRemaining, 17.5);
});

test('saldo informado nunca fica negativo e espera a consulta da data nova', () => {
  assert.equal(applyManualGoogleBalance({ ...apiData, spentSinceBalance: 900 }, { amount: 500, date: '2026-11-01' }).currentBalance, 0);
  assert.equal(applyManualGoogleBalance(apiData, { amount: 500, date: '2026-11-05' }).balanceSource, 'unavailable');
});

test('orçamento de conta aprovado tem prioridade sobre o saldo informado', () => {
  const budget = { ...apiData, balanceSource: 'account_budget', currentBalance: 800, hasReliableBalance: true };
  assert.equal(applyManualGoogleBalance(budget, { amount: 10, date: '2026-11-01' }).currentBalance, 800);
});

test('saldo dividido pelos dias até o pagamento usa no mínimo 1 dia', () => {
  assert.deepEqual(splitBalanceUntil(300, 3), { days: 3, divisor: 3, daily: 100, overdue: false });
  assert.equal(splitBalanceUntil(300, 0).daily, 300);
  assert.equal(splitBalanceUntil(300, -2).overdue, true);
  assert.equal(splitBalanceUntil(0, 3), null);
});

test('próximo pagamento Google: só Pix/boleto e a data manual vence a calculada', () => {
  const base = { accountId: '1234567890', lastPayments: { 1234567890: '2026-11-01' }, frequencies: { 1234567890: 'weekly' }, balance: { currentBalance: 70, hasReliableBalance: true } };
  assert.equal(resolveGooglePayment({ ...base, paymentMethods: {} }).prepaid, false);
  const computed = resolveGooglePayment({ ...base, paymentMethods: { 1234567890: 'pix' }, overrides: {} });
  assert.equal(computed.effective.toISOString().slice(0, 10), new Date('2026-11-08T00:00:00').toISOString().slice(0, 10));
  const manual = resolveGooglePayment({ ...base, paymentMethods: { 1234567890: 'boleto' }, overrides: { 1234567890: '2030-01-10' } });
  assert.equal(manual.overrideDate.getFullYear(), 2030);
  assert.ok(manual.split.daily > 0);
});

test('gasto desde o saldo começa no dia seguinte ao informado', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  assert.equal(spentAfterFilter('2026-11-10', 'UTC', now), "segments.date BETWEEN '2026-11-11' AND '2026-11-12'");
  assert.equal(spentAfterFilter('2026-11-12', 'UTC', now), null);
  assert.equal(spentAfterFilter('', 'UTC', now), null);
  assert.throws(() => spentAfterFilter("2026-11-10' OR 1=1", 'UTC', now));
});

test('consulta de gasto devolve o gasto desde o saldo informado', async t => {
  const old = globalThis.fetch;
  t.after(() => { globalThis.fetch = old; });
  const queries = [];
  globalThis.fetch = async (_url, options) => {
    const { query } = JSON.parse(options.body);
    queries.push(query);
    return new Response(JSON.stringify({ results: query.includes('FROM account_budget') ? [] : [{ metrics: { costMicros: '40000000' } }] }));
  };
  const data = await fetchAccountSpending('token', { accountId: '1234567890', timeZone: 'UTC', currency: 'BRL' }, { balanceSince: '2020-01-01' });
  assert.equal(data.spentSinceBalance, 40);
  assert.equal(data.balanceSince, '2020-01-01');
  assert.equal(queries.filter(q => q.includes('FROM customer')).length, 3);
});
