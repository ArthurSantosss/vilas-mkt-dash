import test from 'node:test';
import assert from 'node:assert/strict';
import {
  previousRange, presetRange, compare, toneFor, deltaText, derive, sumTotals,
  channelTotals, funnelSteps, fmtMoney, fmtRate, fmtDayMonth, fmtDDMMYY,
  buildTrafficModel, rangeTouchesToday, matchPreset,
} from '../src/shared/utils/trafficMetrics.js';
import { normalizeTrafficConfig, isBoostedCampaign, customConversionEvent, previousRange as serverPreviousRange } from '../api/_traffic-report-data.js';
import { validateRange, sanitizeSavedConfig } from '../api/traffic-report.js';

test('período anterior tem o mesmo tamanho e termina na véspera', () => {
  assert.deepEqual(previousRange({ start: '2026-10-05', end: '2026-10-11' }), { start: '2026-09-28', end: '2026-10-04' });
  assert.deepEqual(previousRange({ start: '2026-09-17', end: '2026-10-03' }), { start: '2026-08-31', end: '2026-09-16' });
  assert.deepEqual(serverPreviousRange({ start: '2026-09-17', end: '2026-10-03' }), { start: '2026-08-31', end: '2026-09-16' });
  assert.deepEqual(previousRange({ start: '2026-03-01', end: '2026-03-01' }), { start: '2026-02-28', end: '2026-02-28' });
});

test('atalhos de período', () => {
  const today = '2026-10-20';
  assert.deepEqual(presetRange('today', today), { start: '2026-10-20', end: '2026-10-20' });
  assert.equal(matchPreset({ start: '2026-10-20', end: '2026-10-20' }, today), 'today');
  assert.equal(rangeTouchesToday({ start: '2026-10-01', end: '2026-10-20' }, today), true);
  assert.equal(rangeTouchesToday({ start: '2026-10-01', end: '2026-10-19' }, today), false);
  assert.deepEqual(presetRange('last7', today), { start: '2026-10-13', end: '2026-10-19' });
  assert.deepEqual(presetRange('last30', today), { start: '2026-09-20', end: '2026-10-19' });
  assert.deepEqual(presetRange('lastMonth', today), { start: '2026-09-01', end: '2026-09-30' });
  assert.deepEqual(presetRange('thisMonth', today), { start: '2026-10-01', end: '2026-10-20' });
  assert.deepEqual(presetRange('lastMonth', '2026-01-15'), { start: '2025-12-01', end: '2025-12-31' });
});

test('derivadas vêm dos totais, nunca de média de médias', () => {
  const total = derive(sumTotals([
    { spend: 100, impressions: 1000, clicks: 100 }, // CTR 10%
    { spend: 100, impressions: 9000, clicks: 9 }, //   CTR 0,1%
  ]));
  assert.equal(total.ctr, 109 / 10000);
  assert.equal(total.cpc, 200 / 109);
  assert.equal(total.cpm, 20);
  assert.equal(derive({ spend: 0, impressions: 0, clicks: 0 }).ctr, null);
});

test('comparação em % e em p.p., com casos sem base', () => {
  assert.equal(compare(110, 100).state, 'up');
  assert.equal(deltaText(compare(110, 100)), '▲ 10,0%');
  assert.equal(deltaText(compare(0.081, 0.07, 'pp'), 'pp'), '▲ 1,1 p.p.');
  assert.equal(compare(5, 0).state, 'new');
  assert.equal(deltaText(compare(5, 0)), 'novo');
  assert.equal(compare(0, 0).state, 'none');
  assert.equal(compare(null, 3).state, 'none');
  assert.equal(deltaText(compare(4, null)), 'sem comparação');
});

test('cor segue a direção boa de cada métrica', () => {
  assert.equal(toneFor('cpc', compare(1, 2)), 'good');
  assert.equal(toneFor('ctr', compare(0.01, 0.02, 'pp')), 'bad');
  assert.equal(toneFor('conversions', compare(3, 1)), 'good');
  assert.equal(toneFor('spend', compare(3, 1)), 'neutral');
  assert.equal(toneFor('cpc', compare(3, 0)), 'neutral');
});

