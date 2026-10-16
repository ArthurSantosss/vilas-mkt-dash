import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticMetrics } from '../api/_assistant-diagnosis.js';
import {
    adsetStructure, breakdownAnalysis, classifyBottlenecks, creativeSignals, dailyTrend, decomposeCostChange,
    funnelMetrics, googleBottlenecks, inferEvent, portfolioTriage, resolveEvent, targetGap,
} from '../api/_assistant-bottleneck.js';

const row = ({ spend = 1000, impressions = 100000, clicks = 1000, leads = 50, extra = [] } = {}) => ({
    spend: String(spend), impressions: String(impressions), inline_link_clicks: String(clicks), frequency: '2', reach: String(impressions / 2),
    actions: [{ action_type: 'lead', value: String(leads) }, ...extra],
});
const metrics = (opts) => diagnosticMetrics(row(opts), 'leads');

test('decomposição do custo é exata e aponta o fator dominante', () => {
    // CPM igual, CTR igual, resultados por clique caem pela metade → custo dobra pela conversão.
    const result = decomposeCostChange(metrics({ leads: 25 }), metrics({ leads: 50 }));
    assert.equal(result.disponivel, true);
    assert.equal(result.variacao_custo_por_resultado_pct, 100);
    assert.equal(result.fator_dominante, 'conversao_pos_clique');
    assert.equal(result.efeito_isolado_pct.entrega_cpm, 0);
    assert.equal(result.efeito_isolado_pct.atracao_ctr_link, 0);
    // CPM 50% maior com o resto igual → entrega.
    const cpm = decomposeCostChange(metrics({ spend: 1500, leads: 50 }), metrics({ spend: 1000, leads: 50 }));
    assert.equal(cpm.fator_dominante, 'entrega_cpm');
    assert.equal(cpm.efeito_isolado_pct.entrega_cpm, 50);
});

test('decomposição recusa períodos sem resultado em vez de inventar', () => {
    assert.equal(decomposeCostChange(metrics({ leads: 0 }), metrics()).disponivel, false);
    assert.equal(decomposeCostChange(null, metrics()).disponivel, false);
});

test('distância da meta calcula o necessário em cada alavanca', () => {
    // CPC = 1; 5% resultados/clique → custo 20. Meta 10 exige 10% por clique ou CTR dobrado ou CPM pela metade.
    const gap = targetGap(metrics(), 10);
    assert.equal(gap.custo_atual, 20);
    assert.equal(gap.resultados_por_clique_atual_pct, 5);
    assert.equal(gap.resultados_por_clique_necessario_pct, 10);
    assert.equal(gap.cpm_atual, 10);
    assert.equal(gap.cpm_maximo_com_ctr_e_conversao_atuais, 5);
    assert.equal(gap.ctr_link_necessario_com_cpm_e_conversao_atuais_pct, 2);
    assert.equal(targetGap(metrics(), null), null);
});

test('funil calcula passagens e trata vídeo ausente como indisponível', () => {
    const funnel = funnelMetrics(row({ extra: [
        { action_type: 'landing_page_view', value: '500' }, { action_type: 'omni_landing_page_view', value: '999' },
        { action_type: 'add_to_cart', value: '50' }, { action_type: 'initiate_checkout', value: '20' }, { action_type: 'purchase', value: '10' },
    ] }));
    assert.equal(funnel.visualizacoes_pagina, 500); // aliases não são somados
    assert.equal(funnel.taxas.clique_para_pagina_pct, 50);
    assert.equal(funnel.taxas.pagina_para_carrinho_pct, 10);
    assert.equal(funnel.taxas.checkout_para_compra_pct, 50);
    assert.equal(funnel.taxas.hook_rate_pct, null);
    const video = funnelMetrics({ ...row({ extra: [{ action_type: 'video_view', value: '30000' }] }),
        video_thruplay_watched_actions: [{ action_type: 'video_view', value: '6000' }] });
    assert.equal(video.taxas.hook_rate_pct, 30);
    assert.equal(video.taxas.hold_rate_pct, 20);
    assert.equal(funnelMetrics({ spend: '1' }).leads, null);
});

