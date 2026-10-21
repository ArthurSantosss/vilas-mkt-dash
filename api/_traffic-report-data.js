// Coleta do Relatório de Tráfego Pago. Tudo é lido ao vivo das APIs para o
// intervalo pedido: somas por dia nunca são usadas para métricas que não se somam
// (alcance, parcela de impressões), porque a própria API já devolve o valor do
// intervalo inteiro.

import { normalizeAdAccountId } from './_meta-tokens.js';
import { metaGet, metaGetAll, resolveWorkingToken, listTokenCandidates, isRetryableTokenError } from './_meta-graph.js';
import { googleAdsSearch, readWithAuthorizedRoutes } from './google-ads-proxy.js';
import { describeGoogleAdsError } from './_google-ads-errors.js';

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const optionalNum = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(ymd, days) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start, end) {
  return Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86_400_000);
}

/** Período anterior de mesmo tamanho, terminando no dia anterior ao início. */
export function previousRange({ start, end }) {
  const length = daysBetween(start, end) + 1;
  const prevEnd = addDays(start, -1);
  return { start: addDays(prevEnd, -(length - 1)), end: prevEnd };
}

export function todayIn(timeZone = 'America/Sao_Paulo', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function sanitizeKeyMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Normaliza o JSON salvo em shared_reports.config. Campos ausentes viram vazios. */
export function normalizeTrafficConfig(raw, fallbackAccountId = null) {
  const config = raw && typeof raw === 'object' ? raw : {};
  const metaAccounts = [...new Set((Array.isArray(config.metaAccounts) ? config.metaAccounts : [fallbackAccountId])
    .map(normalizeAdAccountId).filter(Boolean))];
  const googleAccounts = [...new Set((Array.isArray(config.googleAccounts) ? config.googleAccounts : [])
    .map(id => String(id || '').replace(/-/g, '')).filter(id => /^\d{10}$/.test(id)))];
  const audiences = (Array.isArray(config.audiences) ? config.audiences : [])
    .filter(item => item && typeof item.id === 'string' && item.id.trim())
    .map(item => ({ id: item.id.trim(), label: String(item.label || item.id).trim() }));
  const rawFunnels = sanitizeKeyMap(config.funnels);
  const funnelIds = audiences.length ? audiences.map(a => a.id) : ['geral'];
  const funnels = Object.fromEntries(funnelIds.map(id => [id, (Array.isArray(rawFunnels[id]) ? rawFunnels[id] : [])
    .slice(0, 3)
    .map(step => ({
      label: String(step?.label || '').trim(),
      meta: String(step?.meta || '').trim() || null,
      google: String(step?.google || '').trim() || null,
      metaLabel: String(step?.metaLabel || '').trim() || null,
      googleLabel: String(step?.googleLabel || '').trim() || null,
    }))]));
  return {
    metaAccounts,
    googleAccounts,
    instagramUserId: /^\d+$/.test(String(config.instagramUserId || '')) ? String(config.instagramUserId) : null,
    audiences,
    funnels,
    campaignAudience: sanitizeKeyMap(config.campaignAudience),
    boostedOverride: sanitizeKeyMap(config.boostedOverride),
  };
}

/* ───────────────────────────── Meta ───────────────────────────── */

function metaTimeRange({ start, end }) {
  return JSON.stringify({ since: start, until: end });
}

function actionsToMap(actions) {
  const map = {};
  for (const action of actions || []) {
    if (!action?.action_type) continue;
    map[action.action_type] = (map[action.action_type] || 0) + num(action.value);
  }
  return map;
}

/**
 * Post turbinado = campanha criada a partir de um post (boosted_object_id) e que
 * não é cópia de outra campanha: duplicatas herdam o boosted_object_id mesmo
 * sendo campanhas comuns. A config do link pode corrigir caso a caso.
 */
export function isBoostedCampaign(meta) {
  if (!meta?.boosted_object_id) return false;
  return !meta.source_campaign_id || String(meta.source_campaign_id) === '0';
}

async function fetchMetaCampaignMeta(accountId, token) {
  try {
    return await metaGetAll(`/${accountId}/campaigns`, {
      fields: 'id,name,objective,start_time,boosted_object_id,source_campaign_id',
      limit: 500,
    }, token, 10);
  } catch (error) {
    if (isRetryableTokenError(error)) throw error;
    // Se o campo boosted_object_id não for aceito, segue sem detecção automática.
    return metaGetAll(`/${accountId}/campaigns`, { fields: 'id,name,objective,start_time', limit: 500 }, token, 10);
  }
}

async function fetchMetaAdInsights(accountId, range, token) {
  return metaGetAll(`/${accountId}/insights`, {
    level: 'ad',
    time_range: metaTimeRange(range),
    fields: 'campaign_id,campaign_name,ad_id,ad_name,spend,impressions,inline_link_clicks,reach,actions',
    limit: 500,
  }, token);
}

/** Alcance é de pessoas únicas: só vale lido da API para o conjunto exato, nunca somado. */
async function fetchMetaCampaignReach(accountId, range, token) {
  const rows = await metaGetAll(`/${accountId}/insights`, {
    level: 'campaign',
    time_range: metaTimeRange(range),
    fields: 'campaign_id,reach',
    limit: 500,
  }, token);
  return new Map(rows.map(row => [String(row.campaign_id), optionalNum(row.reach)]));
}

/** Alcance sem duplicar pessoas de um grupo de campanhas da mesma conta. */
async function fetchMetaGroupReach(accountId, campaignIds, range, token) {
  if (!campaignIds.length) return 0;
  const data = await metaGet(`/${accountId}/insights`, {
    level: 'account',
    time_range: metaTimeRange(range),
    fields: 'reach',
    filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: campaignIds }]),
  }, token);
  return optionalNum(data.data?.[0]?.reach) ?? 0;
}

