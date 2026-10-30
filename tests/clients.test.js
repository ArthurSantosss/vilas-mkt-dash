import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeClient,
  normalizeTransaction,
  normalizeAgencyBilling,
  summarizeTransactions,
  getTransactionState,
  getMonthlyDueDate,
  buildMonthlyFeeTransaction,
  buildSalaryTransaction,
  sortTransactions,
  buildLinkOwnerMap,
  validateClient,
  isPerClientAgency,
  agencyAccountKey,
  assignLinkToClient,
  releaseLinksFromOthers,
  groupClientsByAgency,
  collectAgencyTransactions,
} from '../src/shared/utils/clients.js';

const TODAY = '2026-10-29';

test('normalizeClient limpa campos, descarta dados antigos e vínculos inválidos', () => {
  const client = normalizeClient({
    name: '  Clínica Sol ',
    agency: ' Vilas MKT ',
    status: 'paused',
    contactName: 'Fulano',
    monthlyFee: '1500,50',
    paymentDueDay: 40,
    links: [
      { platform: 'meta', id: 'act_1', name: 'Conta 1' },
      { platform: 'meta', id: 'act_1', name: 'Duplicada' },
      { platform: 'tiktok', id: 'x' },
      { platform: 'instagram', id: 123 },
    ],
  });

  assert.equal(client.name, 'Clínica Sol');
  assert.equal(client.agency, 'Vilas MKT');
  assert.equal(client.monthlyFee, 1500.5);
  assert.equal(client.paymentDueDay, 31);
  assert.equal('status' in client, false);
  assert.equal('contactName' in client, false);
  assert.deepEqual(client.links, [
    { platform: 'meta', id: 'act_1', name: 'Conta 1' },
    { platform: 'instagram', id: '123', name: '123' },
  ]);
  assert.equal(validateClient(normalizeClient({ name: '  ' })), 'Informe o nome do cliente.');
});

test('só a Vilas MKT cobra por cliente', () => {
  assert.equal(isPerClientAgency('Vilas MKT'), true);
  assert.equal(isPerClientAgency('vilasmkt'), true);
  assert.equal(isPerClientAgency('Agência Alfa'), false);
  assert.equal(isPerClientAgency(''), false);
});

test('chave de agência por conta segue o mapa existente (Instagram com prefixo ig_)', () => {
  assert.equal(agencyAccountKey({ platform: 'meta', id: 'act_1' }), 'act_1');
  assert.equal(agencyAccountKey({ platform: 'google', id: '123' }), '123');
  assert.equal(agencyAccountKey({ platform: 'instagram', id: '99' }), 'ig_99');
});

test('lançamento pago guarda data de pagamento; pendente não', () => {
  assert.equal(normalizeTransaction({ amount: 10, status: 'paid', dueDate: '2026-10-01' }).paidAt, '2026-10-01');
  assert.equal(normalizeTransaction({ amount: 10, status: 'pending', paidAt: '2026-10-01' }).paidAt, null);
});

test('summarizeTransactions separa a receber, recebido no mês, a pagar e atrasos', () => {
  const transactions = [
    { type: 'receivable', amount: 1000, status: 'pending', dueDate: '2026-10-10' },
    { type: 'receivable', amount: 500, status: 'pending', dueDate: '2026-11-10' },
    { type: 'receivable', amount: 300, status: 'paid', paidAt: '2026-10-05' },
    { type: 'receivable', amount: 999, status: 'paid', paidAt: '2026-09-05' },
    { type: 'payable', amount: 200, status: 'pending', dueDate: '2026-10-01' },
    { type: 'payable', amount: 80, status: 'paid', paidAt: '2026-10-20' },
  ];

  assert.deepEqual(summarizeTransactions(transactions, TODAY), {
    toReceive: 1500,
    overdueReceivable: 1000,
    receivedThisMonth: 300,
    toPay: 200,
    overduePayable: 200,
    paidThisMonth: 80,
    overdueCount: 2,
  });
});

test('estado do lançamento considera vencimento', () => {
  assert.equal(getTransactionState({ status: 'pending', dueDate: '2026-10-28' }, TODAY), 'overdue');
  assert.equal(getTransactionState({ status: 'pending', dueDate: TODAY }, TODAY), 'pending');
  assert.equal(getTransactionState({ status: 'pending', dueDate: null }, TODAY), 'pending');
  assert.equal(getTransactionState({ status: 'paid', dueDate: '2026-01-01' }, TODAY), 'paid');
});

