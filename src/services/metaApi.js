const API_VERSION = 'v22.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

/**
 * Retorna o token de acesso.
 * Prioridade: 1) Token OAuth salvo via login Facebook  2) Token fixo do .env
 */
const getAccessToken = () => {
    // Prioridade: token obtido via Facebook OAuth (salvo no callback)
    const oauthToken = localStorage.getItem('meta_provider_token');
    if (oauthToken) {
        console.log('[metaApi] Usando token do localStorage (OAuth)');
        return oauthToken;
    }

    // Fallback: token fixo do .env (para desenvolvimento)
    const envToken = import.meta.env.VITE_META_ACCESS_TOKEN;
    if (envToken) {
        console.log('[metaApi] Usando token do .env (fallback)');
        return envToken;
    }

    throw new Error('Meta Access Token não encontrado. Conecte sua conta em Configurações.');
};

/**
 * Função utilitária para fazer requisições GET à Graph API.
 */
const fetchMeta = async (path, params = {}) => {
    const token = getAccessToken();
    const url = new URL(`${BASE_URL}${path}`);

    url.searchParams.append('access_token', token);

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            url.searchParams.append(key, value);
        }
    }

    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });

        const text = await response.text();
        const data = text ? JSON.parse(text) : {};

        if (!response.ok) {
            throw new Error(data.error?.message || `Erro da Meta API (${response.status})`);
        }

        return data;
    } catch (err) {
        throw new Error(`Falha na requisição Meta API: ${err.message}`);
    }
};

/**
 * Função utilitária para fazer requisições POST à Graph API.
 */
const postMeta = async (path, body = {}) => {
    const token = getAccessToken();
    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.append('access_token', token);

    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) {
            formData.append(key, value);
        }
    }

    try {
        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString()
        });

        const text = await response.text();
        const data = text ? JSON.parse(text) : {};

        if (!response.ok) {
            throw new Error(data.error?.message || `Erro da Meta API (${response.status})`);
        }

        return data;
    } catch (err) {
        throw new Error(`Falha na requisição Meta API: ${err.message}`);
    }
};

/**
 * Busca as contas de anúncios disponíveis para o usuário (Business Manager).
 */
export const fetchAdAccounts = async () => {
    const data = await fetchMeta('/me/adaccounts', {
        fields: 'id,account_id,name,account_status,currency,balance,amount_spent,spend_cap',
        limit: 1000
    });
    return data.data || [];
};

/**
 * Formata um período no formato do date_preset da Meta ou retorna undefined
 * se for um formato customizado usando time_range.
 */
const getPresetFromPeriod = (period) => {
    // Se o periodo for objeto customizado, não retornamos date_preset
    if (typeof period === 'object' && period.type === 'custom') return undefined;

    switch (period) {
        case 'today': return 'today';
        case 'yesterday': return 'yesterday';
        case '7d': return 'last_7d';
        case '30d': return 'last_30d';
        case 'month': return 'this_month';
        default: return 'last_7d';
    }
};

/**
 * Adiciona data_preset ou time_range aos parâmetros dependendo do período
 */
const applyPeriodParams = (params, period) => {
    const p = { ...params };
    const preset = getPresetFromPeriod(period);
    if (preset) {
        p.date_preset = preset;
    } else if (typeof period === 'object' && period.type === 'custom' && period.startDate && period.endDate) {
        p.time_range = JSON.stringify({ since: period.startDate, until: period.endDate });
    }
    return p;
};

/**
 * Busca os insights agregados de uma conta específica.
 */
export const fetchAccountInsights = async (accountId, period = '7d') => {
    const params = applyPeriodParams({
        fields: 'spend,impressions,cpm,inline_link_clicks,cpc,actions,ctr,reach,frequency',
        level: 'account'
    }, period);

    const data = await fetchMeta(`/${accountId}/insights`, params);

    return data.data && data.data.length > 0 ? data.data[0] : null;
};

/**
 * Busca os insights diários de uma conta específica.
 */
export const fetchAccountDailyInsights = async (accountId, period = '7d') => {
    const params = applyPeriodParams({
        fields: 'spend,impressions,actions',
        time_increment: 1, // '1' indica granularidade diária
        level: 'account'
    }, period);

    const data = await fetchMeta(`/${accountId}/insights`, params);

    return data.data || [];
};

/**
 * Busca as campanhas de uma conta e seus insights.
 */