/**
 * Grupos da aba Campanhas: "ads" (todas as campanhas que não são post turbinado),
 * "aud:<id>" (as campanhas de cada funil) e "aud:__todas" (todos os funis juntos). Com mais de uma conta Meta, as mesmas pessoas
 * podem estar nas duas e não há como deduplicar: o alcance do grupo fica "—".
 */
async function collectMetaGroupReach(config, campaigns, range, tokens) {
  const groups = { ads: campaigns.filter(c => !c.boosted) };
  for (const audience of config.audiences) groups[`aud:${audience.id}`] = groups.ads.filter(c => c.audience === audience.id);
  // "aud:__todas": campanhas de qualquer funil (opção "Ambas"); mesmo id de ALL_AUDIENCES no front.
  if (config.audiences.length > 1) {
    const ids = new Set(config.audiences.map(a => a.id));
    groups['aud:__todas'] = groups.ads.filter(c => ids.has(c.audience));
  }
  const out = {};
  await Promise.all(Object.entries(groups).map(async ([key, list]) => {
    const accounts = [...new Set(list.map(c => c.accountId))];
    if (accounts.length > 1) { out[key] = null; return; }
    if (!accounts.length) { out[key] = 0; return; }
    try {
      out[key] = await fetchMetaGroupReach(accounts[0], list.map(c => c.id), range, tokens.get(accounts[0]));
    } catch (error) {
      console.warn('[traffic-report] Alcance do grupo indisponível:', error.message);
      out[key] = null;
    }
  }));
  return out;
}

function shapeMetaCampaigns(accountId, rows, campaignMeta, config, reachById = new Map()) {
  const metaById = new Map(campaignMeta.map(c => [String(c.id), c]));
  const campaigns = new Map();
  for (const row of rows) {
    const id = String(row.campaign_id);
    const key = `meta:${id}`;
    if (!campaigns.has(id)) {
      const meta = metaById.get(id) || {};
      const override = config.boostedOverride[key];
      campaigns.set(id, {
        key,
        id,
        accountId,
        name: row.campaign_name || meta.name || `Campanha ${id}`,
        objective: meta.objective || null,
        startTime: meta.start_time || null,
        boosted: typeof override === 'boolean' ? override : isBoostedCampaign(meta),
        audience: config.campaignAudience[key] || null,
        reach: reachById.get(id) ?? null,
        ads: [],
      });
    }
    campaigns.get(id).ads.push({
      id: String(row.ad_id),
      name: row.ad_name || `Anúncio ${row.ad_id}`,
      spend: num(row.spend),
      impressions: num(row.impressions),
      clicks: num(row.inline_link_clicks),
      reach: optionalNum(row.reach),
      conversions: actionsToMap(row.actions),
    });
  }
  return [...campaigns.values()];
}

