import { supabase } from './supabase';
import {
  fetchCampaignsWithInsights,
  fetchAgeBreakdown,
  fetchGenderBreakdown,
  fetchPlatformBreakdown,
  fetchPlacementBreakdown,
  getPreviousPeriodRange,
} from './metaApi';
import { PRESETS } from '../shared/utils/dateUtils';
import { buildCampaignAnalysisFallback } from '../shared/utils/aiReport';

function getActionValue(actions, actionType) {
  if (!Array.isArray(actions)) return 0;
  const found = actions.find((action) => action.action_type === actionType);
  return found ? Number.parseInt(found.value, 10) || 0 : 0;
}

function getMessagesFromActions(actions) {
  const types = [
    'onsite_conversion.messaging_conversation_started_7d',
    'messaging_conversation_started_7d',
    'onsite_conversion.messaging_first_reply',
    'messaging_first_reply',
  ];

  for (const type of types) {
    const value = getActionValue(actions, type);
    if (value > 0) return value;
  }

  return 0;
}

function formatDateShort(dateString) {
  const [year, month, day] = String(dateString || '').split('-');
  if (!year || !month || !day) return '??/??/??';
  return `${day}/${month}/${year.slice(-2)}`;
}

function formatPeriodLabel(period) {
  if (typeof period === 'object' && period.type === 'custom') {
    return `${formatDateShort(period.startDate)} a ${formatDateShort(period.endDate)}`;
  }

  const preset = PRESETS.find((item) => item.id === period);
  if (!preset) return '??/??/?? a ??/??/??';

  const range = preset.getRange();
  return `${formatDateShort(range.startDate)} a ${formatDateShort(range.endDate)}`;
}

function buildCampaignPayload(campaignData, normalizeCampaignName) {
  const insight = campaignData?.insights?.data?.[0];
  if (!insight) return null;

  const spend = Number.parseFloat(insight.spend || 0) || 0;
  const impressions = Number.parseInt(insight.impressions || 0, 10) || 0;
  const clicks = Number.parseInt(insight.inline_link_clicks || 0, 10) || 0;
  const messages = getMessagesFromActions(insight.actions);

  return {
    id: campaignData.id,
    name: typeof normalizeCampaignName === 'function'
      ? normalizeCampaignName(campaignData.name)
      : campaignData.name,
    objective: campaignData.objective || '',
    spend,
    impressions,
    reach: Number.parseInt(insight.reach || 0, 10) || 0,
    clicks,
    ctr: Number.parseFloat(insight.ctr || 0) || 0,
    cpc: Number.parseFloat(insight.cpc || 0) || 0,
    cpm: Number.parseFloat(insight.cpm || 0) || 0,
    frequency: Number.parseFloat(insight.frequency || 0) || 0,
    messages,
    costPerMessage: messages > 0 ? spend / messages : 0,
  };
}

function groupCampaignsByName(campaigns = []) {
  const grouped = new Map();

  for (const campaign of campaigns) {
    if (!campaign) continue;
    const key = String(campaign.name || '').trim().toLowerCase();
    if (!key) continue;

    if (!grouped.has(key)) {
      grouped.set(key, { ...campaign });
      continue;
    }

    const current = grouped.get(key);
    const previousImpressions = current.impressions || 0;
    const nextImpressions = campaign.impressions || 0;
    current.spend += campaign.spend || 0;
    current.impressions += nextImpressions;
    current.reach += campaign.reach || 0;
    current.clicks += campaign.clicks || 0;
    current.messages += campaign.messages || 0;
    current.costPerMessage = current.messages > 0 ? current.spend / current.messages : 0;
    current.cpm = current.impressions > 0 ? (current.spend / current.impressions) * 1000 : 0;
    current.ctr = current.impressions > 0 ? (current.clicks / current.impressions) * 100 : 0;
    current.cpc = current.clicks > 0 ? current.spend / current.clicks : 0;

    const totalFrequencyWeight = previousImpressions + nextImpressions;
    if (totalFrequencyWeight > 0) {
      current.frequency = (
        ((current.frequency || 0) * previousImpressions) +
        ((campaign.frequency || 0) * nextImpressions)
      ) / totalFrequencyWeight;
    }
  }

  return Array.from(grouped.values());
}

