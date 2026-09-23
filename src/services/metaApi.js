import {
    META_TOKEN_EXPIRED_MESSAGE,
    clearInvalidMetaToken,
    getStoredMetaToken,
    isInvalidMetaTokenError,
} from './metaTokenGuard';

const IS_DEV = import.meta.env.DEV;
// Tudo passa pelo proxy: é ele que escolhe entre os tokens de usuário do sistema das BMs
// (guardados no servidor) e o token do perfil. Em dev o plugin do Vite serve /api.
const PROXY_PATH = '/api/meta-proxy';

const getAccessToken = () => {
    const stored = getStoredMetaToken();
    if (stored) return stored;
    if (IS_DEV) {
        const fallbackToken = import.meta.env.VITE_META_ACCESS_TOKEN;
        if (fallbackToken && fallbackToken.trim()) return fallbackToken.trim();
    }
    return null;
};

// O proxy precisa saber a qual conta de anúncio a requisição pertence para escolher o
// token certo. Caminhos como /{campanha}/adsets não carregam essa informação, então
// registramos o vínculo conforme a árvore é percorrida a partir da conta.
const entityAccountIndex = new Map();
const ENTITY_INDEX_LIMIT = 5000;

function rememberEntityAccount(entityId, accountId) {
    if (!entityId || !accountId) return;
    if (entityAccountIndex.size >= ENTITY_INDEX_LIMIT) entityAccountIndex.clear();
    entityAccountIndex.set(String(entityId), accountId);
}

function rememberEntities(entities, accountId) {
    if (!accountId) return;
    for (const entity of entities || []) rememberEntityAccount(entity?.id, accountId);
}

function resolveAccountForPath(path) {
    const nodeId = String(path || '').split('/')[1];
    if (!nodeId) return null;
    if (/^act_\d+$/.test(nodeId)) return nodeId;
    return entityAccountIndex.get(nodeId) || null;
}

// Constrói URL + headers. O token do perfil vai via header `x-meta-token`, para não
// vazar em logs do servidor; `x-meta-account` diz ao proxy qual token da BM usar.
function buildRequest(path, params = {}, method = 'GET', body = null, { skipClientToken = false } = {}) {
    const token = skipClientToken ? null : getAccessToken();
    const headers = { Accept: 'application/json' };

    const url = new URL(window.location.origin + PROXY_PATH);
    url.searchParams.append('path', path);
    if (token) headers['x-meta-token'] = token;
    const accountHint = resolveAccountForPath(path);
    if (accountHint) headers['x-meta-account'] = accountHint;

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            url.searchParams.append(key, value);
        }
    }

    const fetchOptions = { method, headers };
    if (method === 'POST' && body) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        const formData = new URLSearchParams();
        for (const [key, value] of Object.entries(body)) {
            if (value !== undefined && value !== null) formData.append(key, value);
        }
        fetchOptions.body = formData.toString();
    }

    return { url: url.toString(), fetchOptions };
}

async function executeRequest(path, params, method, body, options) {
    const { url, fetchOptions } = buildRequest(path, params, method, body, options);
    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }
    return { response, data };
}

async function runRequest(path, params, method, body) {
    let attempt;
    try {
        attempt = await executeRequest(path, params, method, body, {});
    } catch (err) {
        throw new Error(`Falha na requisição Meta API: ${err.message}`);
    }

    // Token do aparelho inválido/morto: o proxy marca com x-meta-token-invalid
    if (attempt.response.headers.get('x-meta-token-invalid') === '1') {
        clearInvalidMetaToken();
    }

    let tokenWasInvalidated = false;
    if (!attempt.response.ok && isInvalidMetaTokenError(attempt.data)) {
        tokenWasInvalidated = clearInvalidMetaToken();
        if (tokenWasInvalidated) {
            try {
                attempt = await executeRequest(path, params, method, body, { skipClientToken: true });
            } catch {
                // Mantém erro original
            }
        }
    }

    if (!attempt.response.ok) {
        const { response, data } = attempt;
        if (tokenWasInvalidated && response.status === 401 && !data.error?.code) {
            throw new Error(`${META_TOKEN_EXPIRED_MESSAGE} Se o erro continuar, saia e entre novamente no painel.`);
        }
        if (tokenWasInvalidated || isInvalidMetaTokenError(data)) {
            throw new Error(META_TOKEN_EXPIRED_MESSAGE);
        }
        const metaError = data.error || {};
        const details = [
            metaError.message || response.statusText || `Erro da Meta API (${response.status})`,
            metaError.code ? `code=${metaError.code}` : null,
            metaError.error_subcode ? `subcode=${metaError.error_subcode}` : null,
        ].filter(Boolean).join(' | ');
        throw new Error(`Falha na requisição Meta API: ${details}`);
    }

    return attempt.data;
}