async function enrichBoostedAds(campaigns, token) {
  const ads = campaigns.filter(c => c.boosted).flatMap(c => c.ads);
  for (let i = 0; i < ads.length; i += 50) {
    const chunk = ads.slice(i, i + 50);
    try {
      const data = await metaGet('/', {
        ids: chunk.map(ad => ad.id).join(','),
        fields: 'created_time,creative{body,title,effective_instagram_media_id,instagram_permalink_url,thumbnail_url}',
      }, token);
      for (const ad of chunk) {
        const info = data[ad.id];
        if (!info) continue;
        ad.createdTime = info.created_time || null;
        ad.post = {
          caption: info.creative?.body || info.creative?.title || null,
          permalink: info.creative?.instagram_permalink_url || null,
          mediaId: info.creative?.effective_instagram_media_id || null,
          thumbnail: info.creative?.thumbnail_url || null,
        };
      }
    } catch (error) {
      console.warn('[traffic-report] Não foi possível ler os criativos turbinados:', error.message);
    }
  }
}

export async function collectMeta(config, ranges) {
  const result = { accounts: [], current: [], previous: [], reach: { current: {}, previous: {} } };
  const tokens = new Map();
  await Promise.all(config.metaAccounts.map(async (accountId) => {
    try {
      const { token, accountName } = await resolveWorkingToken(accountId);
      tokens.set(accountId, token);
      const [campaignMeta, currentRows, previousRows, currentReach, previousReach] = await Promise.all([
        fetchMetaCampaignMeta(accountId, token),
        fetchMetaAdInsights(accountId, ranges.current, token),
        fetchMetaAdInsights(accountId, ranges.previous, token),
        fetchMetaCampaignReach(accountId, ranges.current, token).catch(() => new Map()),
        fetchMetaCampaignReach(accountId, ranges.previous, token).catch(() => new Map()),
      ]);
      const current = shapeMetaCampaigns(accountId, currentRows, campaignMeta, config, currentReach);
      await enrichBoostedAds(current, token);
      result.current.push(...current);
      result.previous.push(...shapeMetaCampaigns(accountId, previousRows, campaignMeta, config, previousReach));
      result.accounts.push({ id: accountId, name: accountName, ok: true });
    } catch (error) {
      result.accounts.push({ id: accountId, name: null, ok: false, error: error.message });
    }
  }));
  if (result.accounts.every(a => a.ok)) {
    [result.reach.current, result.reach.previous] = await Promise.all([
      collectMetaGroupReach(config, result.current, ranges.current, tokens),
      collectMetaGroupReach(config, result.previous, ranges.previous, tokens),
    ]);
  }
  return result;
}

/* ──────────────────────────── Google ──────────────────────────── */

const micros = (value) => num(value) / 1_000_000;
const gaqlRange = ({ start, end }) => `segments.date BETWEEN '${start}' AND '${end}'`;
// Relatório faz ~11 consultas em paralelo por conta; contas grandes passam dos 20s padrão.
const REPORT_SEARCH = { timeoutMs: 45_000, timeoutRetries: 1 };

function pickConversionValue(row, primaryByName) {
  const name = row.segments?.conversionActionName;
  const isPrimary = primaryByName.get(name);
  // Ação primária: coluna "Conversões". Secundária: só aparece em "Todas as conv.".
  return isPrimary === false ? num(row.metrics?.allConversions) : num(row.metrics?.conversions);
}

