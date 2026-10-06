import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportCache, reportScopeKey } from '../src/modules/reports/reportCache.js';

test('relatórios reutilizam consultas simultâneas e recentes entre formatos', async () => {
  const cache = createReportCache();
  let calls = 0;
  const read = () => cache.read(['insights', 'act_1', '2026-10-06'], async () => { calls++; return { spend: 100 }; });
  const [text, visual] = await Promise.all([read(), read()]);
  assert.equal(calls, 1);
  assert.equal(text, visual);
  assert.deepEqual(await read(), { spend: 100 });
  assert.equal(calls, 1);
});

test('cache expira e atualização manual descarta dados anteriores', async () => {
  let time = 0; let calls = 0;
  const cache = createReportCache({ ttl: 100, now: () => time });
  const read = () => cache.read(['account'], async () => ++calls);
  assert.equal(await read(), 1);
  time = 99;
  assert.equal(await read(), 1);
  time = 100;
  assert.equal(await read(), 2);
  cache.clear();
  assert.equal(await read(), 3);
});

test('erros podem ser tentados novamente e não contaminam outra conta', async () => {
  const cache = createReportCache();
  await assert.rejects(cache.read(['act_1'], async () => { throw new Error('offline'); }));
  assert.equal(await cache.read(['act_2'], async () => 2), 2);
  assert.equal(await cache.read(['act_1'], async () => 1), 1);
});

test('resposta antiga após atualização não substitui a nova entrada do cache', async () => {
  const cache = createReportCache();
  let resolveOld;
  const old = cache.read(['act_1'], () => new Promise(resolve => { resolveOld = resolve; }));
  await Promise.resolve();
  cache.clear();
  assert.equal(await cache.read(['act_1'], async () => 'novo'), 'novo');
  resolveOld('antigo');
  await old;
  assert.equal(await cache.read(['act_1'], async () => 'incorreto'), 'novo');
});

test('escopo preserva seleção entre formatos e separa conta, período, agência e campanhas', () => {
  const selection = { platform: 'meta', selectedAgency: '__all__', selectedAccount: 'act_1', selectedPeriod: { type: 'custom', startDate: '2026-10-01', endDate: '2026-10-06' }, selectedCampaignIds: ['c2', 'c1'] };
  const key = reportScopeKey(selection);
  assert.equal(reportScopeKey({ ...selection, format: 'visual', selectedCampaignIds: ['c1', 'c2'] }), key);
  for (const patch of [{ platform: 'google' }, { selectedAgency: 'outra' }, { selectedAccount: 'act_2' }, { selectedPeriod: 'yesterday' }, { selectedCampaignIds: [] }]) {
    assert.notEqual(reportScopeKey({ ...selection, ...patch }), key);
  }
  assert.deepEqual(selection.selectedCampaignIds, ['c2', 'c1']);
});
