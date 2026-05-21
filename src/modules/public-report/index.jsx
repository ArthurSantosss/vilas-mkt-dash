import { useState, useEffect, useCallback } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../services/supabase';
import {
  fetchAccountInsights,
  fetchCampaignsWithInsights,
  fetchCampaignDailyInsights,
  getPreviousPeriodRange,
} from '../../services/metaApi';
import PeriodSelector from '../../shared/components/PeriodSelector';
import ReportCard from '../../shared/components/ReportCard';
import { PRESETS } from '../../shared/utils/dateUtils';

const LEAD_ACTION_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
];

const ENGAGEMENT_ACTION_TYPES = ['post_engagement', 'page_engagement'];
const SHARE_BASE_URL = (import.meta.env.VITE_PUBLIC_SHARE_BASE_URL || '').trim();
const META_LOGO_SOURCES = ['/meta-ads-logo.png', '/logometa.png'];

function normalizeHost(hostname) {
  return (hostname || '').replace(/^www\./, '').toLowerCase();
}

function getShareHost() {
  if (!SHARE_BASE_URL) return '';
  try {
    return normalizeHost(new URL(SHARE_BASE_URL).hostname);
  } catch {
    return '';
  }
}

function serializePeriod(period) {
  if (typeof period === 'object' && period?.type === 'custom') {
    return JSON.stringify({ type: 'custom', startDate: period.startDate, endDate: period.endDate });
  }
  return period;
}

function getActionValue(actions, actionType) {
  if (!actions || !Array.isArray(actions)) return 0;
  const found = actions.find(action => action.action_type === actionType);
  return found ? parseInt(found.value, 10) || 0 : 0;
}

function getActionValueMulti(actions, actionTypes) {
  if (!actions || !Array.isArray(actions)) return 0;
  for (const actionType of actionTypes) {
    const value = getActionValue(actions, actionType);
    if (value > 0) return value;
  }
  return 0;
}

function calcDiff(current, previous) {
  if (!previous || previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function formatPeriodLabel(period) {
  if (typeof period === 'object' && period?.type === 'custom') {
    const formatFull = (date) => {
      const parts = date.split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };
    const formatShort = (date) => {
      const parts = date.split('-');
      return `${parts[2]}-${parts[1]}`;
    };
    return {
      start: formatFull(period.startDate),
      end: formatFull(period.endDate),
      startShort: formatShort(period.startDate),
      endShort: formatShort(period.endDate),
    };
  }

  const preset = PRESETS.find(item => item.id === period);
  if (!preset) {
    return { start: '??/??/????', end: '??/??/????', startShort: '??-??', endShort: '??-??' };
  }

  const range = preset.getRange();
  const formatFull = (date) => {
    const parts = date.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };
  const formatShort = (date) => {
    const parts = date.split('-');
    return `${parts[2]}-${parts[1]}`;
  };

  return {
    start: formatFull(range.startDate),
    end: formatFull(range.endDate),
    startShort: formatShort(range.startDate),
    endShort: formatShort(range.endDate),
  };
}

function aggregateCampaignMetrics(campaigns = []) {
  return campaigns.reduce((accumulator, campaign) => {
    const insight = campaign.insights?.data?.[0];
    const actions = insight?.actions || [];

    accumulator.spend += parseFloat(insight?.spend || 0);
    accumulator.impressions += parseInt(insight?.impressions || 0, 10);
    accumulator.reach += parseInt(insight?.reach || 0, 10);
    accumulator.clicks += parseInt(insight?.inline_link_clicks || 0, 10);
    accumulator.leads += getActionValueMulti(actions, LEAD_ACTION_TYPES);
    accumulator.engagements += getActionValueMulti(actions, ENGAGEMENT_ACTION_TYPES);

    return accumulator;
  }, {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    leads: 0,
    engagements: 0,
  });
}

async function fetchReportFromApi(shareId, selectedPeriod) {
  const params = new URLSearchParams({
    shareId,
    period: serializePeriod(selectedPeriod),
  });
  const res = await fetch(`/api/public-report?${params.toString()}`);
  const text = await res.text();
  const contentType = res.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const error = new Error(
      `Endpoint não respondeu JSON (HTTP ${res.status}). A rota pública pode ter caído no fallback SPA da Vercel.`
    );
    error.shouldFallback = true;
    throw error;
  }

  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = json.details ? ` — ${json.details}` : '';
    const error = new Error(`${json.error || `Erro HTTP ${res.status}`}${detail}`);
    error.shouldFallback = res.status >= 500;
    throw error;
  }

  return json;
}

async function fetchSharedReport(shareId) {
  const { data, error } = await supabase.rpc('get_shared_report', { p_id: shareId });
  if (error) {
    throw new Error(`Erro ao localizar compartilhamento: ${error.message}`);
  }

  const share = Array.isArray(data) ? data[0] || null : null;
  if (!share) {
    throw new Error('Relatório não encontrado.');
  }

  return share;
}