async function fetchGoogleRange(customerId, range, token, loginCustomerId, primaryByName) {
  const where = gaqlRange(range);
  const [campaigns, campaignConversions, ads, adConversions, auction] = await Promise.all([
    googleAdsSearch(customerId, `
      SELECT campaign.id, campaign.name, campaign.advertising_channel_type,
        metrics.cost_micros, metrics.impressions, metrics.clicks
      FROM campaign WHERE ${where} AND metrics.impressions > 0`, token, loginCustomerId, REPORT_SEARCH),
    googleAdsSearch(customerId, `
      SELECT campaign.id, segments.conversion_action_name, metrics.conversions, metrics.all_conversions
      FROM campaign WHERE ${where} AND metrics.all_conversions > 0`, token, loginCustomerId, REPORT_SEARCH),
    googleAdsSearch(customerId, `
      SELECT campaign.id, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
        ad_group_ad.ad.responsive_search_ad.headlines,
        metrics.cost_micros, metrics.impressions, metrics.clicks
      FROM ad_group_ad WHERE ${where} AND metrics.impressions > 0`, token, loginCustomerId, REPORT_SEARCH),
    googleAdsSearch(customerId, `
      SELECT campaign.id, ad_group_ad.ad.id, segments.conversion_action_name, metrics.conversions, metrics.all_conversions
      FROM ad_group_ad WHERE ${where} AND metrics.all_conversions > 0`, token, loginCustomerId, REPORT_SEARCH),
    googleAdsSearch(customerId, `
      SELECT campaign.id, campaign.name,
        metrics.search_impression_share, metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share, metrics.top_impression_percentage,
        metrics.absolute_top_impression_percentage,
        metrics.cost_micros, metrics.impressions, metrics.clicks
      FROM campaign
      WHERE ${where} AND campaign.advertising_channel_type = 'SEARCH' AND metrics.impressions > 0`, token, loginCustomerId, REPORT_SEARCH),
  ]);

  const byCampaign = new Map();
  for (const row of campaigns.results || []) {
    const id = String(row.campaign?.id);
    byCampaign.set(id, {
      key: `google:${id}`,
      id,
      accountId: customerId,
      name: row.campaign?.name || `Campanha ${id}`,
      channelType: row.campaign?.advertisingChannelType || null,
      spend: micros(row.metrics?.costMicros),
      impressions: num(row.metrics?.impressions),
      clicks: num(row.metrics?.clicks),
      conversions: {},
      ads: [],
    });
  }
  for (const row of campaignConversions.results || []) {
    const campaign = byCampaign.get(String(row.campaign?.id));
    const name = row.segments?.conversionActionName;
    if (!campaign || !name) continue;
    campaign.conversions[name] = (campaign.conversions[name] || 0) + pickConversionValue(row, primaryByName);
  }

  const adIndex = new Map();
  for (const row of ads.results || []) {
    const campaign = byCampaign.get(String(row.campaign?.id));
    if (!campaign) continue;
    const ad = row.adGroupAd?.ad || {};
    const headline = ad.responsiveSearchAd?.headlines?.[0]?.text;
    const entry = {
      id: String(ad.id),
      name: ad.name || headline || `Anúncio ${ad.id}`,
      spend: micros(row.metrics?.costMicros),
      impressions: num(row.metrics?.impressions),
      clicks: num(row.metrics?.clicks),
      conversions: {},
    };
    campaign.ads.push(entry);
    adIndex.set(entry.id, entry);
  }
  for (const row of adConversions.results || []) {
    const ad = adIndex.get(String(row.adGroupAd?.ad?.id));
    const name = row.segments?.conversionActionName;
    if (!ad || !name) continue;
    ad.conversions[name] = (ad.conversions[name] || 0) + pickConversionValue(row, primaryByName);
  }

  const auctionRows = (auction.results || []).map(row => ({
    key: `google:${row.campaign?.id}`,
    id: String(row.campaign?.id),
    accountId: customerId,
    name: row.campaign?.name,
    impressionShare: optionalNum(row.metrics?.searchImpressionShare),
    budgetLost: optionalNum(row.metrics?.searchBudgetLostImpressionShare),
    rankLost: optionalNum(row.metrics?.searchRankLostImpressionShare),
    topRate: optionalNum(row.metrics?.topImpressionPercentage),
    absTopRate: optionalNum(row.metrics?.absoluteTopImpressionPercentage),
    spend: micros(row.metrics?.costMicros),
    impressions: num(row.metrics?.impressions),
    clicks: num(row.metrics?.clicks),
  }));

  return { campaigns: [...byCampaign.values()], auction: auctionRows };
}