function parseBreakdownSegments(rows = [], labelBuilder) {
  const segments = rows
    .map((row) => {
      const messages = getMessagesFromActions(row.actions);
      const spend = Number.parseFloat(row.spend || 0) || 0;
      return {
        label: labelBuilder(row),
        messages,
        spend,
        costPerMessage: messages > 0 ? spend / messages : 0,
      };
    })
    .filter((segment) => segment.spend > 0);

  return segments.length > 0 ? segments : null;
}

function normalizeBreakdowns({ ageData, genderData, platformData, placementData }) {
  const genderLabelMap = {
    male: 'Masculino',
    female: 'Feminino',
    unknown: 'Desconhecido',
  };

  return {
    age: parseBreakdownSegments(ageData, (row) => row.age || 'Desconhecido'),
    gender: parseBreakdownSegments(genderData, (row) => genderLabelMap[row.gender] || row.gender || 'Desconhecido'),
    platform: parseBreakdownSegments(platformData, (row) => row.publisher_platform || 'Desconhecido'),
    placement: parseBreakdownSegments(
      placementData,
      (row) => {
        const platform = row.publisher_platform || '';
        const position = row.platform_position || '';
        return position ? `${platform} — ${position}` : platform || 'Desconhecido';
      }
    ),
  };
}

export async function invokeAnalyzeCampaign(body) {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-campaign', { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (!data?.relatorio) throw new Error('Resposta da IA sem relatorio.');
    return { analysis: data.relatorio, source: data.source || 'ai' };
  } catch (error) {
    console.error('[aiReports] Falha na IA remota, usando fallback local:', error);
    return {
      analysis: buildCampaignAnalysisFallback(body),
      source: 'local_fallback',
    };
  }
}

export async function generateAccountAIAnalysis({
  accountId,
  accountName,
  selectedPeriod,
  normalizeCampaignName,
}) {
  const previousPeriod = getPreviousPeriodRange(selectedPeriod);
  const periodLabel = formatPeriodLabel(selectedPeriod);

  const [
    currentCampaignsResult,
    previousCampaignsResult,
    ageDataResult,
    genderDataResult,
    platformDataResult,
    placementDataResult,
  ] = await Promise.allSettled([
    fetchCampaignsWithInsights(accountId, selectedPeriod),
    fetchCampaignsWithInsights(accountId, previousPeriod),
    fetchAgeBreakdown(accountId, selectedPeriod),
    fetchGenderBreakdown(accountId, selectedPeriod),
    fetchPlatformBreakdown(accountId, selectedPeriod),
    fetchPlacementBreakdown(accountId, selectedPeriod),
  ]);

  const currentCampaigns = currentCampaignsResult.status === 'fulfilled' ? currentCampaignsResult.value : [];
  const previousCampaigns = previousCampaignsResult.status === 'fulfilled' ? previousCampaignsResult.value : [];

  const campaigns = groupCampaignsByName(
    currentCampaigns
      .map((campaign) => buildCampaignPayload(campaign, normalizeCampaignName))
      .filter(Boolean)
      .filter((campaign) => campaign.spend > 0 || campaign.impressions > 0 || campaign.messages > 0)
  );

  if (campaigns.length === 0) {
    return { analysis: '', source: 'empty', error: 'Sem campanhas com dados para análise.' };
  }

  const previousPeriodCampaigns = groupCampaignsByName(
    previousCampaigns
      .map((campaign) => buildCampaignPayload(campaign, normalizeCampaignName))
      .filter(Boolean)
      .filter((campaign) => campaign.spend > 0 || campaign.impressions > 0 || campaign.messages > 0)
  );

  const breakdowns = normalizeBreakdowns({
    ageData: ageDataResult.status === 'fulfilled' ? ageDataResult.value : [],
    genderData: genderDataResult.status === 'fulfilled' ? genderDataResult.value : [],
    platformData: platformDataResult.status === 'fulfilled' ? platformDataResult.value : [],
    placementData: placementDataResult.status === 'fulfilled' ? placementDataResult.value : [],
  });

  return invokeAnalyzeCampaign({
    accountName: accountName || '',
    platform: 'Meta Ads',
    periodLabel,
    todayDate: new Date().toLocaleDateString('pt-BR'),
    campaigns,
    previousPeriodCampaigns,
    breakdowns,
  });
}
