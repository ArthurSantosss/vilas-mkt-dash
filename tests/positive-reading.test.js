import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPositiveReading } from '../src/shared/utils/positiveReading.js';
import { buildReportText } from '../src/shared/utils/reportText.js';
import { googleTextData } from '../src/shared/utils/googleReports.js';
import { instagramResolver } from '../api/_automatic-reports.js';

const NEGATIVE = /ca[ií]u|ca[ií]ram|queda|piorou|diminu|recuou|reduziu|abaixo|fraco|ruim/i;
const readingOf = text => text.split('📈 Leitura')[1].split('📍')[0];

const meta = (over = {}) => ({
  periodStart: '14/09/2026', periodEnd: '20/09/2026', spend: 500, conversations: 40, costPerConversation: 12.5,
  engagements: 900, costPerEngagement: 0.55, impressions: 30000, reach: 15000, cpm: 16.6, ctr: 1.4, clicks: 420, frequency: 2, ...over,
});

test('leitura nunca menciona queda, mesmo com todas as métricas piores', () => {
  const current = meta({ conversations: 10, costPerConversation: 50, ctr: 0.4, reach: 5000, cpm: 40, frequency: 4, clicks: 50 });
  const previous = meta();
  const text = buildReportText(current, { prev: previous, showCampaignName: false });
  const reading = readingOf(text);
  assert.doesNotMatch(reading, NEGATIVE);
  assert.doesNotMatch(reading, /cresceram|subiu/);
  assert.match(reading, /A conta gerou 10 conversas/);
});

test('sem resultado nem melhora, sai uma frase neutra de entrega', () => {
  const lines = buildPositiveReading({ platform: 'meta', objective: 'messages',
    current: { result: 0, costPerResult: 0, ctr: 0.3, reach: 100, impressions: 300, cpm: 30, frequency: 3 },
    previous: { result: 5, costPerResult: 10, ctr: 1, reach: 900, impressions: 2000, cpm: 10, frequency: 1.5 } });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /entrega constante/);
});

test('melhoras viram destaques com números, incluindo o melhor dia', () => {
  const text = buildReportText(meta({ conversations: 60, costPerConversation: 8.33, reach: 20000 }), {
    prev: meta(), showCampaignName: false,
    daily: [{ date: '2026-09-14', value: 5 }, { date: '2026-09-15', value: 20 }, { date: '2026-09-16', value: 9 }],
  });
  const reading = readingOf(text);
  assert.match(reading, /conversas cresceram 50% .*de 40 para 60/);
  assert.match(reading, /custo por conversa caiu 33%/);
  assert.match(reading, /melhor dia foi 15\/09, com 20 conversas/);
  assert.ok(reading.split('\n').filter(line => line.startsWith('- ')).length <= 5);
});

test('Instagram vinculado entra com seguidores e destaque de novos seguidores', () => {
  const instagram = { username: 'clinica', followers: 12345, gained: 87, gainedPrevious: 40,
    profileViews: { current: 300, previous: 200 }, reach: { current: 5000, previous: 7000 } };
  const text = buildReportText(meta(), { prev: meta(), showCampaignName: false, instagram });
  assert.match(text, /📸 Instagram \(@clinica\)/);
  assert.match(text, /Seguidores: 12\.345/);
  assert.match(text, /Novos seguidores no período: \+87/);
  assert.match(readingOf(text), /@clinica ganhou 87 novos seguidores, 118% a mais/);
  assert.match(readingOf(text), /visitas ao perfil do Instagram cresceram 50%/);
  assert.doesNotMatch(readingOf(text), /alcançadas/);

  const noGain = buildReportText(meta(), { showCampaignName: false, instagram: { ...instagram, gained: null } });
  assert.doesNotMatch(noGain, /Novos seguidores/);
  assert.doesNotMatch(buildReportText(meta(), { showCampaignName: false }), /Instagram/);
});

test('Google: leitura positiva e sem variação negativa de conversões', () => {
  const period = { startDate: '2026-09-14', endDate: '2026-09-20' };
  const current = googleTextData({ spend: 300, clicks: 100, impressions: 2000, conversions: 5 }, 'Busca', period);
  const previous = googleTextData({ spend: 300, clicks: 150, impressions: 3000, conversions: 12 }, '', period);
  const text = buildReportText(current, { prev: previous, objective: 'conversions' });
  assert.doesNotMatch(readingOf(text), NEGATIVE);
  assert.doesNotMatch(text, /variaram/);
  assert.match(text, /Leitura da semana/);
  assert.match(text, /CTR de 5,00% está acima da referência/);
});

test('falha no Instagram não derruba o relatório; conta sem vínculo nem consulta', async () => {
  const store = { get: async () => ({ act_1: '17841400000000001' }) };
  const calls = [];
  const resolve = instagramResolver(store, async (id, ranges) => { calls.push({ id, ranges }); throw new Error('sem permissão'); }, '2026-09-21');
  assert.equal(await resolve('act_1', { since: '2026-09-14', until: '2026-09-20' }), null);
  assert.deepEqual(calls[0].ranges.previous, { start: '2026-09-07', end: '2026-09-13' });
  assert.equal(await resolve('act_2', { since: '2026-09-14', until: '2026-09-20' }), null);
  assert.equal(calls.length, 1);
});