async function fetchConversionActions(customerId, token, loginCustomerId) {
  const payload = await googleAdsSearch(customerId, `
    SELECT conversion_action.name, conversion_action.include_in_conversions_metric, conversion_action.status
    FROM conversion_action WHERE conversion_action.status != 'REMOVED'`, token, loginCustomerId, REPORT_SEARCH);
  return (payload.results || []).map(row => ({
    name: row.conversionAction?.name,
    primary: row.conversionAction?.includeInConversionsMetric !== false,
  })).filter(item => item.name);
}

export async function collectGoogle(config, ranges) {
  const result = { accounts: [], current: { campaigns: [], auction: [] }, previous: { campaigns: [], auction: [] } };
  await Promise.all(config.googleAccounts.map(async (customerId) => {
    try {
      const data = await readWithAuthorizedRoutes({ customerId }, async (token, account) => {
        const actions = await fetchConversionActions(customerId, token, account.loginCustomerId);
        const primaryByName = new Map(actions.map(a => [a.name, a.primary]));
        const [current, previous] = await Promise.all([
          fetchGoogleRange(customerId, ranges.current, token, account.loginCustomerId, primaryByName),
          fetchGoogleRange(customerId, ranges.previous, token, account.loginCustomerId, primaryByName),
        ]);
        return { current, previous, name: account.name || null };
      });
      for (const campaign of [...data.current.campaigns, ...data.previous.campaigns]) {
        campaign.audience = config.campaignAudience[campaign.key] || null;
      }
      result.current.campaigns.push(...data.current.campaigns);
      result.current.auction.push(...data.current.auction);
      result.previous.campaigns.push(...data.previous.campaigns);
      result.previous.auction.push(...data.previous.auction);
      result.accounts.push({ id: customerId, name: data.name, ok: true });
    } catch (error) {
      result.accounts.push({ id: customerId, name: null, ok: false, error: describeGoogleAdsError(error).message });
    }
  }));
  return result;
}

/* ─────────────────────────── Instagram ─────────────────────────── */

const unix = (ymd, endOfDay = false) => Math.floor(new Date(`${ymd}T${endOfDay ? '23:59:59' : '00:00:00'}-03:00`).getTime() / 1000);

async function resolveInstagramToken(igUserId, metaAccounts) {
  const candidates = await listTokenCandidates(metaAccounts[0] || null);
  let lastError;
  for (const token of candidates) {
    try {
      const profile = await metaGet(`/${igUserId}`, { fields: 'username,followers_count' }, token);
      return { token, profile };
    } catch (error) {
      lastError = error;
      if (!isRetryableTokenError(error)) throw error;
    }
  }
  const error = new Error('Nenhum token Meta tem acesso a esta conta do Instagram (permissões instagram_basic e instagram_manage_insights).');
  error.cause = lastError;
  throw error;
}

/** follower_count por dia: a API só devolve os últimos 30 dias, sem incluir hoje. */
async function fetchFollowerGains(igUserId, range, token, today) {
  const oldest = addDays(today, -30);
  const yesterday = addDays(today, -1);
  if (range.start < oldest) {
    return { value: null, note: 'A API do Instagram só libera seguidores por dia dos últimos 30 dias.' };
  }
  const end = range.end > yesterday ? yesterday : range.end;
  if (end < range.start) {
    return { value: null, note: 'Seguidores do dia de hoje ainda não foram liberados pela API do Instagram.' };
  }
  const data = await metaGet(`/${igUserId}/insights`, {
    metric: 'follower_count',
    period: 'day',
    since: unix(range.start),
    until: unix(addDays(end, 1)),
  }, token);
  const values = data.data?.[0]?.values || [];
  if (!values.length) return { value: null, note: 'O Instagram não devolveu seguidores para este período.' };
  const value = values.reduce((sum, item) => sum + num(item.value), 0);
  return { value, note: end !== range.end ? 'Hoje ainda não entra: o Instagram libera os seguidores do dia no dia seguinte.' : null };
}

