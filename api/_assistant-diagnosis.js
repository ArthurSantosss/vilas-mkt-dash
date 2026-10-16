// Cálculos determinísticos: a IA interpreta evidências, não inventa métricas.
export const DIAGNOSTIC_FIELDS = 'spend,impressions,reach,frequency,cpm,inline_link_clicks,inline_link_click_ctr,actions';
export const EVENTS = {
    mensagens: ['onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d'],
    leads: ['lead', 'onsite_conversion.lead_grouped'],
    compras: ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'],
};
const number = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const round = (value) => value == null ? null : Number(value.toFixed(2));
export const change = (current, previous) => current == null || previous == null || previous === 0 ? null : round((current / previous - 1) * 100);

export function diagnosticMetrics(row, event) {
    if (!row) return null;
    const spend = number(row.spend);
    const impressions = number(row.impressions);
    const clicks = number(row.inline_link_clicks);
    const selected = (EVENTS[event] || []).map(type => row.actions?.find(action => action.action_type === type)).find(Boolean);
    // Eventos agregados e seus aliases nunca são somados. Campo actions ausente é desconhecido.
    const conversions = EVENTS[event] && Array.isArray(row.actions) ? (selected ? number(selected.value) : 0) : null;
    return {
        investimento: spend, impressoes: impressions, alcance: number(row.reach), frequencia: number(row.frequency),
        cpm: number(row.cpm) ?? (spend != null && impressions > 0 ? round(spend / impressions * 1000) : null),
        cliques_link: clicks,
        ctr_link: number(row.inline_link_click_ctr) ?? (clicks != null && impressions > 0 ? round(clicks / impressions * 100) : null),
        cpc_link: spend != null && clicks > 0 ? round(spend / clicks) : null,
        resultados: conversions,
        custo_por_resultado: conversions > 0 && spend != null ? round(spend / conversions) : null,
        // Razão descritiva, não taxa de funil: ações atribuídas podem incluir visualizações.
        resultados_por_clique: conversions != null && clicks > 0 ? round(conversions / clicks) : null,
    };
}

