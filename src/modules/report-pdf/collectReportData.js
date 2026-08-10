// Coleta e normaliza tudo que o relatório em PDF precisa, numa única passada.
// Cada bloco opcional (criativos, público, posicionamentos) degrada em silêncio:
// se a Meta não devolver o dado, a seção correspondente simplesmente não é
// impressa, em vez de quebrar o relatório inteiro.

import {
  fetchAccountInsights,
  fetchAccountDailyInsights,
  fetchCampaignsWithInsights,
  fetchAdsWithInsights,
  fetchAgeBreakdown,
  fetchGenderBreakdown,
  fetchRegionBreakdown,
  fetchPlatformBreakdown,
  fetchPlacementBreakdown,
  getPreviousPeriodRange,
} from '../../services/metaApi';
import { PRESETS } from '../../shared/utils/dateUtils';
import { simplifyCampaignName } from '../../shared/utils/campaignName';
import { variation } from './pdf/formatters';

// ── Tipos de ação por objetivo ──

const LEAD_ACTION_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
  'messaging_first_reply',
];

const ENGAGEMENT_ACTION_TYPES = ['post_engagement', 'page_engagement'];

export const OBJECTIVES = {
  messages: {
    id: 'messages',
    label: 'Mensagens',
    resultLabel: 'Conversas iniciadas',
    resultShort: 'Conversas',
    costLabel: 'Custo por conversa',
    resolve: (insight) => actionValueMulti(insight?.actions, LEAD_ACTION_TYPES),
  },
  clicks: {
    id: 'clicks',
    label: 'Cliques no link',
    resultLabel: 'Cliques no link',
    resultShort: 'Cliques',
    costLabel: 'Custo por clique',
    resolve: (insight) => toInt(insight?.inline_link_clicks),
  },
  engagements: {
    id: 'engagements',
    label: 'Engajamentos',
    resultLabel: 'Engajamentos',
    resultShort: 'Engaj.',
    costLabel: 'Custo por engajamento',
    resolve: (insight) => actionValueMulti(insight?.actions, ENGAGEMENT_ACTION_TYPES),
  },
};

// ── Helpers numéricos ──

function toFloat(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function actionValue(actions, type) {
  if (!Array.isArray(actions)) return 0;
  const found = actions.find((action) => action.action_type === type);
  return found ? toInt(found.value) : 0;
}

function actionValueMulti(actions, types) {
  for (const type of types) {
    const value = actionValue(actions, type);
    if (value > 0) return value;
  }
  return 0;
}

function settled(result, fallback) {
  return result.status === 'fulfilled' && result.value ? result.value : fallback;
}

// ── Período ──

function resolveRange(period) {
  if (typeof period === 'object' && period?.type === 'custom') {
    return { startDate: period.startDate, endDate: period.endDate };
  }
  const preset = PRESETS.find((item) => item.id === period);
  return preset ? preset.getRange() : null;
}

function formatDateBR(date) {
  if (!date) return '';
  const [year, month, day] = String(date).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
}

function formatDayShort(date) {
  const [, month, day] = String(date || '').split('-');
  return month && day ? `${day}/${month}` : '';
}

function countDays(range) {
  if (!range?.startDate || !range?.endDate) return 0;
  const start = new Date(`${range.startDate}T00:00:00`);
  const end = new Date(`${range.endDate}T00:00:00`);
  return Math.round((end - start) / 86400000) + 1;
}

export function buildPeriodMeta(period) {
  const range = resolveRange(period);
  const previousRange = resolveRange(getPreviousPeriodRange(period));

  return {
    start: formatDateBR(range?.startDate),
    end: formatDateBR(range?.endDate),
    label: range ? `${formatDateBR(range.startDate)} a ${formatDateBR(range.endDate)}` : 'Período não identificado',
    previousLabel: previousRange
      ? `${formatDateBR(previousRange.startDate)} a ${formatDateBR(previousRange.endDate)}`
      : '',
    days: countDays(range),
  };
}

// ── Agregação de métricas ──

function buildTotals(insight, objective) {
  const spend = toFloat(insight?.spend);
  const impressions = toInt(insight?.impressions);
  const reach = toInt(insight?.reach);
  const clicks = toInt(insight?.inline_link_clicks);
  const results = objective.resolve(insight);
  const conversations = actionValueMulti(insight?.actions, LEAD_ACTION_TYPES);
  const engagements = actionValueMulti(insight?.actions, ENGAGEMENT_ACTION_TYPES);

  return {
    spend,
    impressions,
    reach,
    clicks,
    results,
    conversations,
    engagements,
    ctr: toFloat(insight?.ctr),
    cpm: toFloat(insight?.cpm),
    cpc: clicks > 0 ? spend / clicks : 0,
    frequency: toFloat(insight?.frequency),
    costPerResult: results > 0 ? spend / results : 0,
  };
}

const EMPTY_TOTALS = {
  spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, conversations: 0,
  engagements: 0, ctr: 0, cpm: 0, cpc: 0, frequency: 0, costPerResult: 0,
};

// ── Breakdowns ──

const GENDER_LABELS = { male: 'Masculino', female: 'Feminino', unknown: 'Não informado' };
const PLATFORM_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  audience_network: 'Audience Network',
  messenger: 'Messenger',
  threads: 'Threads',
  whatsapp: 'WhatsApp',
};
const POSITION_LABELS = {
  feed: 'Feed',
  story: 'Stories',
  reels: 'Reels',
  instagram_reels: 'Reels',
  instagram_stories: 'Stories',
  facebook_reels: 'Reels',
  explore: 'Explorar',
  instant_article: 'Artigo instantâneo',
  marketplace: 'Marketplace',
  video_feeds: 'Feed de vídeo',
  search: 'Busca',
  right_hand_column: 'Coluna lateral',
  profile_feed: 'Feed do perfil',
  biz_inbox: 'Caixa de entrada',
};