async function fetchProfileTotals(igUserId, range, token) {
  const totals = { views: 0, interactions: 0, saves: 0, shares: 0 };
  let start = range.start;
  while (start <= range.end) {
    const chunkEnd = addDays(start, 29) < range.end ? addDays(start, 29) : range.end;
    const data = await metaGet(`/${igUserId}/insights`, {
      metric: 'views,total_interactions,saves,shares',
      metric_type: 'total_value',
      period: 'day',
      since: unix(start),
      until: unix(chunkEnd, true),
    }, token);
    for (const item of data.data || []) {
      const value = num(item.total_value?.value);
      if (item.name === 'views') totals.views += value;
      if (item.name === 'total_interactions') totals.interactions += value;
      if (item.name === 'saves') totals.saves += value;
      if (item.name === 'shares') totals.shares += value;
    }
    start = addDays(chunkEnd, 1);
  }
  return totals;
}

/**
 * Métrica do perfil somada no período (total_value, em blocos de 30 dias). Cada uma é lida
 * sozinha: o Instagram tirou algumas da API (ex.: website_clicks), e a recusa de uma não
 * pode derrubar as outras.
 */
async function fetchAccountMetric(igUserId, metric, range, token) {
  let total = 0;
  let start = range.start;
  while (start <= range.end) {
    const chunkEnd = addDays(start, 29) < range.end ? addDays(start, 29) : range.end;
    const data = await metaGet(`/${igUserId}/insights`, {
      metric,
      metric_type: 'total_value',
      period: 'day',
      since: unix(start),
      until: unix(chunkEnd, true),
    }, token);
    const item = (data.data || []).find(entry => entry.name === metric);
    if (!item) throw new Error(`o Instagram não devolveu ${metric}`);
    total += num(item.total_value?.value);
    start = addDays(chunkEnd, 1);
  }
  return total;
}

const PROFILE_EXTRAS = [
  { key: 'profileViews', metric: 'profile_views', label: 'visitas ao perfil' },
  { key: 'bioLinkClicks', metric: 'website_clicks', label: 'cliques no link da bio' },
];

async function fetchProfileExtras(igUserId, ranges, token) {
  const out = {};
  await Promise.all(PROFILE_EXTRAS.map(async ({ key, metric, label }) => {
    const [current, previous] = await Promise.all([
      settle(fetchAccountMetric(igUserId, metric, ranges.current, token)),
      settle(fetchAccountMetric(igUserId, metric, ranges.previous, token)),
    ]);
    out[key] = {
      current: current.value,
      previous: previous.value,
      note: current.error ? `O Instagram não liberou ${label} pela API: ${current.error}` : null,
    };
  }));
  return out;
}

const MEDIA_METRICS = ['reach', 'views', 'saved', 'shares', 'likes', 'comments'];
const REELS_METRICS = ['ig_reels_avg_watch_time', 'reels_skip_rate'];

async function fetchMediaInsights(mediaId, isReel, token) {
  let metrics = isReel ? [...MEDIA_METRICS, ...REELS_METRICS] : [...MEDIA_METRICS];
  // Métricas recusadas para um tipo de mídia saem da lista e o resto é lido.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const data = await metaGet(`/${mediaId}/insights`, { metric: metrics.join(',') }, token);
      return Object.fromEntries((data.data || []).map(item => [item.name, optionalNum(item.values?.[0]?.value ?? item.total_value?.value)]));
    } catch (error) {
      const message = String(error.message || '');
      const rejected = metrics.find(metric => message.includes(metric));
      if (!rejected) return {};
      metrics = metrics.filter(metric => metric !== rejected);
      if (!metrics.length) return {};
    }
  }
  return {};
}