async function fetchReportInBrowser(shareId, selectedPeriod) {
  const share = await fetchSharedReport(shareId);
  const previousPeriod = getPreviousPeriodRange(selectedPeriod);
  const objective = share.objective || 'messages';
  const campaignFilter = Array.isArray(share.campaign_ids) && share.campaign_ids.length > 0
    ? new Set(share.campaign_ids)
    : null;

  let metrics;
  let previousMetrics;
  let campaignsForDaily = [];
  let selectedCampaignNames = [];

  if (campaignFilter) {
    const [currentCampaigns, previousCampaigns] = await Promise.all([
      fetchCampaignsWithInsights(share.account_id, selectedPeriod),
      fetchCampaignsWithInsights(share.account_id, previousPeriod),
    ]);

    const filteredCurrent = currentCampaigns.filter(campaign => campaignFilter.has(campaign.id));
    const filteredPrevious = previousCampaigns.filter(campaign => campaignFilter.has(campaign.id));

    if (!filteredCurrent.length) {
      return { empty: true, message: 'Nenhuma das campanhas selecionadas teve dados no período.' };
    }

    metrics = aggregateCampaignMetrics(filteredCurrent);
    previousMetrics = aggregateCampaignMetrics(filteredPrevious);
    campaignsForDaily = filteredCurrent;
    selectedCampaignNames = filteredCurrent.map(campaign => campaign.name);
  } else {
    const [insights, previousInsights, allCampaigns] = await Promise.all([
      fetchAccountInsights(share.account_id, selectedPeriod),
      fetchAccountInsights(share.account_id, previousPeriod),
      fetchCampaignsWithInsights(share.account_id, selectedPeriod),
    ]);

    if (!insights) {
      return { empty: true, message: 'Sem dados para o período selecionado.' };
    }

    const actions = insights.actions || [];
    const previousActions = previousInsights?.actions || [];

    metrics = {
      spend: parseFloat(insights.spend || 0),
      impressions: parseInt(insights.impressions || 0, 10),
      reach: parseInt(insights.reach || 0, 10),
      clicks: parseInt(insights.inline_link_clicks || 0, 10),
      leads: getActionValueMulti(actions, LEAD_ACTION_TYPES),
      engagements: getActionValueMulti(actions, ENGAGEMENT_ACTION_TYPES),
    };
    previousMetrics = {
      spend: parseFloat(previousInsights?.spend || 0),
      impressions: parseInt(previousInsights?.impressions || 0, 10),
      reach: parseInt(previousInsights?.reach || 0, 10),
      clicks: parseInt(previousInsights?.inline_link_clicks || 0, 10),
      leads: getActionValueMulti(previousActions, LEAD_ACTION_TYPES),
      engagements: getActionValueMulti(previousActions, ENGAGEMENT_ACTION_TYPES),
    };
    campaignsForDaily = allCampaigns;
  }

  const costPerLead = metrics.leads > 0 ? metrics.spend / metrics.leads : 0;
  const costPerEngagement = metrics.engagements > 0 ? metrics.spend / metrics.engagements : 0;
  const costPerClick = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0;
  const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;

  const previousCostPerLead = previousMetrics.leads > 0 ? previousMetrics.spend / previousMetrics.leads : 0;
  const previousCostPerEngagement = previousMetrics.engagements > 0
    ? previousMetrics.spend / previousMetrics.engagements
    : 0;

  let dailyLeads = [];
  let dailyClicks = [];
  let dailyEngagements = [];

  if (campaignsForDaily.length > 0) {
    try {
      const allDaily = await Promise.all(
        campaignsForDaily.map(campaign => fetchCampaignDailyInsights(campaign.id, selectedPeriod))
      );

      const dayMap = {};
      for (const dailyCampaign of allDaily) {
        for (const day of dailyCampaign) {
          const date = day.date_start;
          if (!dayMap[date]) {
            dayMap[date] = { date, leads: 0, clicks: 0, engagements: 0 };
          }
          dayMap[date].leads += getActionValueMulti(day.actions || [], LEAD_ACTION_TYPES);
          dayMap[date].clicks += parseInt(day.inline_link_clicks || 0, 10);
          dayMap[date].engagements += getActionValueMulti(day.actions || [], ENGAGEMENT_ACTION_TYPES);
        }
      }

      const sorted = Object.values(dayMap).sort((left, right) => left.date.localeCompare(right.date));
      const formatDay = (date) => `${date.split('-')[2]}/${date.split('-')[1]}`;
      dailyLeads = sorted.map(day => ({ date: formatDay(day.date), leads: day.leads }));
      dailyClicks = sorted.map(day => ({ date: formatDay(day.date), clicks: day.clicks }));
      dailyEngagements = sorted.map(day => ({ date: formatDay(day.date), engagements: day.engagements }));
    } catch {
      // Daily trend is optional for the public report; keep the rest visible if it fails.
    }
  }

  let clientLogoUrl = null;
  try {
    const { data: prefData } = await supabase
      .from('app_preferences')
      .select('value')
      .eq('key', 'client_logos')
      .maybeSingle();
    const logosMap = prefData?.value || {};
    clientLogoUrl = logosMap[share.account_id] || null;
  } catch (err) {
    console.warn('Erro ao buscar logo do cliente no browser fallback:', err);
  }

  return {
    empty: false,
    accountName: share.client_label || 'Conta',
    clientLogoUrl,
    agency: share.agency || null,
    objective,
    hasCampaignFilter: Boolean(campaignFilter),
    filteredCampaignCount: campaignFilter ? campaignFilter.size : 0,
    selectedCampaignNames,
    period: formatPeriodLabel(selectedPeriod),
    ...metrics,
    costPerLead,
    costPerEngagement,
    costPerClick,
    ctr,
    diffs: {
      spend: calcDiff(metrics.spend, previousMetrics.spend),
      leads: calcDiff(metrics.leads, previousMetrics.leads),
      costPerLead: calcDiff(costPerLead, previousCostPerLead),
      engagements: calcDiff(metrics.engagements, previousMetrics.engagements),
      costPerEngagement: calcDiff(costPerEngagement, previousCostPerEngagement),
    },
    dailyLeads,
    dailyClicks,
    dailyEngagements,
  };
}