function humanize(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeBreakdown(rows, labelBuilder, objective, limit = 6) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const grouped = new Map();
  for (const row of rows) {
    const label = labelBuilder(row);
    if (!label) continue;

    const current = grouped.get(label) || { label, spend: 0, results: 0, impressions: 0, reach: 0 };
    current.spend += toFloat(row.spend);
    current.results += objective.resolve(row);
    current.impressions += toInt(row.impressions);
    current.reach += toInt(row.reach);
    grouped.set(label, current);
  }

  return Array.from(grouped.values())
    .filter((item) => item.spend > 0 || item.results > 0)
    .map((item) => ({ ...item, costPerResult: item.results > 0 ? item.spend / item.results : 0 }))
    .sort((left, right) => right.spend - left.spend)
    .slice(0, limit);
}

// ── Imagens ──

// Converte uma URL de imagem em data URL. O @react-pdf busca imagens por conta
// própria, mas as miniaturas da Meta ficam num CDN sem CORS — por isso passamos
// pelo proxy do próprio app antes de embutir no documento.
async function toDataUrl(url, { useProxy = false } = {}) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;

  const candidates = [];
  if (useProxy) candidates.push(`/api/image-proxy?url=${encodeURIComponent(url)}`);
  candidates.push(url);

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) continue;

      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) continue;

      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      // Tenta o próximo candidato.
    }
  }

  return null;
}

function readClientLogo(accountId) {
  try {
    const stored = JSON.parse(localStorage.getItem('client_logos')) || {};
    return stored[accountId] || null;
  } catch {
    return null;
  }
}

// ── Coleta principal ──