async function fetchPosts(igUserId, range, token) {
  const startTs = unix(range.start);
  const endTs = unix(range.end, true);
  const media = [];
  let page = await metaGet(`/${igUserId}/media`, {
    fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
    limit: 50,
  }, token);
  for (let pages = 0; pages < 20; pages += 1) {
    let reachedOlder = false;
    for (const item of page.data || []) {
      const ts = Math.floor(new Date(item.timestamp).getTime() / 1000);
      if (ts < startTs) { reachedOlder = true; break; }
      if (ts <= endTs) media.push(item);
    }
    if (reachedOlder || !page.paging?.next) break;
    const next = new URL(page.paging.next);
    next.searchParams.delete('access_token');
    page = await metaGet(next.toString(), {}, token);
  }

  const posts = [];
  for (let i = 0; i < media.length; i += 5) {
    const chunk = media.slice(i, i + 5);
    const insights = await Promise.all(chunk.map(item => fetchMediaInsights(item.id, item.media_product_type === 'REELS', token)));
    chunk.forEach((item, index) => {
      const data = insights[index];
      posts.push({
        id: item.id,
        caption: item.caption || '',
        permalink: item.permalink || null,
        timestamp: item.timestamp,
        productType: item.media_product_type || null,
        mediaType: item.media_type || null,
        reach: data.reach ?? null,
        views: data.views ?? null,
        likes: data.likes ?? optionalNum(item.like_count),
        comments: data.comments ?? optionalNum(item.comments_count),
        saves: data.saved ?? null,
        shares: data.shares ?? null,
        avgWatchTimeMs: data.ig_reels_avg_watch_time ?? null,
        skipRate: data.reels_skip_rate ?? null,
      });
    });
  }
  return posts;
}

async function settle(promise) {
  try { return { value: await promise, error: null }; } catch (error) { return { value: null, error: error.message }; }
}

export async function collectInstagram(config, ranges, today) {
  if (!config.instagramUserId) {
    return { configured: false, available: false, reason: 'Nenhuma conta do Instagram vinculada a este relatório.' };
  }
  let token;
  let profile;
  try {
    ({ token, profile } = await resolveInstagramToken(config.instagramUserId, config.metaAccounts));
  } catch (error) {
    return { configured: true, available: false, reason: error.message };
  }
  const [followersCurrent, followersPrevious, profileCurrent, profilePrevious, posts, extras] = await Promise.all([
    settle(fetchFollowerGains(config.instagramUserId, ranges.current, token, today)),
    settle(fetchFollowerGains(config.instagramUserId, ranges.previous, token, today)),
    settle(fetchProfileTotals(config.instagramUserId, ranges.current, token)),
    settle(fetchProfileTotals(config.instagramUserId, ranges.previous, token)),
    settle(fetchPosts(config.instagramUserId, ranges.current, token)),
    fetchProfileExtras(config.instagramUserId, ranges, token),
  ]);
  const followerResult = (settled) => settled.error
    ? { value: null, note: `O Instagram recusou a leitura de seguidores: ${settled.error}` }
    : settled.value;
  return {
    configured: true,
    available: true,
    username: profile?.username || null,
    followers: { current: followerResult(followersCurrent), previous: followerResult(followersPrevious) },
    profile: {
      current: profileCurrent.value,
      previous: profilePrevious.value,
      note: profileCurrent.error ? `O Instagram recusou a leitura do perfil: ${profileCurrent.error}` : null,
    },
    profileViews: extras.profileViews,
    bioLinkClicks: extras.bioLinkClicks,
    posts: posts.value || [],
    postsNote: posts.error ? `O Instagram recusou a leitura dos posts: ${posts.error}` : null,
  };
}

/* ───────────────────── Opções para a configuração ───────────────────── */

/** Nome do evento do pixel na regra da conversão personalizada (quando houver). */
export function customConversionEvent(rule) {
  try {
    const text = typeof rule === 'string' ? rule : JSON.stringify(rule || {});
    return JSON.stringify(JSON.parse(text)).match(/"event":\{"eq":"([^"]+)"/)?.[1] || null;
  } catch {
    return null;
  }
}

