import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFatigueInsightsParams,
  detectCreativeFatigue,
  getFatigueWindows,
} from '../src/shared/utils/creativeFatigue.js';

const row = (overrides) => ({
  ad_id: '1',
  ad_name: 'Criativo A',
  campaign_name: 'Campanha',
  adset_name: 'Conjunto',
  spend: '200',
  impressions: '10000',
  frequency: '2',
  inline_link_click_ctr: '1.5',
  actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '20' }],
  ...overrides,
});

test('janelas excluem hoje e não se sobrepõem', () => {
  const windows = getFatigueWindows(new Date('2026-10-12T15:00:00Z'));
  assert.deepEqual(windows.recent, { since: '2026-10-05', until: '2026-10-11' });
  assert.deepEqual(windows.previous, { since: '2026-09-28', until: '2026-10-04' });
});

test('janelas usam o dia do fuso de São Paulo', () => {
  // 01h UTC do dia 12 ainda é dia 11 em São Paulo.
  const windows = getFatigueWindows(new Date('2026-10-12T01:00:00Z'));
  assert.equal(windows.recent.until, '2026-10-10');
});

test('parâmetros filtram anúncios ativos no nível de anúncio', () => {
  const params = buildFatigueInsightsParams({ since: '2026-10-05', until: '2026-10-11' });
  assert.equal(params.level, 'ad');
  assert.match(params.filtering, /ad\.effective_status/);
  assert.equal(JSON.parse(params.time_range).since, '2026-10-05');
});

test('frequência alta com CTR caindo vira alerta', () => {
  const recent = [row({ frequency: '2.8', inline_link_click_ctr: '1.1' })];
  const previous = [row({ frequency: '1.9', inline_link_click_ctr: '1.5' })];
  const [result] = detectCreativeFatigue(recent, previous);
  assert.equal(result.severity, 'warning');
  assert.equal(result.ctrChange, -26.7);
  assert.ok(result.reasons.some((r) => r.includes('CTR de link caiu 27%')));
});

test('caso crítico: frequência acima de 3,5 e CTR caindo mais de 35%', () => {
  const recent = [row({ frequency: '3.9', inline_link_click_ctr: '0.9', actions: [{ action_type: 'lead', value: '5' }] })];
  const previous = [row({ inline_link_click_ctr: '1.5', actions: [{ action_type: 'lead', value: '20' }] })];
  const [result] = detectCreativeFatigue(recent, previous);
  assert.equal(result.severity, 'critical');
  assert.equal(result.costPerLeadChange, 300);
});

test('saturação: frequência 4+ com queda pequena de CTR', () => {
  const recent = [row({ frequency: '4.2', inline_link_click_ctr: '1.32' })];
  const previous = [row({ inline_link_click_ctr: '1.5' })];
  const [result] = detectCreativeFatigue(recent, previous);
  assert.equal(result.severity, 'warning');
});

test('ignora CTR estável, anúncio novo e volume baixo', () => {
  assert.equal(detectCreativeFatigue([row({ frequency: '3', inline_link_click_ctr: '1.45' })], [row()]).length, 0);
  assert.equal(detectCreativeFatigue([row({ frequency: '3', inline_link_click_ctr: '0.5' })], []).length, 0);
  assert.equal(detectCreativeFatigue([row({ frequency: '3', inline_link_click_ctr: '0.5', impressions: '500' })], [row()]).length, 0);
  assert.equal(detectCreativeFatigue([row({ frequency: '3', inline_link_click_ctr: '0.5', spend: '5' })], [row()]).length, 0);
});

test('ordena críticos primeiro e depois por gasto', () => {
  const recent = [
    row({ ad_id: 'a', frequency: '2.8', inline_link_click_ctr: '1.1', spend: '500' }),
    row({ ad_id: 'b', frequency: '3.9', inline_link_click_ctr: '0.8', spend: '100' }),
    row({ ad_id: 'c', frequency: '2.8', inline_link_click_ctr: '1.1', spend: '900' }),
  ];
  const previous = ['a', 'b', 'c'].map((id) => row({ ad_id: id }));
  assert.deepEqual(detectCreativeFatigue(recent, previous).map((r) => r.adId), ['b', 'c', 'a']);
});

test('recalcula CTR pelos cliques quando a Meta não manda o campo', () => {
  const recent = [row({ frequency: '2.8', inline_link_click_ctr: undefined, inline_link_clicks: '100', impressions: '10000' })];
  const previous = [row({ inline_link_click_ctr: '1.5' })];
  const [result] = detectCreativeFatigue(recent, previous);
  assert.equal(result.ctr, 1);
});

test('alertas automáticos incluem criativos cansados vindos da coleta', async () => {
  const { generateAutomaticAlerts } = await import('../src/shared/utils/automaticAlerts.js');
  const tired = detectCreativeFatigue(
    [row({ frequency: '3.9', inline_link_click_ctr: '0.8' }), row({ ad_id: '2', ad_name: 'Criativo B', frequency: '2.8', inline_link_click_ctr: '1.1' })],
    [row(), row({ ad_id: '2' })],
  );
  const alerts = generateAutomaticAlerts({ accounts: [{ id: 'act_1', name: 'Cliente', platform: 'meta', creativeFatigue: tired }] });
  const alert = alerts.find((a) => a.type === 'creative_fatigue');
  assert.equal(alert.severity, 'danger');
  assert.equal(alert.value, 2);
  assert.match(alert.message, /2 criativos cansados \(1 para trocar já\)/);
  // Coleta que falhou (null) não gera alerta.
  assert.equal(generateAutomaticAlerts({ accounts: [{ id: 'act_1', platform: 'meta', creativeFatigue: null }] }).length, 0);
});