export function buildDiagnosis({ current, previous, ads = [], previousAds = [], profile, ranges, limitations = [] }) {
    const event = profile?.conversao_principal || null;
    const atual = diagnosticMetrics(current, event);
    const anterior = diagnosticMetrics(previous, event);
    const limites = [...limitations, 'Sem CRM: qualidade do lead, atendimento, receita e causa comercial não são verificáveis.',
        'Limiares de triagem são heurísticos; não representam significância estatística nem ordem de pausa.',
        'Resultados por clique não isolam o funil: a atribuição pode incluir conversões por visualização.'];
    if (!event) limites.push('Conversão principal não informada. Preencha a ficha antes de avaliar custo, desperdício ou escala.');
    if (!atual || !anterior) limites.push('Um dos períodos não tem métricas disponíveis. Comparação inconclusiva.');
    if (atual?.resultados == null || anterior?.resultados == null) limites.push('Contagem de resultados indisponível em pelo menos um período.');
    if (profile?.atraso_conversao_dias == null) limites.push('Atraso de atribuição não informado; resultados recentes podem estar incompletos.');
    else if (profile.atraso_conversao_dias > 0) limites.push(`A janela inclui dias ainda sujeitos ao atraso informado de ${profile.atraso_conversao_dias} dias. Reavaliar após maturação.`);

    const volume = atual?.resultados >= 10 && anterior?.resultados >= 10;
    const confidence = volume && !limitations.length ? 'moderada' : 'baixa';
    const variations = {};
    for (const key of Object.keys(atual || {})) variations[key] = change(atual[key], anterior?.[key]);
    const findings = [];
    function add(type, observation, hypothesis, action, evidence) {
        findings.push({ tipo: type, observacao: observation, evidencia: evidence, periodo: ranges.atual,
            hipotese: hypothesis, confianca: confidence, acao_sugerida: action, causalidade: 'nao_comprovada' });
    }
    if (profile?.meta_custo > 0 && atual?.custo_por_resultado > profile.meta_custo) {
        add('custo_acima_da_meta', 'Custo por resultado acima da meta informada.',
            'Investigar entrega, atração e conversão antes de atribuir uma causa.',
            volume ? 'Priorizar campanhas com maior contribuição de gasto e comparar os mesmos períodos.' : 'Coletar mais resultados antes de pausar ou escalar.',
            { custo: atual.custo_por_resultado, meta: profile.meta_custo, resultados: atual.resultados });
    }
    if (variations.cpm > 15) add('entrega', 'CPM aumentou em relação ao período anterior.',
        'Pode haver mudança de leilão, público ou distribuição de verba; CPM sozinho não identifica a causa.',
        'Verificar mudanças de campanha e distribuição da entrega.', { atual: atual.cpm, anterior: anterior.cpm, variacao_percentual: variations.cpm });
    if (variations.ctr_link < -15) add('atracao', 'CTR de link caiu em relação ao período anterior.',
        'Possível mudança de interesse ou composição da entrega; investigar criativos e públicos.',
        'Comparar anúncios com histórico e volume suficiente.', { atual: atual.ctr_link, anterior: anterior.ctr_link, variacao_percentual: variations.ctr_link });

    const baselineCost = anterior?.resultados >= 10 ? anterior.custo_por_resultado : null;
    const reference = profile?.meta_custo > 0 ? profile.meta_custo : baselineCost;
    const normalized = ads.map(row => ({ id: row.ad_id, nome: row.ad_name, campanha: row.campaign_name, metricas: diagnosticMetrics(row, event) }));
    const old = new Map(previousAds.map(row => [row.ad_id, diagnosticMetrics(row, event)]));
    const noResults = reference > 0 ? normalized.filter(ad => ad.metricas.resultados === 0 && ad.metricas.investimento >= 3 * reference)
        .sort((a, b) => b.metricas.investimento - a.metricas.investimento) : [];
    const fatigue = normalized.filter(ad => {
        const now = ad.metricas, before = old.get(ad.id);
        return now.impressoes >= 2000 && before?.impressoes >= 2000 && now.frequencia >= 2.5
            && change(now.ctr_link, before.ctr_link) != null && change(now.ctr_link, before.ctr_link) <= -20;
    }).map(ad => ({ ...ad, anterior: old.get(ad.id), hipotese: 'Possível fadiga; validar mudanças de público/entrega. Frequência isolada não basta.' }));
    const opportunities = normalized.filter(ad => {
        const before = old.get(ad.id);
        return reference > 0 && ad.metricas.resultados >= 10 && before?.resultados >= 10
            && ad.metricas.custo_por_resultado != null && ad.metricas.custo_por_resultado <= reference
            && before.custo_por_resultado != null && before.custo_por_resultado <= reference;
    }).sort((a, b) => a.metricas.custo_por_resultado - b.metricas.custo_por_resultado);

    return {
        conversao_principal: event, metricas_atuais: atual, metricas_anteriores: anterior,
        variacao_percentual: variations,
        suficiencia: { confianca: confidence, volume_para_triagem: volume, minimo_resultados_por_periodo: 10, natureza: 'heuristica' },
        evidencias: findings,
        revisao_de_gasto: { referencia_custo: reference, origem: profile?.meta_custo > 0 ? 'meta_do_cliente' : 'periodo_anterior_com_volume',
            criterio: 'Gasto >= 3 vezes a referência e zero resultados observados; revisar atribuição antes de decidir.',
            total_candidatos: noResults.length, anuncios: noResults.slice(0, 10), acao: 'investigar; não pausar automaticamente' },
        hipoteses_fadiga: fatigue.slice(0, 10),
        candidatos_a_teste_de_escala: opportunities.slice(0, 10),
        criterio_escala: 'Pelo menos 10 resultados em cada período e custo dentro da referência em ambos. Validar orçamento, qualidade e maturação antes de testar.',
        limitacoes: limites,
    };
}

function todayIn(timeZone, now) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(now).map(part => [part.type, part.value]));
    return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

// Últimos N dias completos (termina ontem) no fuso da conta.
export function lastCompleteDays(days, now = new Date(), timeZone = 'America/Sao_Paulo') {
    const today = todayIn(timeZone, now);
    const date = offset => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
    return { since: date(-days), until: date(-1) };
}

// Datas explícitas, dias completos e mesma duração, inclusive no início do mês.
export function diagnosticRanges(period, now = new Date(), timeZone = 'America/Sao_Paulo') {
    const today = todayIn(timeZone, now);
    const days = period === 'month' ? today.getUTCDate() - 1 : { yesterday: 1, '7d': 7, '14d': 14, '30d': 30 }[period];
    if (days == null) throw new Error('Período inválido.');
    if (days === 0) return null;
    const date = offset => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
    return { atual: { since: date(-days), until: date(-1) }, anterior: { since: date(-2 * days), until: date(-days - 1) } };
}