export async function collectOptions({ metaAccounts = [], googleAccounts = [] }) {
  const since = addDays(todayIn(), -90);
  const range = { start: since, end: todayIn() };
  const meta = await Promise.all(metaAccounts.map(normalizeAdAccountId).filter(Boolean).map(async (accountId) => {
    try {
      const { token, accountName } = await resolveWorkingToken(accountId);
      const [campaignRows, accountRows, customConversions, campaignMeta, pages] = await Promise.all([
        metaGetAll(`/${accountId}/insights`, { level: 'campaign', time_range: metaTimeRange(range), fields: 'campaign_id,campaign_name,spend', limit: 500 }, token),
        metaGet(`/${accountId}/insights`, { level: 'account', time_range: metaTimeRange(range), fields: 'actions' }, token),
        metaGetAll(`/${accountId}/customconversions`, { fields: 'id,name,is_archived,rule', limit: 200 }, token, 5).catch(() => []),
        fetchMetaCampaignMeta(accountId, token).catch(() => []),
        metaGetAll('/me/accounts', { fields: 'name,instagram_business_account{id,username}', limit: 100 }, token, 5).catch(() => []),
      ]);
      const actionCounts = new Map((accountRows.data?.[0]?.actions || []).map(action => [action.action_type, num(action.value)]));
      const boostedIds = new Set(campaignMeta.filter(isBoostedCampaign).map(c => String(c.id)));
      return {
        accountId,
        name: accountName,
        campaigns: campaignRows.map(row => ({ id: String(row.campaign_id), key: `meta:${row.campaign_id}`, name: row.campaign_name, spend: num(row.spend), boosted: boostedIds.has(String(row.campaign_id)) })),
        // Conversões personalizadas aparecem mesmo sem disparo recente (ex.: recém-criadas).
        customConversions: customConversions.map(conversion => {
          const key = `offsite_conversion.custom.${conversion.id}`;
          return {
            key,
            label: conversion.name || key,
            eventName: customConversionEvent(conversion.rule),
            archived: Boolean(conversion.is_archived),
            count: actionCounts.get(key) || 0,
          };
        }).sort((a, b) => Number(a.archived) - Number(b.archived) || b.count - a.count || a.label.localeCompare(b.label, 'pt-BR')),
        events: [...actionCounts.entries()]
          .filter(([key]) => !key.startsWith('offsite_conversion.custom.'))
          .map(([key, count]) => ({ key, label: key, count }))
          .sort((a, b) => b.count - a.count),
        instagramAccounts: pages.map(page => page.instagram_business_account).filter(Boolean)
          .map(ig => ({ id: String(ig.id), username: ig.username || ig.id })),
      };
    } catch (error) {
      return { accountId, error: error.message, campaigns: [], customConversions: [], events: [], instagramAccounts: [] };
    }
  }));

  const google = await Promise.all(googleAccounts.map(id => String(id).replace(/-/g, '')).filter(id => /^\d{10}$/.test(id)).map(async (customerId) => {
    try {
      return await readWithAuthorizedRoutes({ customerId }, async (token, account) => {
        const [campaigns, actions] = await Promise.all([
          googleAdsSearch(customerId, `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, metrics.cost_micros FROM campaign WHERE ${gaqlRange(range)} AND metrics.impressions > 0`, token, account.loginCustomerId),
          fetchConversionActions(customerId, token, account.loginCustomerId),
        ]);
        return {
          accountId: customerId,
          name: account.name || customerId,
          campaigns: (campaigns.results || []).map(row => ({ id: String(row.campaign.id), key: `google:${row.campaign.id}`, name: row.campaign.name, channelType: row.campaign.advertisingChannelType, spend: micros(row.metrics?.costMicros) })),
          events: actions.map(a => ({ key: a.name, label: a.primary ? a.name : `${a.name} (secundária)` })),
        };
      });
    } catch (error) {
      return { accountId: customerId, error: describeGoogleAdsError(error).message, campaigns: [], events: [] };
    }
  }));

  const igSeen = new Map();
  for (const account of meta) for (const ig of account.instagramAccounts || []) igSeen.set(ig.id, ig);
  return { meta, google, instagramAccounts: [...igSeen.values()] };
}
