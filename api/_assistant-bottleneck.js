// Cálculos determinísticos de gargalo: a IA interpreta estas evidências, não inventa métricas.
// Todos os limiares aqui são de TRIAGEM heurística (não são significância estatística nem ordem de ação).
import { EVENTS, change, diagnosticMetrics } from './_assistant-diagnosis.js';

const num = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const round = (value, digits = 2) => value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
const pct = (part, total) => part != null && total > 0 ? round(part / total * 100) : null;
const median = (values) => {
    const sorted = values.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Campo actions ausente é desconhecido (null); presente sem o tipo é zero. Aliases nunca são somados.
function firstAction(list, types) {
    if (!Array.isArray(list)) return null;
    const found = types.map((type) => list.find((a) => a.action_type === type)).find(Boolean);
    return found ? num(found.value) : 0;
}

export const FUNNEL_ACTIONS = {
    visualizacoes_pagina: ['landing_page_view', 'omni_landing_page_view'],
    adicoes_carrinho: ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'],
    checkouts: ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'],
    compras: EVENTS.compras,
    leads: EVENTS.leads,
    mensagens: EVENTS.mensagens,
};

const LIMITS = {
    clique_para_pagina_baixo_pct: 60, // abaixo disso, perda relevante entre clique e carregamento da página
    min_cliques_funil: 100,
    min_paginas_funil: 100,
    queda_relevante_pct: -20,
    variacao_custo_media_pct: 15,
    variacao_custo_alta_pct: 30,
    eventos_semana_aprendizado: 50, // referência pública da Meta para sair do aprendizado
    min_impressoes_criativo: 1000,
    fracao_mediana_baixa: 0.7,
};

// Contagem por etapa do funil e taxas de passagem. Hook/hold só existem para vídeo.
export function funnelMetrics(row) {
    if (!row) return null;
    const spend = num(row.spend);
    const impressions = num(row.impressions);
    const clicks = num(row.inline_link_clicks);
    const counts = Object.fromEntries(Object.entries(FUNNEL_ACTIONS).map(([key, types]) => [key, firstAction(row.actions, types)]));
    const views3s = firstAction(row.actions, ['video_view']) || null;
    const thruplays = firstAction(row.video_thruplay_watched_actions, ['video_view']) || null;
    const revenue = firstAction(row.action_values, EVENTS.compras);
    const pages = counts.visualizacoes_pagina > 0 ? counts.visualizacoes_pagina : null;
    return {
        investimento: spend, impressoes: impressions, cliques_link: clicks, ...counts,
        valor_compras: revenue || null,
        roas: revenue > 0 && spend > 0 ? round(revenue / spend) : null,
        taxas: {
            ctr_link_pct: pct(clicks, impressions),
            clique_para_pagina_pct: pct(pages, clicks),
            pagina_para_carrinho_pct: pct(counts.adicoes_carrinho, pages),
            carrinho_para_checkout_pct: counts.adicoes_carrinho > 0 ? pct(counts.checkouts, counts.adicoes_carrinho) : null,
            checkout_para_compra_pct: counts.checkouts > 0 ? pct(counts.compras, counts.checkouts) : null,
            pagina_para_compra_pct: pct(counts.compras, pages),
            pagina_para_lead_pct: pct(counts.leads, pages),
            clique_para_mensagem_pct: pct(counts.mensagens, clicks),
            hook_rate_pct: pct(views3s, impressions),
            hold_rate_pct: pct(thruplays, views3s),
        },
    };
}

// Evento predominante quando a ficha não informa: sempre sinalizado como inferido.
export function inferEvent(row) {
    const totals = Object.keys(EVENTS).map((event) => [event, diagnosticMetrics(row, event)?.resultados || 0]);
    const [event, total] = totals.sort((a, b) => b[1] - a[1])[0];
    return total > 0 ? event : null;
}

export function resolveEvent(profile, row) {
    if (profile?.conversao_principal) return { evento: profile.conversao_principal, inferido: false };
    const evento = inferEvent(row);
    return { evento, inferido: Boolean(evento) };
}

// Custo por resultado = CPM × (1 / CTR) × (1 / resultados por clique). A variação em log é exata,
// então cada fator mostra quanto o custo teria mudado só por ele.
export function decomposeCostChange(current, previous) {
    const raw = (m) => m && m.investimento > 0 && m.impressoes > 0 && m.cliques_link > 0 && m.resultados > 0
        ? { cpm: m.investimento / m.impressoes, ctr: m.cliques_link / m.impressoes, rpc: m.resultados / m.cliques_link, cpr: m.investimento / m.resultados }
        : null;
    const now = raw(current);
    const before = raw(previous);
    if (!now || !before) {
        return { disponivel: false, motivo: 'Requer investimento, impressões, cliques no link e resultados maiores que zero nos dois períodos.' };
    }
    const factors = {
        entrega_cpm: Math.log(now.cpm / before.cpm),
        atracao_ctr_link: -Math.log(now.ctr / before.ctr),
        conversao_pos_clique: -Math.log(now.rpc / before.rpc),
    };
    const effect = (value) => round((Math.exp(value) - 1) * 100);
    const [dominant, value] = Object.entries(factors).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    return {
        disponivel: true,
        variacao_custo_por_resultado_pct: effect(Math.log(now.cpr / before.cpr)),
        efeito_isolado_pct: Object.fromEntries(Object.entries(factors).map(([key, v]) => [key, effect(v)])),
        fator_dominante: dominant,
        direcao_fator_dominante: value > 0 ? 'encareceu' : 'barateou',
        leitura: 'Efeito isolado positivo = aquele fator encareceu o resultado. Mostra onde a mudança aconteceu, não por que aconteceu.',
    };
}

// Quanto cada alavanca precisaria render para atingir a meta da ficha, mantendo as outras constantes.
export function targetGap(metrics, goal) {
    if (!(goal > 0) || !metrics || !(metrics.investimento > 0) || !(metrics.impressoes > 0) || !(metrics.cliques_link > 0)) return null;
    const cpc = metrics.investimento / metrics.cliques_link;
    const ctr = metrics.cliques_link / metrics.impressoes;
    const rpc = metrics.resultados > 0 ? metrics.resultados / metrics.cliques_link : null;
    const cpm = metrics.investimento / metrics.impressoes * 1000;
    return {
        meta_custo: goal,
        custo_atual: metrics.resultados > 0 ? round(metrics.investimento / metrics.resultados) : null,
        cpc_link_atual: round(cpc),
        resultados_por_clique_atual_pct: rpc != null ? round(rpc * 100) : null,
        resultados_por_clique_necessario_pct: round(cpc / goal * 100),
        cpm_atual: round(cpm),
        cpm_maximo_com_ctr_e_conversao_atuais: rpc != null ? round(goal * ctr * rpc * 1000) : null,
        ctr_link_atual_pct: round(ctr * 100),
        ctr_link_necessario_com_cpm_e_conversao_atuais_pct: rpc != null ? round(cpm / (1000 * goal * rpc) * 100) : null,
        leitura: 'Cada valor "necessário" supõe as demais alavancas constantes. Use para dimensionar o tamanho do ajuste, não como promessa.',
    };
}

const LEARNING = { LEARNING: 'em_aprendizado', SUCCESS: 'estavel', FAIL: 'aprendizado_limitado' };
const UPPER_FUNNEL_GOALS = ['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'REACH', 'IMPRESSIONS', 'POST_ENGAGEMENT', 'THRUPLAY', 'PROFILE_VISIT'];

// Estrutura de conjuntos: aprendizado, volume de eventos e alinhamento da otimização com o objetivo.
export function adsetStructure(adsets, { event, days }) {
    const rows = (adsets || []).map((adset) => {
        const metrics = diagnosticMetrics(adset.insights?.data?.[0], event);
        const weekly = metrics?.resultados != null && days > 0 ? round(metrics.resultados / days * 7, 1) : null;
        const goal = adset.optimization_goal || null;
        return {
            id: adset.id, nome: adset.name, campanha_id: adset.campaign_id, status: adset.effective_status,
            otimizacao: goal, estrategia_lance: adset.bid_strategy || null,
            orcamento_diario: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
            aprendizado: LEARNING[adset.learning_stage_info?.status] || (adset.learning_stage_info ? 'desconhecido' : null),
            resultados_por_semana_estimado: weekly,
            otimizacao_topo_de_funil: Boolean(event && goal && UPPER_FUNNEL_GOALS.includes(goal)),
            metricas: metrics,
        };
    }).sort((a, b) => (b.metricas?.investimento || 0) - (a.metricas?.investimento || 0));
    const delivering = rows.filter((r) => r.metricas?.investimento > 0);
    const totalSpend = delivering.reduce((sum, r) => sum + r.metricas.investimento, 0);
    const spendShare = (list) => totalSpend > 0 ? pct(list.reduce((s, r) => s + r.metricas.investimento, 0), totalSpend) : null;
    const limited = delivering.filter((r) => r.aprendizado === 'aprendizado_limitado');
    const learning = delivering.filter((r) => r.aprendizado === 'em_aprendizado');
    const lowVolume = delivering.filter((r) => r.resultados_por_semana_estimado != null && r.resultados_por_semana_estimado < LIMITS.eventos_semana_aprendizado);
    const upper = delivering.filter((r) => r.otimizacao_topo_de_funil);
    return {
        resumo: {
            conjuntos_com_entrega: delivering.length,
            em_aprendizado: learning.length,
            aprendizado_limitado: limited.length,
            gasto_em_aprendizado_limitado_pct: spendShare(limited),
            conjuntos_abaixo_de_50_eventos_semana: lowVolume.length,
            gasto_otimizando_topo_de_funil_pct: spendShare(upper),
            fragmentacao_provavel: delivering.length >= 4 && lowVolume.length / delivering.length >= 0.5,
            referencia: 'A Meta indica ~50 eventos de otimização por conjunto por semana para estabilizar a entrega. Estimativa usa o evento da ficha, que pode diferir do evento otimizado.',
        },
        conjuntos: rows,
    };
}

const BELOW = (ranking) => typeof ranking === 'string' && ranking.startsWith('BELOW_AVERAGE');
const RANKING_READING = {
    quality_ranking: 'qualidade percebida do anúncio abaixo dos concorrentes do mesmo público',
    engagement_rate_ranking: 'engajamento esperado abaixo: gancho/criativo menos atraente que os concorrentes',
    conversion_rate_ranking: 'taxa de conversão esperada abaixo: possível desalinhamento entre promessa do anúncio, oferta e página',
};

// Sinais por anúncio comparados com a própria conta (mediana), não com limites universais.
export function creativeSignals(ads, previousAds, { event, reference, now = new Date() }) {
    const before = new Map((previousAds || []).map((row) => [row.ad_id, row]));
    const rows = (ads || []).map((row) => {
        const metrics = diagnosticMetrics(row, event);
        const funnel = funnelMetrics(row);
        const old = before.get(row.ad_id);
        const oldMetrics = old ? diagnosticMetrics(old, event) : null;
        const created = row.created_time ? Date.parse(row.created_time) : NaN;
        return {
            id: row.ad_id, nome: row.ad_name, conjunto: row.adset_name, campanha: row.campaign_name,
            formato: row.object_type || null,
            dias_no_ar: Number.isFinite(created) ? Math.max(0, Math.floor((now.getTime() - created) / 86400000)) : null,
            metricas: metrics,
            hook_rate_pct: funnel.taxas.hook_rate_pct, hold_rate_pct: funnel.taxas.hold_rate_pct,
            rankings: { qualidade: row.quality_ranking || null, engajamento: row.engagement_rate_ranking || null, conversao: row.conversion_rate_ranking || null },
            variacao_ctr_link_pct: oldMetrics ? change(metrics.ctr_link, oldMetrics.ctr_link) : null,
            variacao_frequencia_pct: oldMetrics ? change(metrics.frequencia, oldMetrics.frequencia) : null,
            _raw: row,
        };
    });
    const eligible = rows.filter((r) => r.metricas.impressoes >= LIMITS.min_impressoes_criativo);
    const ctrMedian = median(eligible.map((r) => r.metricas.ctr_link));
    const hookMedian = median(eligible.map((r) => r.hook_rate_pct));
    const totalSpend = rows.reduce((sum, r) => sum + (r.metricas.investimento || 0), 0);
    for (const ad of rows) {
        const flags = [];
        const leituras = [];
        for (const [field, label] of [['quality_ranking', 'qualidade'], ['engagement_rate_ranking', 'engajamento'], ['conversion_rate_ranking', 'conversao']]) {
            if (BELOW(ad._raw[field])) { flags.push(`ranking_${label}_abaixo`); leituras.push(RANKING_READING[field]); }
        }
        const enough = ad.metricas.impressoes >= LIMITS.min_impressoes_criativo;
        if (enough && ctrMedian && ad.metricas.ctr_link != null && ad.metricas.ctr_link < ctrMedian * LIMITS.fracao_mediana_baixa) flags.push('ctr_abaixo_da_mediana_da_conta');
        if (enough && hookMedian && ad.hook_rate_pct != null && ad.hook_rate_pct < hookMedian * LIMITS.fracao_mediana_baixa) flags.push('hook_abaixo_da_mediana_da_conta');
        if (ad.variacao_ctr_link_pct != null && ad.variacao_ctr_link_pct <= LIMITS.queda_relevante_pct && ad.variacao_frequencia_pct > 0) flags.push('possivel_fadiga');
        if (reference > 0 && ad.metricas.resultados === 0 && ad.metricas.investimento >= 3 * reference) flags.push('gasto_sem_resultado');
        if (reference > 0 && ad.metricas.custo_por_resultado != null && ad.metricas.custo_por_resultado <= reference) {
            if (ad.metricas.resultados >= 10) flags.push('destaque_consistente');
            else if (ad.metricas.resultados >= 5) flags.push('destaque_inicial');
        }
        ad.participacao_gasto_pct = pct(ad.metricas.investimento, totalSpend);
        ad.sinais = flags;
        ad.leitura_rankings = leituras;
        delete ad._raw;
    }
    rows.sort((a, b) => (b.metricas.investimento || 0) - (a.metricas.investimento || 0));
    const spendWith = (predicate) => pct(rows.filter(predicate).reduce((s, r) => s + (r.metricas.investimento || 0), 0), totalSpend);
    return {
        resumo: {
            anuncios_com_entrega: rows.filter((r) => r.metricas.investimento > 0).length,
            mediana_ctr_link_pct: round(ctrMedian),
            mediana_hook_rate_pct: round(hookMedian),
            gasto_top_anuncio_pct: rows[0]?.participacao_gasto_pct ?? null,
            gasto_com_ranking_engajamento_abaixo_pct: spendWith((r) => r.sinais.includes('ranking_engajamento_abaixo')),
            gasto_com_ranking_conversao_abaixo_pct: spendWith((r) => r.sinais.includes('ranking_conversao_abaixo')),
            gasto_com_ranking_qualidade_abaixo_pct: spendWith((r) => r.sinais.includes('ranking_qualidade_abaixo')),
            gasto_em_possivel_fadiga_pct: spendWith((r) => r.sinais.includes('possivel_fadiga')),
            referencia_custo: reference || null,
            criterios: 'Mediana calculada só com anúncios de 1.000+ impressões; "abaixo" = menos de 70% da mediana. Rankings são da Meta (exigem ~500 impressões). Destaque exige custo dentro da referência.',
        },
        anuncios: rows,
    };
}

export const BREAKDOWNS = {
    posicionamento: 'publisher_platform,platform_position',
    plataforma: 'publisher_platform',
    idade_genero: 'age,gender',
    idade: 'age',
    genero: 'gender',
    dispositivo: 'impression_device',
    regiao: 'region',
    horario: 'hourly_stats_aggregated_by_advertiser_time_zone',
};

// Compara participação no gasto com participação nos resultados por segmento.
export function breakdownAnalysis(rows, dimension, event) {
    const keys = BREAKDOWNS[dimension].split(',');
    const segments = (rows || []).map((row) => ({ segmento: keys.map((k) => row[k] ?? '?').join(' / '), metricas: diagnosticMetrics(row, event) }));
    const totalSpend = segments.reduce((s, r) => s + (r.metricas.investimento || 0), 0);
    const totalResults = segments.reduce((s, r) => s + (r.metricas.resultados || 0), 0);
    const enoughVolume = totalResults >= 10;
    const out = segments.map((s) => {
        const spendShare = pct(s.metricas.investimento, totalSpend);
        const resultShare = event ? pct(s.metricas.resultados, totalResults) : null;
        const index = spendShare > 0 && resultShare != null ? round(resultShare / spendShare) : null;
        let sinal = null;
        if (enoughVolume && index != null && spendShare >= 10 && index < 0.6) sinal = 'consome_mais_do_que_entrega';
        else if (enoughVolume && index != null && spendShare >= 5 && index > 1.4) sinal = 'entrega_mais_do_que_consome';
        return { ...s, participacao_gasto_pct: spendShare, participacao_resultados_pct: resultShare, indice_eficiencia: index, sinal };
    }).sort((a, b) => (b.metricas.investimento || 0) - (a.metricas.investimento || 0));
    return {
        dimensao: dimension,
        total_resultados: event ? totalResults : null,
        volume_suficiente: enoughVolume,
        segmentos: out.slice(0, 25),
        criterio: 'Índice = participação nos resultados ÷ participação no gasto. Abaixo de 0,6 com 10%+ do gasto, ou acima de 1,4 com 5%+, exige 10+ resultados no total. Atribuição por segmento é modelada pela Meta.',
    };
}

// Série diária: tendência recente contra o restante da janela e dias sem entrega.
export function dailyTrend(rows, event) {
    const days = (rows || []).map((row) => ({ data: row.date_start, ...diagnosticMetrics(row, event) }))
        .sort((a, b) => a.data.localeCompare(b.data));
    const sum = (list, key) => list.reduce((s, d) => s + (d[key] || 0), 0);
    const block = (list) => {
        const spend = sum(list, 'investimento');
        const impressions = sum(list, 'impressoes');
        const clicks = sum(list, 'cliques_link');
        const results = event ? sum(list, 'resultados') : null;
        return {
            dias: list.length, investimento_medio_dia: list.length ? round(spend / list.length) : null,
            cpm: impressions > 0 ? round(spend / impressions * 1000) : null,
            ctr_link: impressions > 0 ? round(clicks / impressions * 100) : null,
            resultados_por_dia: results != null && list.length ? round(results / list.length) : null,
            custo_por_resultado: results > 0 ? round(spend / results) : null,
        };
    };
    const recent = days.slice(-3);
    const rest = days.slice(0, -3);
    const a = block(recent);
    const b = block(rest);
    return {
        dias: days.map((d) => ({ data: d.data, investimento: d.investimento, resultados: d.resultados, custo_por_resultado: d.custo_por_resultado,
            cpm: d.cpm, ctr_link: d.ctr_link, frequencia: d.frequencia })),
        ultimos_3_dias: a,
        dias_anteriores: b,
        variacao_ultimos_3_dias_pct: rest.length ? Object.fromEntries(Object.keys(a).filter((k) => k !== 'dias').map((k) => [k, change(a[k], b[k])])) : null,
        dias_sem_entrega: days.filter((d) => !(d.investimento > 0)).map((d) => d.data),
        observacao: 'Dias recentes podem estar incompletos pela janela de atribuição; trate variações dos últimos dias como sinal a confirmar.',
    };
}

const SEVERITY = { alta: 3, media: 2, baixa: 1 };

// Classifica onde o funil está travando. Cada gargalo traz evidência e a próxima ferramenta de investigação.
export function classifyBottlenecks({ current, previous, funnel, previousFunnel, decomposition, goal, structure, creatives }) {
    const found = [];
    const add = (etapa, severidade, sinal, evidencia, investigar) => found.push({ etapa, severidade, sinal, evidencia, investigar });

    if (decomposition?.disponivel && decomposition.variacao_custo_por_resultado_pct >= LIMITS.variacao_custo_media_pct) {
        const stage = { entrega_cpm: 'entrega', atracao_ctr_link: 'atracao', conversao_pos_clique: 'conversao' }[decomposition.fator_dominante];
        const next = { entrega: 'get_breakdown (posicionamento) e get_daily_trend', atracao: 'analyze_creatives', conversao: 'funil pós-clique e analyze_creatives (ranking de conversão)' }[stage];
        add(stage, decomposition.variacao_custo_por_resultado_pct >= LIMITS.variacao_custo_alta_pct ? 'alta' : 'media',
            `Custo por resultado subiu ${decomposition.variacao_custo_por_resultado_pct}%, puxado principalmente por ${decomposition.fator_dominante}.`,
            decomposition.efeito_isolado_pct, next);
    }

    const rate = funnel?.taxas?.clique_para_pagina_pct;
    if (rate != null && funnel.cliques_link >= LIMITS.min_cliques_funil && rate < LIMITS.clique_para_pagina_baixo_pct) {
        add('pos_clique', rate < 40 ? 'alta' : 'media', `Só ${rate}% dos cliques no link viram visualização de página.`,
            { cliques_link: funnel.cliques_link, visualizacoes_pagina: funnel.visualizacoes_pagina, taxa_pct: rate },
            'velocidade/carregamento da página, redirecionamentos, pixel e cliques acidentais por posicionamento (get_breakdown posicionamento)');
    }
    const previousRate = previousFunnel?.taxas?.clique_para_pagina_pct;
    if (rate != null && previousRate != null && change(rate, previousRate) <= LIMITS.queda_relevante_pct) {
        add('pos_clique', 'media', `Taxa clique→página caiu de ${previousRate}% para ${rate}%.`,
            { atual: rate, anterior: previousRate }, 'mudanças no site, domínio ou pixel no período');
    }
    for (const [key, label] of [['pagina_para_lead_pct', 'página→lead'], ['pagina_para_carrinho_pct', 'página→carrinho'], ['pagina_para_compra_pct', 'página→compra']]) {
        const now = funnel?.taxas?.[key];
        const old = previousFunnel?.taxas?.[key];
        if (now != null && old != null && funnel.visualizacoes_pagina >= LIMITS.min_paginas_funil && change(now, old) <= LIMITS.queda_relevante_pct) {
            add('conversao', 'media', `Taxa ${label} caiu de ${old}% para ${now}%.`, { atual: now, anterior: old },
                'oferta, preço, formulário/checkout e coerência entre anúncio e página');
        }
    }

    if (current && previous && change(current.frequencia, previous.frequencia) >= 25 && change(current.alcance, previous.alcance) <= -15) {
        add('entrega', 'media', 'Frequência subiu enquanto o alcance caiu: possível saturação do público.',
            { frequencia: [previous.frequencia, current.frequencia], alcance: [previous.alcance, current.alcance] },
            'get_breakdown (idade_genero/regiao) e analyze_adsets (públicos)');
    }

    const s = structure?.resumo;
    if (s?.gasto_em_aprendizado_limitado_pct >= 30) {
        add('estrutura', 'alta', `${s.gasto_em_aprendizado_limitado_pct}% do gasto está em conjuntos com aprendizado limitado.`, s, 'analyze_adsets');
    } else if (s?.fragmentacao_provavel) {
        add('estrutura', 'media', `${s.conjuntos_abaixo_de_50_eventos_semana} de ${s.conjuntos_com_entrega} conjuntos com entrega estão abaixo de ~50 eventos/semana.`, s, 'analyze_adsets');
    }
    if (s?.gasto_otimizando_topo_de_funil_pct >= 30) {
        add('estrutura', 'media', `${s.gasto_otimizando_topo_de_funil_pct}% do gasto otimiza para evento de topo de funil (clique, alcance, engajamento).`, s, 'analyze_adsets');
    }

    const c = creatives?.resumo;
    if (c?.gasto_com_ranking_engajamento_abaixo_pct >= 40) {
        add('atracao', 'media', `${c.gasto_com_ranking_engajamento_abaixo_pct}% do gasto está em anúncios com ranking de engajamento abaixo da média.`, c, 'analyze_creatives');
    }
    if (c?.gasto_com_ranking_conversao_abaixo_pct >= 40) {
        add('conversao', 'media', `${c.gasto_com_ranking_conversao_abaixo_pct}% do gasto está em anúncios com ranking de conversão abaixo da média.`, c, 'analyze_creatives e funil pós-clique');
    }
    if (c?.gasto_em_possivel_fadiga_pct >= 30) {
        add('atracao', 'media', `${c.gasto_em_possivel_fadiga_pct}% do gasto está em anúncios com queda de CTR e frequência subindo.`, c, 'analyze_creatives');
    }

    if (goal && goal.custo_atual != null && goal.custo_atual > goal.meta_custo && !found.some((f) => f.severidade === 'alta')) {
        add('meta', goal.custo_atual > goal.meta_custo * 1.3 ? 'alta' : 'media',
            `Custo atual ${goal.custo_atual} acima da meta ${goal.meta_custo}.`, goal,
            'comparar o tamanho do ajuste necessário em CPM, CTR e conversão (distancia_da_meta)');
    }

    found.sort((a, b) => SEVERITY[b.severidade] - SEVERITY[a.severidade]);
    return {
        principal: found[0] || null,
        gargalos: found,
        sem_gargalo_claro: found.length === 0,
        natureza: 'Triagem heurística: localiza a etapa, não comprova a causa.',
    };
}

// Triagem da carteira: o que olhar primeiro hoje, por conta.
export function portfolioTriage(entries) {
    const accounts = entries.map((entry) => {
        const { atual, anterior, meta } = entry;
        const alerts = [];
        const alert = (peso, codigo, texto) => alerts.push({ peso, codigo, texto });
        if (entry.erro) alert(2, 'erro_leitura', entry.erro);
        if (atual && anterior && !(atual.investimento > 0) && anterior.investimento > 0) alert(8, 'parou_de_entregar', 'Sem investimento no período atual, mas houve no anterior (verificar pagamento, reprovações e orçamento).');
        if (atual && anterior && anterior.investimento > 0 && change(atual.investimento, anterior.investimento) <= -50 && atual.investimento > 0) alert(3, 'entrega_caiu', `Investimento caiu ${change(atual.investimento, anterior.investimento)}%.`);
        const reference = meta > 0 ? meta : (anterior?.resultados >= 10 ? anterior.custo_por_resultado : null);
        if (reference > 0 && atual?.resultados === 0 && atual.investimento >= 3 * reference) alert(5, 'gasto_sem_resultado', `Investiu ${atual.investimento} sem resultados (referência de custo ${reference}).`);
        if (meta > 0 && atual?.custo_por_resultado > meta) alert(atual.custo_por_resultado > meta * 1.5 ? 4 : 2, 'acima_da_meta', `Custo ${atual.custo_por_resultado} contra meta ${meta}.`);
        const cprChange = change(atual?.custo_por_resultado, anterior?.custo_por_resultado);
        if (atual?.resultados >= 10 && anterior?.resultados >= 10 && cprChange >= 30) alert(3, 'custo_subiu', `Custo por resultado subiu ${cprChange}%.`);
        const resultChange = change(atual?.resultados, anterior?.resultados);
        const spendChange = change(atual?.investimento, anterior?.investimento);
        if (anterior?.resultados >= 10 && resultChange <= -40 && spendChange != null && Math.abs(spendChange) <= 20) alert(3, 'resultados_cairam', `Resultados caíram ${resultChange}% com investimento estável.`);
        if (!entry.evento) alert(1, 'sem_evento', 'Sem conversão principal na ficha e sem volume para inferir.');
        else if (entry.evento_inferido) alert(0, 'evento_inferido', `Conversão principal inferida: ${entry.evento}. Confirmar na ficha.`);
        if (meta > 0 && atual?.custo_por_resultado != null && atual.custo_por_resultado <= meta * 0.8 && atual.resultados >= 10 && cprChange != null && cprChange <= 10) {
            alert(0, 'oportunidade_escala', `Custo ${atual.custo_por_resultado} bem abaixo da meta ${meta} com volume; candidata a teste de escala.`);
        }
        const score = alerts.reduce((s, a) => s + a.peso, 0);
        return { conta: entry.conta, id: entry.id, moeda: entry.moeda, evento: entry.evento, evento_inferido: entry.evento_inferido || false,
            meta_custo: meta || null, pontuacao_atencao: score, alertas: alerts.map(({ codigo, texto }) => ({ codigo, texto })),
            atual: atual && { investimento: atual.investimento, resultados: atual.resultados, custo_por_resultado: atual.custo_por_resultado, ctr_link: atual.ctr_link, cpm: atual.cpm, frequencia: atual.frequencia },
            variacao_pct: { investimento: spendChange, resultados: resultChange, custo_por_resultado: cprChange } };
    }).sort((a, b) => b.pontuacao_atencao - a.pontuacao_atencao);
    return {
        precisam_atencao: accounts.filter((a) => a.pontuacao_atencao > 0),
        sem_alertas: accounts.filter((a) => a.pontuacao_atencao === 0).map((a) => ({ conta: a.conta, id: a.id, oportunidade: a.alertas.some((x) => x.codigo === 'oportunidade_escala') })),
        criterio: 'Pontuação heurística de prioridade, não de saúde. Alertas de oportunidade não somam pontos.',
    };
}

const micros = (value) => num(value) == null ? null : Number(value) / 1_000_000;

// Google: perda de parcela por orçamento vs ranking, termos sem conversão e índice de qualidade.
export function googleBottlenecks({ campaigns = [], searchTerms = [], keywords = [], reference = null }) {
    const camp = campaigns.map((row) => {
        const m = row.metrics || {};
        const spend = micros(m.costMicros) ?? 0;
        const conversions = num(m.conversions) ?? 0;
        const share = (v) => num(v) == null ? null : round(Number(v) * 100);
        return {
            id: String(row.campaign?.id || ''), nome: row.campaign?.name, tipo: row.campaign?.advertisingChannelType,
            investimento: round(spend), conversoes: round(conversions), custo_por_conversao: conversions > 0 ? round(spend / conversions) : null,
            parcela_impressoes_pct: share(m.searchImpressionShare),
            perdida_por_orcamento_pct: share(m.searchBudgetLostImpressionShare),
            perdida_por_ranking_pct: share(m.searchRankLostImpressionShare),
        };
    }).sort((a, b) => b.investimento - a.investimento);
    const totalSpend = camp.reduce((s, c) => s + c.investimento, 0);
    const totalConv = camp.reduce((s, c) => s + c.conversoes, 0);
    const ref = reference > 0 ? reference : (totalConv >= 10 ? round(totalSpend / totalConv) : null);
    const signals = [];
    for (const c of camp) {
        if (c.perdida_por_orcamento_pct >= 20) {
            const efficient = ref && c.custo_por_conversao != null && c.custo_por_conversao <= ref && c.conversoes >= 5;
            signals.push({ campanha: c.nome, sinal: efficient ? 'limitada_por_orcamento_e_eficiente' : 'limitada_por_orcamento',
                texto: `Perde ${c.perdida_por_orcamento_pct}% das impressões por orçamento${efficient ? ' com custo dentro da referência: candidata a teste de escala' : ''}.` });
        }
        if (c.perdida_por_ranking_pct >= 30) {
            signals.push({ campanha: c.nome, sinal: 'perde_por_ranking', texto: `Perde ${c.perdida_por_ranking_pct}% das impressões por ranking (lance, índice de qualidade ou relevância do anúncio).` });
        }
    }
    const terms = searchTerms.map((row) => {
        const m = row.metrics || {};
        const spend = micros(m.costMicros) ?? 0;
        const conversions = num(m.conversions) ?? 0;
        return { termo: row.searchTermView?.searchTerm, campanha: row.campaign?.name, investimento: round(spend), cliques: num(m.clicks), conversoes: round(conversions) };
    });
    const wasteThreshold = ref ? 2 * ref : null;
    const wasteful = terms.filter((t) => t.conversoes === 0 && (wasteThreshold ? t.investimento >= wasteThreshold : t.investimento > 0))
        .sort((a, b) => b.investimento - a.investimento).slice(0, 15);
    const kws = keywords.map((row) => {
        const q = row.adGroupCriterion?.qualityInfo || {};
        const m = row.metrics || {};
        return { palavra: row.adGroupCriterion?.keyword?.text, correspondencia: row.adGroupCriterion?.keyword?.matchType, campanha: row.campaign?.name,
            indice_qualidade: num(q.qualityScore), relevancia_anuncio: q.creativeQualityScore || null, experiencia_pagina: q.postClickQualityScore || null,
            ctr_esperado: q.searchPredictedCtr || null, investimento: round(micros(m.costMicros) ?? 0), conversoes: round(num(m.conversions) ?? 0) };
    });
    const lowQuality = kws.filter((k) => k.indice_qualidade != null && k.indice_qualidade <= 4 && k.investimento > 0)
        .sort((a, b) => b.investimento - a.investimento).slice(0, 15);
    return {
        referencia_custo: ref,
        campanhas: camp.slice(0, 25),
        sinais_campanhas: signals,
        termos_sem_conversao: wasteful,
        criterio_termos: wasteThreshold ? `Zero conversões e gasto >= 2x a referência (${wasteThreshold}). Candidatos a negativação após revisar intenção.` : 'Sem referência de custo: lista termos com gasto e zero conversões, a revisar manualmente.',
        palavras_indice_baixo: lowQuality,
        leitura_indice: 'Componentes BELOW_AVERAGE indicam onde agir: relevância do anúncio (texto), experiência da página ou CTR esperado.',
    };
}
