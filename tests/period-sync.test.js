import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMetaPeriodTarget, getMetaInsightsField, getPreviousPeriodRange } from '../src/services/metaApi.js';
import { normalizePeriodToDateFilter } from '../api/google-ads-proxy.js';
import { PRESETS } from '../src/shared/utils/dateUtils.js';

test('resolução de períodos do Meta Ads cobre todos os presets do painel e custom', () => {
  // Presets nativos do Meta Graph API
  assert.deepEqual(resolveMetaPeriodTarget('today'), { type: 'preset', preset: 'today' });
  assert.deepEqual(resolveMetaPeriodTarget('yesterday'), { type: 'preset', preset: 'yesterday' });
  assert.deepEqual(resolveMetaPeriodTarget('7d'), { type: 'preset', preset: 'last_7d' });
  assert.deepEqual(resolveMetaPeriodTarget('14d'), { type: 'preset', preset: 'last_14d' });
  assert.deepEqual(resolveMetaPeriodTarget('30d'), { type: 'preset', preset: 'last_30d' });
  assert.deepEqual(resolveMetaPeriodTarget('month'), { type: 'preset', preset: 'this_month' });
  assert.deepEqual(resolveMetaPeriodTarget('last_month'), { type: 'preset', preset: 'last_month' });

  // Hoje e ontem deve virar time_range com datas reais (Meta não tem date_preset nativo)
  const todayYesterday = resolveMetaPeriodTarget('today_yesterday');
  assert.equal(todayYesterday.type, 'time_range');
  assert.match(todayYesterday.since, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(todayYesterday.until, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(todayYesterday.since <= todayYesterday.until, true);

  // Intervalo customizado
  const custom = resolveMetaPeriodTarget({ type: 'custom', startDate: '2026-05-01', endDate: '2026-05-15' });
  assert.deepEqual(custom, { type: 'time_range', since: '2026-05-01', until: '2026-05-15' });
});

test('getMetaInsightsField formata corretamente para date_preset e time_range', () => {
  assert.equal(getMetaInsightsField('7d'), 'insights.date_preset(last_7d)');
  assert.equal(getMetaInsightsField('14d'), 'insights.date_preset(last_14d)');
  assert.equal(getMetaInsightsField('month'), 'insights.date_preset(this_month)');
  assert.equal(getMetaInsightsField('last_month'), 'insights.date_preset(last_month)');

  const customField = getMetaInsightsField({ type: 'custom', startDate: '2026-04-10', endDate: '2026-04-20' });
  assert.equal(customField, "insights.time_range({'since':'2026-04-10','until':'2026-04-20'})");
});

test('todos os presets do PeriodSelector são aceitos no Google Ads e no Meta Ads', () => {
  for (const preset of PRESETS) {
    // Não deve lançar erro no Google Ads
    const googleFilter = normalizePeriodToDateFilter(preset.id);
    assert.match(googleFilter, /^segments\.date BETWEEN '\d{4}-\d{2}-\d{2}' AND '\d{4}-\d{2}-\d{2}'$/);

    // Não deve lançar erro no Meta Ads
    const metaTarget = resolveMetaPeriodTarget(preset.id);
    assert.ok(metaTarget.type === 'preset' || metaTarget.type === 'time_range');
  }
});

test('período anterior é calculado de forma estável para presets e custom', () => {
  const prevCustom = getPreviousPeriodRange({ type: 'custom', startDate: '2026-09-10', endDate: '2026-09-19' });
  assert.equal(prevCustom.type, 'custom');
  assert.equal(prevCustom.startDate, '2026-08-31');
  assert.equal(prevCustom.endDate, '2026-09-09');

  const prev7d = getPreviousPeriodRange('7d');
  assert.equal(prev7d.type, 'custom');
  assert.match(prev7d.startDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(prev7d.endDate, /^\d{4}-\d{2}-\d{2}$/);
});