test('totais por canal separam posts turbinados e funil separa plataformas', () => {
  const snapshot = {
    meta: [
      { boosted: false, ads: [{ spend: 50, impressions: 500, clicks: 10, conversions: { lead: 4 } }] },
      { boosted: true, ads: [{ spend: 20, impressions: 900, clicks: 30, conversions: {} }] },
    ],
    google: [{ spend: 30, impressions: 100, clicks: 5, conversions: { Simular: 2.5 } }],
  };
  const totals = channelTotals(snapshot);
  assert.equal(totals.all.spend, 100);
  assert.equal(totals.metaAds.spend, 50);
  assert.equal(totals.metaBoosted.spend, 20);
  const steps = funnelSteps([{ label: 'Simular', meta: 'lead', google: 'Simular' }, { label: '', meta: 'x' }], totals, 'all');
  assert.equal(steps.length, 1);
  assert.equal(steps[0].total, 6.5);
  assert.deepEqual(steps[0].byPlatform, { meta: { event: 'lead', label: 'lead', value: 4 }, google: { event: 'Simular', label: 'Simular', value: 2.5 } });
  const googleOnly = funnelSteps([{ label: 'Simular', meta: 'lead', google: 'Simular' }], totals, 'google');
  assert.equal(googleOnly[0].total, 2.5);
  const failed = funnelSteps([{ label: 'Simular', meta: 'lead' }], totals, 'all', { metaOk: false });
  assert.equal(failed[0].total, null);
});

test('formatação brasileira', () => {
  assert.equal(fmtMoney(1234.56), 'R$ 1.234,56');
  assert.equal(fmtRate(0.081), '8,1%');
  assert.equal(fmtMoney(null), '—');
  assert.equal(fmtDayMonth('2026-10-05'), '05/out');
  assert.equal(fmtDDMMYY('2026-10-05'), '05/10/26');
});

test('config do link é normalizada e o intervalo validado', () => {
  const config = normalizeTrafficConfig({
    googleAccounts: ['123-456-7890', 'x'],
    audiences: [{ id: 'comprador', label: 'Comprador' }],
    funnels: { comprador: [{ label: 'Simular', meta: 'lead', google: '' }] },
  }, '999');
  assert.deepEqual(config.metaAccounts, ['act_999']);
  assert.deepEqual(config.googleAccounts, ['1234567890']);
  assert.deepEqual(config.funnels.comprador, [{ label: 'Simular', meta: 'lead', google: null, metaLabel: null, googleLabel: null }]);
  assert.deepEqual(Object.keys(normalizeTrafficConfig({}).funnels), ['geral']);
  assert.equal(validateRange('2026-09-17', '2026-10-03', '2026-10-20'), null);
  assert.match(validateRange('2026-10-21', '2026-10-22', '2026-10-20'), /futuro/);
  assert.match(validateRange('2026-10-05', '2026-10-01', '2026-10-20'), /anterior/);
});

test('post turbinado: criado do post e não duplicado de outra campanha', () => {
  assert.equal(isBoostedCampaign({ boosted_object_id: '1', source_campaign_id: '0' }), true);
  assert.equal(isBoostedCampaign({ boosted_object_id: '1' }), true);
  assert.equal(isBoostedCampaign({ boosted_object_id: '1', source_campaign_id: '120248104115080284' }), false);
  assert.equal(isBoostedCampaign({ source_campaign_id: '0' }), false);
});

test('configuração salva descarta campos desconhecidos e preserva id e link', () => {
  const saved = sanitizeSavedConfig({ name: '  Consórcio Market ', metaAccounts: ['1036091609039870'], token: 'x', shareId: 'forjado' },
    { id: 'abc', shareId: 'link1' });
  assert.equal(saved.id, 'abc');
  assert.equal(saved.shareId, 'link1');
  assert.equal(saved.name, 'Consórcio Market');
  assert.deepEqual(saved.metaAccounts, ['act_1036091609039870']);
  assert.equal(saved.token, undefined);
  assert.equal(sanitizeSavedConfig({}).shareId, null);
});

test('evento de origem da conversão personalizada vem da regra', () => {
  assert.equal(customConversionEvent('{"and":[{"event":{"eq":"simulator_cta_clicked"}},{"or":[{"URL":{"i_contains":"x"}}]}]}'), 'simulator_cta_clicked');
  assert.equal(customConversionEvent({ and: [{ event: { eq: 'proposal_submitted' } }] }), 'proposal_submitted');
  assert.equal(customConversionEvent('{"or":[{"URL":{"i_contains":"obrigado"}}]}'), null);
  assert.equal(customConversionEvent('nao-e-json'), null);
});