export const fetchCampaignsWithInsights = async (accountId, period = '7d') => {
    const preset = getPresetFromPeriod(period);
    // Para simplificar aninhamento com time_range, se for custom passamos no nível do request (date_preset vs time_range em nível de request funciona global para insights).
    // O edge GraphQL de campanhas permite que filtros globais se apliquem ao 'insights' nestado de certas formas.
    // Outra opçnao: `insights.time_range({'since':'2024-01-01','until':'2024-01-31'})`

    let insightsField = 'insights';
    if (preset) {
        insightsField = `insights.date_preset(${preset})`;
    } else if (typeof period === 'object' && period.type === 'custom' && period.startDate && period.endDate) {
        insightsField = `insights.time_range({'since':'${period.startDate}','until':'${period.endDate}'})`;
    }

    const data = await fetchMeta(`/${accountId}/campaigns`, {
        fields: `id,name,status,objective,budget_remaining,daily_budget,lifetime_budget,${insightsField}{spend,impressions,cpm,inline_link_clicks,cpc,actions,ctr,purchase_roas,reach,frequency}`,
        limit: 50
    });

    return data.data || [];
};

/**
 * Atualiza o status de uma campanha (ACTIVE ou PAUSED).
 */
export const updateCampaignStatus = async (campaignId, newStatus) => {
    return postMeta(`/${campaignId}`, { status: newStatus });
};

/**
 * Atualiza o orçamento diário de uma campanha.
 * @param {string} campaignId - ID da campanha
 * @param {number} newBudget - Novo orçamento diário em reais (ex: 50.00)
 */
export const updateCampaignBudget = async (campaignId, newBudget) => {
    // Meta API espera o budget em centavos (ex: R$50.00 = 5000)
    const budgetInCents = Math.round(newBudget * 100);
    return postMeta(`/${campaignId}`, { daily_budget: budgetInCents });
};

/**
 * Busca os conjuntos de anúncio (ad sets) de uma campanha com insights.
 */
export const fetchAdSetsForCampaign = async (campaignId, period = '7d') => {
    const preset = getPresetFromPeriod(period);

    let insightsField = 'insights';
    if (preset) {
        insightsField = `insights.date_preset(${preset})`;
    } else if (typeof period === 'object' && period.type === 'custom' && period.startDate && period.endDate) {
        insightsField = `insights.time_range({'since':'${period.startDate}','until':'${period.endDate}'})`;
    }

    const data = await fetchMeta(`/${campaignId}/adsets`, {
        fields: `id,name,status,daily_budget,lifetime_budget,budget_remaining,optimization_goal,${insightsField}{spend,impressions,cpm,inline_link_clicks,cpc,actions,ctr,reach,frequency}`,
        limit: 50
    });

    return data.data || [];
};

/**
 * Atualiza o orçamento diário de um conjunto de anúncios (ad set).
 * @param {string} adSetId - ID do ad set
 * @param {number} newBudget - Novo orçamento diário em reais (ex: 25.00)
 */
export const updateAdSetBudget = async (adSetId, newBudget) => {
    const budgetInCents = Math.round(newBudget * 100);
    return postMeta(`/${adSetId}`, { daily_budget: budgetInCents });
};

/**
 * Atualiza o status de um conjunto de anúncios (ACTIVE ou PAUSED).
 */
export const updateAdSetStatus = async (adSetId, newStatus) => {
    return postMeta(`/${adSetId}`, { status: newStatus });
};

/**
 * Atualiza o status de um anúncio (ACTIVE ou PAUSED).
 */
export const updateAdStatus = async (adId, newStatus) => {
    return postMeta(`/${adId}`, { status: newStatus });
};

/**
 * Busca os anúncios de um conjunto de anúncios (ad set) com insights.
 */
export const fetchAdsForAdSet = async (adSetId, period = '7d') => {
    const preset = getPresetFromPeriod(period);

    let insightsField = 'insights';
    if (preset) {
        insightsField = `insights.date_preset(${preset})`;
    } else if (typeof period === 'object' && period.type === 'custom' && period.startDate && period.endDate) {
        insightsField = `insights.time_range({'since':'${period.startDate}','until':'${period.endDate}'})`;
    }

    const data = await fetchMeta(`/${adSetId}/ads`, {
        fields: `id,name,status,creative{title,body,thumbnail_url},${insightsField}{spend,impressions,cpm,inline_link_clicks,cpc,actions,ctr,reach,frequency}`,
        limit: 50
    });

    return data.data || [];
};

/**
 * Busca breakdown por região (estado) para uma conta ou campanha.
 * Usa level=campaign para garantir que o breakdown funcione corretamente.
 */