test('evento inferido pelo maior volume, ficha sempre prevalece', () => {
    const r = row({ leads: 3, extra: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '40' }] });
    assert.equal(inferEvent(r), 'mensagens');
    assert.deepEqual(resolveEvent({ conversao_principal: 'leads' }, r), { evento: 'leads', inferido: false });
    assert.deepEqual(resolveEvent(null, r), { evento: 'mensagens', inferido: true });
    assert.deepEqual(resolveEvent(null, { actions: [] }), { evento: null, inferido: false });
});

test('estrutura detecta aprendizado limitado, fragmentação e otimização de topo de funil', () => {
    const adset = (id, status, leads, goal = 'LEAD_GENERATION') => ({ id, name: id, effective_status: 'ACTIVE', optimization_goal: goal,
        learning_stage_info: { status }, insights: { data: [row({ spend: 100, leads })] } });
    const result = adsetStructure([adset('a', 'FAIL', 5), adset('b', 'FAIL', 5), adset('c', 'LEARNING', 5, 'LINK_CLICKS'), adset('d', 'SUCCESS', 80)], { event: 'leads', days: 7 });
    assert.equal(result.resumo.aprendizado_limitado, 2);
    assert.equal(result.resumo.gasto_em_aprendizado_limitado_pct, 50);
    assert.equal(result.resumo.fragmentacao_provavel, true);
    assert.equal(result.resumo.gasto_otimizando_topo_de_funil_pct, 25);
    assert.equal(result.conjuntos.find((c) => c.id === 'c').aprendizado, 'em_aprendizado');
});

test('criativos comparam com a mediana da conta e leem rankings da Meta', () => {
    const ad = (id, clicks, leads, ranking = 'AVERAGE', extra = {}) => ({ ad_id: id, ad_name: id, ...row({ spend: 100, impressions: 10000, clicks, leads }),
        engagement_rate_ranking: ranking, ...extra });
    const result = creativeSignals(
        [ad('bom', 200, 20), ad('medio', 150, 10), ad('fraco', 50, 0, 'BELOW_AVERAGE_20'), ad('fadiga', 150, 10, 'AVERAGE', { frequency: '4' })],
        [ad('fadiga', 300, 10)],
        { event: 'leads', reference: 10, now: new Date('2026-10-15') },
    );
    const byId = Object.fromEntries(result.anuncios.map((a) => [a.id, a]));
    assert.ok(byId.fraco.sinais.includes('ctr_abaixo_da_mediana_da_conta'));
    assert.ok(byId.fraco.sinais.includes('ranking_engajamento_abaixo'));
    assert.ok(byId.fraco.leitura_rankings[0].includes('gancho'));
    assert.ok(byId.bom.sinais.includes('destaque_consistente'));
    assert.ok(byId.fadiga.sinais.includes('possivel_fadiga'));
    assert.equal(result.resumo.gasto_com_ranking_engajamento_abaixo_pct, 25);
});

test('breakdown aponta segmentos que consomem mais do que entregam só com volume', () => {
    const seg = (position, spend, leads) => ({ publisher_platform: 'instagram', platform_position: position, ...row({ spend, leads }) });
    const result = breakdownAnalysis([seg('feed', 500, 40), seg('stories', 300, 18), seg('reels', 200, 2)], 'posicionamento', 'leads');
    const reels = result.segmentos.find((s) => s.segmento === 'instagram / reels');
    assert.equal(reels.sinal, 'consome_mais_do_que_entrega');
    assert.equal(result.segmentos[0].segmento, 'instagram / feed');
    const small = breakdownAnalysis([seg('feed', 500, 4), seg('reels', 500, 0)], 'posicionamento', 'leads');
    assert.equal(small.segmentos.every((s) => s.sinal === null), true);
});

test('tendência diária compara últimos 3 dias e lista dias sem entrega', () => {
    const day = (date, spend, leads) => ({ date_start: date, ...row({ spend, leads }) });
    const result = dailyTrend([day('2026-10-01', 100, 10), day('2026-10-02', 100, 10), day('2026-10-03', 0, 0),
        day('2026-10-04', 100, 5), day('2026-10-05', 100, 5), day('2026-10-06', 100, 5)], 'leads');
    assert.deepEqual(result.dias_sem_entrega, ['2026-10-03']);
    assert.equal(result.ultimos_3_dias.custo_por_resultado, 20);
    assert.equal(result.dias_anteriores.custo_por_resultado, 10);
    assert.equal(result.variacao_ultimos_3_dias_pct.custo_por_resultado, 100);
});

