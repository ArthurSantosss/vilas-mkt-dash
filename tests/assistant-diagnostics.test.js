import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosis, diagnosticMetrics, diagnosticRanges, change } from '../api/_assistant-diagnosis.js';

const row = (extra = {}) => ({ spend: '200', impressions: '10000', frequency: '2', cpm: '20', inline_link_clicks: '100', inline_link_click_ctr: '1',
    actions: [{ action_type: 'lead', value: '20' }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '5' },
        { action_type: 'purchase', value: '2' }, { action_type: 'omni_purchase', value: '2' }], ...extra });
const ranges = diagnosticRanges('7d', new Date('2026-10-15T15:00:00Z'));
const diagnose = (extra = {}) => buildDiagnosis({ current: row(), previous: row(), profile: { conversao_principal: 'leads', meta_custo: 10 }, ranges, ...extra });

test('janelas de 14 dias são completas, contíguas e iguais no fuso da conta', () => {
    const result = diagnosticRanges('14d', new Date('2026-10-15T01:00:00Z'), 'America/Bahia');
    assert.deepEqual(result, { atual: { since: '2026-09-30', until: '2026-10-13' }, anterior: { since: '2026-09-16', until: '2026-09-29' } });
    for (const period of ['7d', '14d', '30d', 'month', 'yesterday']) {
        const r = diagnosticRanges(period, new Date('2026-03-31T12:00:00Z'));
        assert.equal(Date.parse(r.atual.until) - Date.parse(r.atual.since), Date.parse(r.anterior.until) - Date.parse(r.anterior.since));
        assert.ok(r.anterior.until < r.atual.since);
    }
    assert.equal(diagnosticRanges('month', new Date('2026-10-01T15:00:00Z')), null);
});

test('conversão principal seleciona evento sem somar aliases ou outros objetivos', () => {
    assert.equal(diagnosticMetrics(row(), 'leads').resultados, 20);
    assert.equal(diagnosticMetrics(row(), 'mensagens').resultados, 5);
    assert.equal(diagnosticMetrics(row(), 'compras').resultados, 2);
    assert.equal(diagnosticMetrics(row(), 'compras').custo_por_resultado, 100);
    assert.equal(diagnosticMetrics(row(), null).resultados, null);
});

test('dados ausentes, zero conversões e base zero permanecem distintos', () => {
    assert.equal(diagnosticMetrics(null, 'leads'), null);
    assert.equal(diagnosticMetrics(row({ actions: undefined }), 'leads').resultados, null);
    assert.equal(diagnosticMetrics(row({ actions: [] }), 'leads').resultados, 0);
    assert.equal(diagnosticMetrics(row({ actions: [] }), 'leads').custo_por_resultado, null);
    assert.equal(diagnosticMetrics(row({ spend: undefined }), 'leads').custo_por_resultado, null);
    assert.equal(change(10, 0), null);
    assert.equal(change(null, 10), null);
    assert.equal(diagnosticMetrics(row({ inline_link_click_ctr: undefined, inline_link_clicks: undefined }), 'leads').ctr_link, null);
});

test('sem ficha não inventa conversão, meta, desperdício ou escala', () => {
    const result = diagnose({ profile: null, ads: [row({ ad_id: 'a' })] });
    assert.equal(result.conversao_principal, null);
    assert.equal(result.revisao_de_gasto.referencia_custo, null);
    assert.equal(result.candidatos_a_teste_de_escala.length, 0);
    assert.match(result.limitacoes.join(' '), /Conversão principal não informada/);
});

test('baixo volume reduz confiança e não gera candidato a escala', () => {
    const little = row({ ad_id: 'a', actions: [{ action_type: 'lead', value: '1' }] });
    const result = diagnose({ current: little, ads: [little], previousAds: [little] });
    assert.equal(result.suficiencia.confianca, 'baixa');
    assert.equal(result.candidatos_a_teste_de_escala.length, 0);
    assert.match(result.evidencias[0].acao_sugerida, /mais resultados/);
});

test('revisão de gasto usa referência da conta e não R$15 fixos', () => {
    const ads = [row({ ad_id: 'novo', spend: '15', actions: [] }), row({ ad_id: 'revisar', spend: '350', actions: [] })];
    const result = diagnose({ profile: { conversao_principal: 'leads', meta_custo: 100 }, ads });
    assert.deepEqual(result.revisao_de_gasto.anuncios.map(ad => ad.id), ['revisar']);
    assert.match(result.revisao_de_gasto.acao, /não pausar/);
});

test('frequência isolada e anúncio novo não produzem hipótese de fadiga', () => {
    const current = row({ ad_id: 'a', frequency: '5', inline_link_click_ctr: '1' });
    assert.equal(diagnose({ ads: [current], previousAds: [row({ ad_id: 'a' })] }).hipoteses_fadiga.length, 0);
    const declining = { ...current, inline_link_click_ctr: '0.5' };
    assert.equal(diagnose({ ads: [declining], previousAds: [] }).hipoteses_fadiga.length, 0);
    assert.equal(diagnose({ ads: [declining], previousAds: [row({ ad_id: 'a' })] }).hipoteses_fadiga.length, 1);
});

test('falhas e atraso de conversão são explícitos, sem causalidade afirmada', () => {
    const result = diagnose({ current: row({ cpm: '30' }), limitations: ['anuncios_atuais: consulta falhou'], profile: { conversao_principal: 'leads', atraso_conversao_dias: 3 } });
    assert.equal(result.suficiencia.confianca, 'baixa');
    assert.match(result.limitacoes.join(' '), /consulta falhou/);
    assert.match(result.limitacoes.join(' '), /3 dias/);
    assert.equal(result.evidencias[0].causalidade, 'nao_comprovada');
});