const fetchMeta = (path, params = {}) => runRequest(path, params, 'GET', null);
const postMeta = (path, body = {}) => runRequest(path, {}, 'POST', body);

/**
 * Busca as contas de anúncios disponíveis para o usuário (Business Manager).
 */
export const fetchAdAccounts = async () => {
    const data = await fetchMeta('/me/adaccounts', {
        fields: 'id,account_id,name,account_status,currency,balance,amount_spent,spend_cap,is_prepay_account,funding_source_details',
        limit: 1000
    });
    return data.data || [];
};

/** Vínculo conta → campanha já conhecido pelo painel, para o proxy escolher o token. */
export function registerCampaignAccounts(campaigns) {
    for (const campaign of campaigns || []) {
        rememberEntityAccount(campaign?.id, campaign?.accountId);
    }
}

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

    let insightsField = 'insights';
    if (preset) {
        insightsField = `insights.date_preset(${preset})`;
    } else if (typeof period === 'object' && period.type === 'custom' && period.startDate && period.endDate) {
        insightsField = `insights.time_range({'since':'${period.startDate}','until':'${period.endDate}'})`;
    }

    const data = await fetchMeta(`/${accountId}/campaigns`, {
        fields: `id,name,status,objective,budget_remaining,daily_budget,lifetime_budget,adsets{status,daily_budget},${insightsField}{spend,impressions,cpm,inline_link_clicks,cpc,actions,ctr,purchase_roas,reach,frequency}`,
        limit: 50
    });

    const campaigns = data.data || [];
    rememberEntities(campaigns, accountId);
    return campaigns;
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

    const adSets = data.data || [];
    rememberEntities(adSets, resolveAccountForPath(`/${campaignId}`));
    return adSets;
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

    const ads = data.data || [];
    rememberEntities(ads, resolveAccountForPath(`/${adSetId}`));
    return ads;
};

/**
 * Busca todos os anúncios de uma conta com insights e miniatura do criativo,
 * numa única requisição. Usado pelo relatório em PDF para ranquear criativos
 * sem precisar percorrer campanha → conjunto → anúncio.
 * `image_url` traz a imagem em resolução cheia; `thumbnail_url` é o fallback.
 */
export const fetchAdsWithInsights = async (accountId, period = '7d', limit = 60) => {
    const preset = getPresetFromPeriod(period);

    let insightsField = 'insights';
    if (preset) {
        insightsField = `insights.date_preset(${preset})`;
    } else if (typeof period === 'object' && period.type === 'custom' && period.startDate && period.endDate) {
        insightsField = `insights.time_range({'since':'${period.startDate}','until':'${period.endDate}'})`;
    }

    const data = await fetchMeta(`/${accountId}/ads`, {
        fields: `id,name,status,campaign{name},creative{title,body,thumbnail_url,image_url},${insightsField}{spend,impressions,inline_link_clicks,ctr,cpc,actions,reach}`,
        limit,
    });

    const ads = data.data || [];
    rememberEntities(ads, accountId);
    return ads;
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
        fields: 'spend,impressions,cpm,ctr,inline_link_clicks,actions,reach,frequency',
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
        case 'yesterday': days = 1; break;
        case '7d': days = 7; break;
        case '14d': days = 14; break;
        case '30d': days = 30; break;
        case 'today_yesterday': days = 2; break;
        case 'last_month': {
            const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const prevEnd = new Date(startOfLastMonth);
            prevEnd.setDate(prevEnd.getDate() - 1);
            const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
            return { type: 'custom', startDate: fmt(prevStart), endDate: fmt(prevEnd) };
        }
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