export async function collectReportData({
  accountId,
  accountName,
  agencyName,
  agencyLogoSrc,
  period,
  objectiveId = 'messages',
  includeCreatives = true,
  onProgress = () => {},
}) {
  const objective = OBJECTIVES[objectiveId] || OBJECTIVES.messages;
  const previousPeriod = getPreviousPeriodRange(period);
  const periodMeta = buildPeriodMeta(period);

  onProgress('Buscando métricas da conta…');

  const [
    insightsResult,
    previousInsightsResult,
    dailyResult,
    campaignsResult,
  ] = await Promise.allSettled([
    fetchAccountInsights(accountId, period),
    fetchAccountInsights(accountId, previousPeriod),
    fetchAccountDailyInsights(accountId, period),
    fetchCampaignsWithInsights(accountId, period),
  ]);

  const insights = settled(insightsResult, null);
  if (!insights) {
    throw new Error('A Meta não retornou dados para essa conta no período selecionado.');
  }

  const totals = buildTotals(insights, objective);
  if (totals.spend <= 0 && totals.impressions <= 0) {
    throw new Error('Não há investimento nem entrega registrados nesse período.');
  }

  const previousInsights = settled(previousInsightsResult, null);
  const previous = previousInsights ? buildTotals(previousInsights, objective) : { ...EMPTY_TOTALS };

  // ── Evolução diária ──
  const dailyRows = settled(dailyResult, []);
  const daily = dailyRows
    .map((row) => ({
      label: formatDayShort(row.date_start),
      spend: toFloat(row.spend),
      results: objective.resolve(row),
    }))
    .filter((row) => row.label);

  // ── Campanhas ──
  const campaignRows = settled(campaignsResult, []);
  const campaigns = campaignRows
    .map((campaign) => {
      const insight = campaign.insights?.data?.[0];
      if (!insight) return null;

      const spend = toFloat(insight.spend);
      const results = objective.resolve(insight);
      const clicks = toInt(insight.inline_link_clicks);

      return {
        id: campaign.id,
        name: simplifyCampaignName(campaign.name),
        status: campaign.status,
        spend,
        results,
        clicks,
        impressions: toInt(insight.impressions),
        reach: toInt(insight.reach),
        ctr: toFloat(insight.ctr),
        cpm: toFloat(insight.cpm),
        costPerResult: results > 0 ? spend / results : 0,
        share: totals.spend > 0 ? spend / totals.spend : 0,
      };
    })
    .filter((campaign) => campaign && campaign.spend > 0)
    .sort((left, right) => right.spend - left.spend);

  onProgress('Analisando público e posicionamentos…');

  const [ageResult, genderResult, regionResult, platformResult, placementResult] = await Promise.allSettled([
    fetchAgeBreakdown(accountId, period),
    fetchGenderBreakdown(accountId, period),
    fetchRegionBreakdown(accountId, period),
    fetchPlatformBreakdown(accountId, period),
    fetchPlacementBreakdown(accountId, period),
  ]);

  const audience = {
    age: normalizeBreakdown(settled(ageResult, []), (row) => row.age, objective, 8),
    gender: normalizeBreakdown(
      settled(genderResult, []),
      (row) => GENDER_LABELS[row.gender] || humanize(row.gender),
      objective,
      3
    ),
    region: normalizeBreakdown(settled(regionResult, []), (row) => row.region, objective, 6),
  };

  const placements = {
    platform: normalizeBreakdown(
      settled(platformResult, []),
      (row) => PLATFORM_LABELS[row.publisher_platform] || humanize(row.publisher_platform),
      objective,
      5
    ),
    placement: normalizeBreakdown(
      settled(placementResult, []),
      (row) => {
        const platform = PLATFORM_LABELS[row.publisher_platform] || humanize(row.publisher_platform);
        const position = POSITION_LABELS[row.platform_position] || humanize(row.platform_position);
        return position ? `${platform} · ${position}` : platform;
      },
      objective,
      6
    ),
  };

  // ── Criativos ──
  let ads = [];
  if (includeCreatives) {
    onProgress('Selecionando os melhores criativos…');
    try {
      const adRows = await fetchAdsWithInsights(accountId, period);
      const ranked = adRows
        .map((ad) => {
          const insight = ad.insights?.data?.[0];
          if (!insight) return null;

          const spend = toFloat(insight.spend);
          const results = objective.resolve(insight);

          return {
            id: ad.id,
            name: ad.name,
            campaignName: ad.campaign?.name ? simplifyCampaignName(ad.campaign.name) : '',
            headline: ad.creative?.title || '',
            imageUrl: ad.creative?.image_url || ad.creative?.thumbnail_url || '',
            spend,
            results,
            clicks: toInt(insight.inline_link_clicks),
            impressions: toInt(insight.impressions),
            ctr: toFloat(insight.ctr),
            costPerResult: results > 0 ? spend / results : 0,
          };
        })
        .filter((ad) => ad && ad.spend > 0)
        // Prioriza quem entregou resultado; entre os sem resultado, quem investiu mais.
        .sort((left, right) => (right.results - left.results) || (right.spend - left.spend))
        .slice(0, 4);

      ads = await Promise.all(
        ranked.map(async (ad) => ({ ...ad, image: await toDataUrl(ad.imageUrl, { useProxy: true }) }))
      );
    } catch (error) {
      console.warn('[report-pdf] não foi possível carregar os criativos:', error);
      ads = [];
    }
  }

  // ── Logos ──
  onProgress('Montando o documento…');
  const [agencyLogo, clientLogo] = await Promise.all([
    toDataUrl(agencyLogoSrc),
    toDataUrl(readClientLogo(accountId), { useProxy: true }),
  ]);

  // ── Variações vs período anterior ──
  const deltas = {
    spend: variation(totals.spend, previous.spend),
    results: variation(totals.results, previous.results),
    costPerResult: variation(totals.costPerResult, previous.costPerResult),
    impressions: variation(totals.impressions, previous.impressions),
    reach: variation(totals.reach, previous.reach),
    clicks: variation(totals.clicks, previous.clicks),
    ctr: variation(totals.ctr, previous.ctr),
    cpm: variation(totals.cpm, previous.cpm),
    cpc: variation(totals.cpc, previous.cpc),
    frequency: variation(totals.frequency, previous.frequency),
  };

  return {
    meta: {
      clientName: accountName,
      agencyName,
      period: periodMeta,
      objective: objective.id,
      objectiveLabel: objective.label,
      resultLabel: objective.resultLabel,
      resultShort: objective.resultShort,
      costLabel: objective.costLabel,
      hasPrevious: previous.spend > 0,
    },
    totals,
    previous,
    deltas,
    daily,
    campaigns,
    ads,
    audience,
    placements,
    logos: { agency: agencyLogo, client: clientLogo },
  };
}