test('vencimento mensal respeita meses curtos', () => {
  assert.equal(getMonthlyDueDate(31, '2026-02-10'), '2026-02-28');
  assert.equal(getMonthlyDueDate(10, TODAY), '2026-10-10');
  assert.equal(getMonthlyDueDate(null, TODAY), '2026-10-01');
});

test('mensalidade e salário do mês não são gerados duas vezes', () => {
  const client = normalizeClient({ name: 'A', monthlyFee: 2000, paymentDueDay: 15 });
  const fee = buildMonthlyFeeTransaction(client, TODAY);
  assert.equal(fee.description, 'Mensalidade 10/2026');
  assert.equal(fee.amount, 2000);
  assert.equal(fee.dueDate, '2026-10-15');
  assert.equal(buildMonthlyFeeTransaction({ ...client, transactions: [fee] }, TODAY), null);
  assert.equal(buildMonthlyFeeTransaction(normalizeClient({ name: 'B' }), TODAY), null);

  const billing = normalizeAgencyBilling({ salary: 5000, dueDay: 5 });
  const salary = buildSalaryTransaction(billing, TODAY);
  assert.equal(salary.description, 'Salário 10/2026');
  assert.equal(salary.dueDate, '2026-10-05');
  assert.equal(buildSalaryTransaction({ ...billing, transactions: [salary] }, TODAY), null);
});

test('ordenação coloca pendentes por vencimento antes dos pagos', () => {
  const sorted = sortTransactions([
    { id: 'pago-antigo', status: 'paid', paidAt: '2026-09-01' },
    { id: 'pendente-nov', status: 'pending', dueDate: '2026-11-01' },
    { id: 'pago-recente', status: 'paid', paidAt: '2026-10-01' },
    { id: 'pendente-out', status: 'pending', dueDate: '2026-10-01' },
  ]);
  assert.deepEqual(sorted.map((t) => t.id), ['pendente-out', 'pendente-nov', 'pago-recente', 'pago-antigo']);
});

test('cada conta pertence a um único cliente', () => {
  const clients = [
    normalizeClient({ id: 'a', name: 'A', links: [{ platform: 'meta', id: 'act_1' }] }),
    normalizeClient({ id: 'b', name: 'B' }),
  ];

  const moved = assignLinkToClient(clients, { platform: 'meta', id: 'act_1', name: 'Conta 1' }, 'b');
  assert.deepEqual(moved[0].links, []);
  assert.deepEqual(moved[1].links, [{ platform: 'meta', id: 'act_1', name: 'Conta 1' }]);

  const removed = assignLinkToClient(moved, { platform: 'meta', id: 'act_1' }, '');
  assert.equal(removed.every((client) => client.links.length === 0), true);

  const released = releaseLinksFromOthers(clients, 'b', [{ platform: 'meta', id: 'act_1' }]);
  assert.deepEqual(released[0].links, []);
  assert.equal(released[1], clients[1]);

  assert.deepEqual(Object.keys(buildLinkOwnerMap(clients, 'b')), ['meta:act_1']);
  assert.deepEqual(buildLinkOwnerMap(clients, 'a'), {});
});

test('agrupa clientes por agência e junta lançamentos da agência', () => {
  const clients = [
    normalizeClient({ id: '1', name: 'Zeta', agency: 'Vilas MKT', transactions: [{ amount: 100, description: 'x' }] }),
    normalizeClient({ id: '2', name: 'Alfa', agency: 'Vilas MKT' }),
    normalizeClient({ id: '3', name: 'Beta', agency: 'Outra' }),
    normalizeClient({ id: '4', name: 'Solto' }),
  ];
  const groups = groupClientsByAgency(clients, ['Vilas MKT', 'Outra', 'Vazia']);
  assert.deepEqual(groups.map((g) => [g.agency, g.clients.map((c) => c.name)]), [
    ['Vilas MKT', ['Alfa', 'Zeta']],
    ['Outra', ['Beta']],
    ['Vazia', []],
    ['', ['Solto']],
  ]);

  const billing = { Outra: normalizeAgencyBilling({ transactions: [{ amount: 5000, description: 'Salário' }] }) };
  assert.equal(collectAgencyTransactions('Vilas MKT', clients, billing).length, 1);
  assert.equal(collectAgencyTransactions('Outra', clients, billing)[0].amount, 5000);
});