export const fetchRegionBreakdown = async (entityId, period = '7d') => {
    const params = applyPeriodParams({
        fields: 'actions,impressions,reach,spend',
        breakdowns: 'region',
        level: 'account',
        limit: 100,
    }, period);
    const data = await fetchMeta(`/${entityId}/insights`, params);
    return data.data || [];
};

/**
 * Busca breakdown por plataforma (Facebook, Instagram, etc.) para uma conta ou campanha.
 */
export const fetchPlatformBreakdown = async (entityId, period = '7d') => {
    const params = applyPeriodParams({
        fields: 'actions,spend,impressions,reach',
        breakdowns: 'publisher_platform',
    }, period);
    const data = await fetchMeta(`/${entityId}/insights`, params);
    return data.data || [];
};

/**
 * Busca breakdown por posicionamento para uma conta ou campanha.
 */
export const fetchPlacementBreakdown = async (entityId, period = '7d') => {
    const params = applyPeriodParams({
        fields: 'actions,spend,impressions,reach',
        breakdowns: 'publisher_platform,platform_position',
    }, period);
    const data = await fetchMeta(`/${entityId}/insights`, params);
    return data.data || [];
};

/**
 * Busca insights diários de uma campanha específica (para análise de tendência).
 */
export const fetchCampaignDailyInsights = async (campaignId, period = '7d') => {
    const params = applyPeriodParams({
        fields: 'spend,impressions,cpm,ctr,actions,reach,frequency',
        time_increment: 1,
    }, period);
    const data = await fetchMeta(`/${campaignId}/insights`, params);
    return data.data || [];
};

/**
 * Calcula o período anterior de mesmo tamanho.
 * Ex: se o período é '7d', retorna { type: 'custom', startDate: 14 dias atrás, endDate: 8 dias atrás }.
 */
export function getPreviousPeriodRange(period) {
    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);

    if (typeof period === 'object' && period.type === 'custom' && period.startDate && period.endDate) {
        const start = new Date(period.startDate + 'T00:00:00');
        const end = new Date(period.endDate + 'T00:00:00');
        const days = Math.round((end - start) / 86400000) + 1;
        const prevEnd = new Date(start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - days + 1);
        return { type: 'custom', startDate: fmt(prevStart), endDate: fmt(prevEnd) };
    }

    let days;
    switch (period) {
        case 'today': days = 1; break;
        case '7d': days = 7; break;
        case '30d': days = 30; break;
        case 'month': {
            const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            days = Math.round((today - firstOfMonth) / 86400000) + 1;
            break;
        }
        default: days = 7;
    }

    const currentEnd = new Date(today);
    currentEnd.setDate(currentEnd.getDate() - 1); // yesterday = end of current window
    const currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() - days + 1);

    const prevEnd = new Date(currentStart);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);

    return { type: 'custom', startDate: fmt(prevStart), endDate: fmt(prevEnd) };
}

/**
 * Busca insights diários do período anterior para uma campanha (para comparação temporal).
 */
export const fetchCampaignPreviousPeriodInsights = async (campaignId, period = '7d') => {
    const prevPeriod = getPreviousPeriodRange(period);
    const params = applyPeriodParams({
        fields: 'spend,impressions,cpm,ctr,actions,reach,frequency',
        time_increment: 1,
    }, prevPeriod);
    const data = await fetchMeta(`/${campaignId}/insights`, params);
    return data.data || [];
};

/**
 * Busca breakdown por faixa etária para uma conta ou campanha.
 */
export const fetchAgeBreakdown = async (entityId, period = '7d') => {
    const params = applyPeriodParams({
        fields: 'actions,spend,impressions,reach',
        breakdowns: 'age',
    }, period);
    const data = await fetchMeta(`/${entityId}/insights`, params);
    return data.data || [];
};

/**
 * Busca breakdown por gênero para uma conta ou campanha.
 */
export const fetchGenderBreakdown = async (entityId, period = '7d') => {
    const params = applyPeriodParams({
        fields: 'actions,spend,impressions,reach',
        breakdowns: 'gender',
    }, period);
    const data = await fetchMeta(`/${entityId}/insights`, params);
    return data.data || [];
};

/**
 * Busca métricas de vídeo para uma conta ou campanha.
 */
export const fetchVideoMetrics = async (entityId, period = '7d') => {
    const params = applyPeriodParams({
        fields: 'video_play_actions,video_avg_time_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions',
    }, period);
    const data = await fetchMeta(`/${entityId}/insights`, params);
    return data.data && data.data.length > 0 ? data.data[0] : null;
};