test('classificação prioriza gargalos com evidência', () => {
    const current = metrics({ leads: 25 });
    const previous = metrics({ leads: 50 });
    const funnel = funnelMetrics(row({ extra: [{ action_type: 'landing_page_view', value: '300' }] }));
    const result = classifyBottlenecks({ current, previous, funnel, previousFunnel: null,
        decomposition: decomposeCostChange(current, previous), goal: targetGap(current, 30), structure: null, creatives: null });
    assert.equal(result.principal.etapa, 'conversao');
    assert.equal(result.principal.severidade, 'alta');
    assert.ok(result.gargalos.some((g) => g.etapa === 'pos_clique'));
    const calm = classifyBottlenecks({ current: previous, previous, funnel: null, previousFunnel: null,
        decomposition: decomposeCostChange(previous, previous), goal: null, structure: null, creatives: null });
    assert.equal(calm.sem_gargalo_claro, true);
});

test('triagem da carteira ordena por atenção e não trata falha como zero', () => {
    const result = portfolioTriage([
        { conta: 'Parada', id: '1', evento: 'leads', meta: 10, atual: metrics({ spend: 0, impressions: 0, clicks: 0, leads: 0 }), anterior: metrics() },
        { conta: 'Cara', id: '2', evento: 'leads', meta: 10, atual: metrics({ leads: 40 }), anterior: metrics({ leads: 60 }) },
        { conta: 'Boa', id: '3', evento: 'leads', meta: 30, atual: metrics({ leads: 60 }), anterior: metrics({ leads: 60 }) },
        { conta: 'Erro', id: '4', evento: 'leads', meta: 10, atual: null, anterior: null, erro: 'timeout' },
    ]);
    assert.equal(result.precisam_atencao[0].conta, 'Parada');
    assert.ok(result.precisam_atencao.find((a) => a.conta === 'Cara').alertas.some((a) => a.codigo === 'acima_da_meta'));
    assert.ok(!result.precisam_atencao.find((a) => a.conta === 'Erro').alertas.some((a) => a.codigo === 'parou_de_entregar'));
    assert.deepEqual(result.sem_alertas, [{ conta: 'Boa', id: '3', oportunidade: true }]);
});

test('Google separa perda por orçamento e ranking e lista termos sem conversão', () => {
    const result = googleBottlenecks({
        campaigns: [
            { campaign: { id: 1, name: 'Marca' }, metrics: { costMicros: '500000000', conversions: 50, searchImpressionShare: 0.6, searchBudgetLostImpressionShare: 0.35, searchRankLostImpressionShare: 0.05 } },
            { campaign: { id: 2, name: 'Genérica' }, metrics: { costMicros: '500000000', conversions: 10, searchImpressionShare: 0.3, searchBudgetLostImpressionShare: 0.1, searchRankLostImpressionShare: 0.6 } },
        ],
        searchTerms: [
            { searchTermView: { searchTerm: 'gratis' }, campaign: { name: 'Genérica' }, metrics: { costMicros: '80000000', clicks: 40, conversions: 0 } },
            { searchTermView: { searchTerm: 'barato' }, campaign: { name: 'Genérica' }, metrics: { costMicros: '5000000', clicks: 3, conversions: 0 } },
        ],
        keywords: [{ adGroupCriterion: { keyword: { text: 'curso' }, qualityInfo: { qualityScore: 3, postClickQualityScore: 'BELOW_AVERAGE' } }, metrics: { costMicros: '10000000' } }],
    });
    assert.equal(result.referencia_custo, 16.67);
    assert.equal(result.sinais_campanhas.find((s) => s.campanha === 'Marca').sinal, 'limitada_por_orcamento_e_eficiente');
    assert.equal(result.sinais_campanhas.find((s) => s.campanha === 'Genérica').sinal, 'perde_por_ranking');
    assert.deepEqual(result.termos_sem_conversao.map((t) => t.termo), ['gratis']);
    assert.equal(result.palavras_indice_baixo[0].experiencia_pagina, 'BELOW_AVERAGE');
});