test('filtro de plataforma tira a outra plataforma do modelo inteiro', () => {
  const metaCampaign = { key: 'meta:1', boosted: false, ads: [{ spend: 100, impressions: 1000, clicks: 10, reach: 800, conversions: { lead: 4 } }] };
  const googleCampaign = { key: 'google:1', spend: 50, impressions: 500, clicks: 20, conversions: { Lead: 2 }, ads: [] };
  const core = {
    hasInstagram: true,
    meta: { accounts: [{ id: 'act_1', ok: true }], current: [metaCampaign], previous: [] },
    google: { accounts: [{ id: '1', ok: false, error: 'falhou' }], current: { campaigns: [googleCampaign], auction: [{ key: 'google:1' }] }, previous: { campaigns: [], auction: [] } },
  };
  const all = buildTrafficModel(core);
  assert.equal(all.platform, 'all');
  assert.equal(all.canFilterPlatform, true);
  assert.equal(all.allOk, false);
  assert.equal(all.totals.all.spend, 150);

  const meta = buildTrafficModel(core, null, false, 'meta');
  assert.equal(meta.hasGoogle, false);
  assert.equal(meta.allOk, true);
  assert.equal(meta.totals.all.spend, 100);
  assert.equal(meta.failures.length, 0);
  assert.equal(meta.cur.auction.length, 0);
  assert.equal(meta.hasInstagram, true);

  const google = buildTrafficModel(core, null, false, 'google');
  assert.equal(google.hasMeta, false);
  assert.equal(google.hasInstagram, false);
  assert.equal(google.totals.all.spend, 50);

  const onlyMeta = buildTrafficModel({ ...core, google: { accounts: [] } }, null, false, 'google');
  assert.equal(onlyMeta.platform, 'all');
  assert.equal(onlyMeta.canFilterPlatform, false);
  assert.equal(onlyMeta.hasMeta, true);
});

test('cada funil usa só as próprias campanhas, sem misturar gasto e conversões', () => {
  const ad = (spend, conversions) => ({ spend, impressions: 100, clicks: 10, reach: 50, conversions });
  const core = {
    audiences: [{ id: 'comprador', label: 'Comprador' }, { id: 'vendedor', label: 'Vendedor' }],
    funnels: {},
    meta: {
      accounts: [{ id: 'act_1', ok: true }],
      current: [
        { key: 'meta:1', audience: 'comprador', boosted: false, ads: [ad(100, { sim: 4 })] },
        { key: 'meta:2', audience: 'vendedor', boosted: false, ads: [ad(60, { sell: 3, sim: 1 })] },
        { key: 'meta:3', audience: null, boosted: false, ads: [ad(25, { sim: 9 })] },
      ],
      previous: [],
    },
    google: {
      accounts: [{ id: '1', ok: true }],
      current: { campaigns: [{ key: 'google:9', audience: 'vendedor', spend: 40, impressions: 10, clicks: 1, conversions: { Venda: 2 }, ads: [] }], auction: [{ key: 'google:9' }] },
      previous: { campaigns: [], auction: [] },
    },
  };
  const m = buildTrafficModel(core);
  assert.equal(m.byAudience.comprador.totals.all.spend, 100);
  assert.equal(m.byAudience.comprador.totals.meta.conversions.sim, 4);
  assert.equal(m.byAudience.vendedor.totals.all.spend, 100);
  assert.equal(m.byAudience.vendedor.totals.meta.conversions.sim, 1);
  assert.equal(m.byAudience.vendedor.cur.auction.length, 1);
  assert.equal(m.byAudience.comprador.cur.google.length, 0);
  assert.deepEqual(m.unassigned, { count: 1, spend: 25 });

  const single = buildTrafficModel({ ...core, audiences: [] });
  assert.equal(single.byAudience.geral.totals.all.spend, 225);
  assert.deepEqual(single.unassigned, { count: 0, spend: 0 });
});

test('plataforma única pode ser escolhida; plataforma sem conta volta para todas', () => {
  const core = { meta: { accounts: [{ id: 'act_1', ok: true }], current: [], previous: [] }, google: { accounts: [] } };
  assert.equal(buildTrafficModel(core, null, false, 'meta').platform, 'meta');
  assert.equal(buildTrafficModel(core, null, false, 'google').platform, 'all');
  assert.deepEqual(buildTrafficModel(core).platformAccounts, { meta: true, google: false });
});