export function PublicReportEntry() {
  const { shareSlug } = useParams();
  const shareHost = getShareHost();
  const currentHost = typeof window !== 'undefined' ? normalizeHost(window.location.hostname) : '';

  if (!shareHost || currentHost !== shareHost || !shareSlug) {
    return <Navigate to="/" replace />;
  }

  return <PublicReport shareKey={shareSlug} />;
}

export default function PublicReport({ shareKey: shareKeyProp = null }) {
  const params = useParams();
  const shareKey = shareKeyProp || params.shareId;
  const [selectedPeriod, setSelectedPeriod] = useState('7d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const agencyType = data?.agency === 'tag' ? 'tag' : 'vilasmkt';
  const agencyLabel = agencyType === 'tag' ? 'Grupo Tag' : 'Vilas Growth Marketing';
  const agencyLogoSrc = agencyType === 'tag' ? ['/logotag.png'] : ['/favicon.png'];

  const fetchReport = useCallback(async () => {
    if (!shareKey) return;
    setLoading(true);
    setError(null);

    try {
      let report;

      try {
        report = await fetchReportFromApi(shareKey, selectedPeriod);
      } catch (apiError) {
        if (!apiError?.shouldFallback) {
          throw apiError;
        }

        console.warn('[PublicReport] Falling back to browser fetch:', apiError.message);
        report = await fetchReportInBrowser(shareKey, selectedPeriod);
      }

      if (report.empty) {
        setData(null);
        setError(report.message || 'Sem dados para o período selecionado.');
        return;
      }

      setData(report);
    } catch (err) {
      setError(`Erro ao carregar relatório: ${err.message}`);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [shareKey, selectedPeriod]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <div className="mx-auto max-w-[1280px] px-4 py-6 lg:px-8 lg:py-10">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-light">{agencyLabel}</p>
            <h1 className="mt-1 text-2xl font-bold lg:text-3xl">Relatório de desempenho</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Relatório atualizado em tempo real. Selecione o período abaixo.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="z-50 w-full sm:w-[260px]">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-secondary">Período</label>
              <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} className="w-full" />
            </div>
            <button
              type="button"
              onClick={fetchReport}
              disabled={loading}
              className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl border border-primary/40 bg-surface px-4 text-sm font-semibold text-primary-light transition hover:bg-primary/10 disabled:opacity-40"
              title="Atualizar dados"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Atualizar
            </button>
          </div>
        </header>

        {loading && !data && (
          <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-border bg-surface">
            <div className="flex flex-col items-center gap-3 text-text-secondary">
              <Loader2 size={28} className="animate-spin text-primary-light" />
              <p className="text-sm">Carregando relatório...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-danger/30 bg-danger/5">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <AlertCircle size={28} className="text-danger" />
              <p className="text-sm text-danger">{error}</p>
              <button
                type="button"
                onClick={fetchReport}
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
              >
                <RefreshCw size={12} /> Tentar novamente
              </button>
            </div>
          </div>
        )}

        {data && !error && (
          <div className="overflow-x-auto pb-6">
            <ReportCard
              data={data}
              agencyLogoSrc={agencyLogoSrc}
              metaLogoSrc={META_LOGO_SOURCES}
              clientLogoSrc={data.clientLogoUrl}
              agencyLabel={agencyLabel}
              showAccountName={false}
              objective={data.objective || 'messages'}
              withBarChart
            />
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-text-secondary/70">
          Powered by {agencyLabel}
        </footer>
      </div>
    </div>
  );
}
