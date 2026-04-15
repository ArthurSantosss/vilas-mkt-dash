import { useState, useMemo, useEffect, useCallback } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { formatCurrency, formatNumber } from '../../shared/utils/format';
import {
  fetchRegionBreakdown, fetchPlatformBreakdown, fetchPlacementBreakdown, fetchVideoMetrics,
  fetchAgeBreakdown, fetchGenderBreakdown,
  fetchAccountInsights, fetchCampaignsWithInsights
} from '../../services/metaApi';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import {
  SearchCheck, Lightbulb, TrendingUp, TrendingDown, AlertCircle, RefreshCw,
  Eye, Video, MapPin, Monitor, Layout, X, Users, Calendar,
  AlertTriangle, CheckCircle2, XCircle, Zap, Shield, Target, Activity,
  Loader2
} from 'lucide-react';
import { analyzeCampaign as analyzeLocal } from '../../services/campaignAnalysis';

import PeriodSelector from '../../shared/components/PeriodSelector';
import ScrollReveal from '../../shared/components/ScrollReveal';

const PIE_COLORS = ['#18D8E4', '#14C8D4', '#0FA5AE', '#0D929B', '#0B8089', '#097078', '#076068', '#065259', '#05454C', '#043A40'];
const PLACEMENT_COLORS = ['#18D8E4', '#14C8D4', '#0FA5AE', '#0D929B', '#0B8089', '#097078', '#076068', '#065259', '#05454C', '#043A40'];
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(19, 22, 31, 0.95)',
  border: '1px solid rgba(31, 35, 53, 0.8)',
  borderRadius: '10px',
  color: '#F0F2F5',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.04)',
  backdropFilter: 'blur(12px)',
  padding: '10px 14px',
  fontSize: '12px',
  fontFamily: 'Inter, system-ui, sans-serif',
};
const GRID_COLOR = 'rgba(31, 35, 53, 0.6)';
const AXIS_TICK = { fill: '#7D8590', fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif' };
const AXIS_STROKE = '#1F2335';

const SEVERITY_CONFIG = {
  critical: {
    gradient: 'from-red-500/20 via-red-500/5 to-transparent',
    border: 'border-red-500/40', glow: 'shadow-red-500/10',
    icon: XCircle, iconColor: 'text-red-400',
    badge: 'bg-red-500/20 text-red-300 border-red-500/30', badgeLabel: 'Problema',
    pulse: 'animate-pulse', accentBar: 'bg-gradient-to-b from-red-400 to-red-600',
  },
  warning: {
    gradient: 'from-amber-500/20 via-amber-500/5 to-transparent',
    border: 'border-amber-500/40', glow: 'shadow-amber-500/10',
    icon: AlertTriangle, iconColor: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30', badgeLabel: 'Atenção',
    pulse: '', accentBar: 'bg-gradient-to-b from-amber-400 to-amber-600',
  },
  good: {
    gradient: 'from-emerald-500/20 via-emerald-500/5 to-transparent',
    border: 'border-emerald-500/40', glow: 'shadow-emerald-500/10',
    icon: CheckCircle2, iconColor: 'text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', badgeLabel: 'Bom',
    pulse: '', accentBar: 'bg-gradient-to-b from-emerald-400 to-emerald-600',
  },
};

const PRIORITY_CONFIG = {
  alta: { color: 'text-red-300', bg: 'bg-red-500/10 border-red-500/30', icon: Zap, label: 'Alta' },
  média: { color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/30', icon: Target, label: 'Média' },
  baixa: { color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/30', icon: Shield, label: 'Baixa' },
};

// Ranked horizontal bar list — modern visual for category breakdowns
function RankedBarList({ data, colors, maxItems = 8 }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0);
  const maxVal = Math.max(...data.map(d => d.value));
  const items = data.slice(0, maxItems);

  return (
    <div className="space-y-3">
      {/* Total header */}
      <div className="flex items-baseline justify-between pb-2 border-b border-border/30">
        <span className="text-[10px] text-text-secondary font-medium uppercase tracking-wider">Total</span>
        <span className="text-lg font-bold text-text-primary" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{formatNumber(total)}</span>
      </div>
      {/* Bars */}
      {items.map((item, i) => {
        const pct = total > 0 ? (item.value / total * 100) : 0;
        const barWidth = maxVal > 0 ? (item.value / maxVal * 100) : 0;
        const color = colors[i % colors.length];
        return (
          <div key={i} className="group">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-2 h-2 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}40` }} />
                <span className="text-sm font-medium text-text-primary truncate" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {item.name}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                <span className="text-sm font-bold text-text-primary tabular-nums" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {formatNumber(item.value)}
                </span>
                <span className="text-xs font-semibold text-primary-light tabular-nums w-12 text-right">
                  {pct.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="h-2 bg-border/20 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${barWidth}%`,
                  background: `linear-gradient(90deg, ${color}, ${color}99)`,
                  boxShadow: `0 0 8px ${color}30`,
                }}
              />
            </div>
          </div>
        );
      })}
      {data.length > maxItems && (
        <p className="text-[10px] text-text-secondary text-center pt-1">+{data.length - maxItems} outros</p>
      )}
    </div>
  );
}

// Custom tooltip wrapper
function ChartTooltip({ active, payload, label, metricLabel, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: '#7D8590', fontSize: '10px', marginBottom: '4px', fontWeight: 500 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#18C8C8', fontWeight: 600, fontSize: '13px' }}>
          {metricLabel || p.name}: {formatter ? formatter(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

// Helper to get campaign metric, handling both flat (c.spend) and nested (c.metrics.spend)
function cm(c, key) {
  if (c.metrics && c.metrics[key] !== undefined) return c.metrics[key];
  return c[key] ?? 0;
}

// Extract messages from Meta API actions array — tries multiple action types
function getMessagesFromActions(actions) {
  if (!actions || !Array.isArray(actions)) return 0;
  // Try specific messaging action types in order of preference
  const messagingTypes = [
    'onsite_conversion.messaging_conversation_started_7d',
    'messaging_conversation_started_7d',
    'onsite_conversion.messaging_first_reply',
    'messaging_first_reply',
  ];
  for (const type of messagingTypes) {
    const action = actions.find(a => a.action_type === type);
    if (action) return parseInt(action.value, 10);
  }
  // Fallback: look for any action with 'messaging' in the type
  const anyMessaging = actions.find(a => a.action_type?.includes('messaging'));
  if (anyMessaging) return parseInt(anyMessaging.value, 10);
  return 0;
}

function formatSeconds(seconds) {
  const secs = parseFloat(seconds);
  if (isNaN(secs) || secs <= 0) return '—';
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remaining = secs % 60;
  return `${mins}m ${remaining.toFixed(0)}s`;
}

function getVideoMetricTotal(field) {
  if (!field || !Array.isArray(field)) return 0;
  return field.reduce((sum, item) => sum + parseFloat(item.value || 0), 0);
}

function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function resolveCurrentRange(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (typeof period === 'object' && period?.type === 'custom' && period.startDate && period.endDate) {
    const start = new Date(`${period.startDate}T00:00:00`);
    const end = new Date(`${period.endDate}T00:00:00`);
    return { start, end };
  }

  const end = new Date(today);
  const start = new Date(today);
  switch (period) {
    case 'today':
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case '7d':
      start.setDate(start.getDate() - 6);
      break;
    case '30d':
      start.setDate(start.getDate() - 29);
      break;
    case 'month':
      start.setDate(1);
      break;
    default:
      start.setDate(start.getDate() - 6);
      break;
  }
  return { start, end };
}

function resolvePreviousRange(period) {
  const { start, end } = resolveCurrentRange(period);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
  const prevEnd = new Date(start.getTime() - dayMs);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * dayMs);
  return { prevStart, prevEnd };
}

function hasAccountData(account) {
  if (!account?.metrics) return false;
  const m = account.metrics;
  return (m.spend || 0) > 0 || (m.impressions || 0) > 0 || (m.clicks || 0) > 0;
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════

export default function DetailedView() {
  const {
    accounts: metaAccounts,
    campaigns: metaCampaigns,
    loading: metaLoading,
    refreshData: metaRefreshData,
    setSelectedPeriod: metaSetPeriod,
  } = useMetaAds();
  const { agencies, accountAgencies } = useAgency();

  const [platform] = useState('meta');
  const [selectedAgency, setSelectedAgency] = useState('all');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);


  // Period — synced with context, shared PeriodSelector component drives this
  const [currentPeriod, setCurrentPeriod] = useState('30d');

  // Breakdown data (fetched on demand for selected account/campaign)
  const [breakdowns, setBreakdowns] = useState({ regions: [], platforms: [], placements: [], video: null, ages: [], genders: [] });
  const [loadingBreakdowns, setLoadingBreakdowns] = useState(false);
  const [previousPeriodMetrics, setPreviousPeriodMetrics] = useState(null);

  const allAccounts = metaAccounts;
  const allCampaigns = metaCampaigns;
  const loading = metaLoading;

  // Filter accounts by agency (same logic as Meta Ads overview)
  const accounts = useMemo(() => {
    if (selectedAgency === 'all') return allAccounts;
    return allAccounts.filter(a => accountAgencies[a.id] === selectedAgency);
  }, [allAccounts, selectedAgency, accountAgencies]);

  const account = useMemo(() => accounts.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);

  const accountCampaigns = useMemo(() => {
    if (!selectedAccountId) return [];
    if (allCampaigns && !Array.isArray(allCampaigns)) {
      return allCampaigns[selectedAccountId] || [];
    }
    if (Array.isArray(allCampaigns)) {
      return allCampaigns.filter(c => c.accountId === selectedAccountId);
    }
    return [];
  }, [allCampaigns, selectedAccountId]);

  // Only campaigns with delivery (spend > 0)
  const activeCampaigns = useMemo(() => {
    return accountCampaigns.filter(c => cm(c, 'spend') > 0);
  }, [accountCampaigns]);

  const selectedCampaign = useMemo(() => {
    if (!selectedCampaignId) return null;
    return accountCampaigns.find(c => c.id === selectedCampaignId) || null;
  }, [accountCampaigns, selectedCampaignId]);

  const hasData = hasAccountData(account);

  // ── getCurrentPeriod for breakdown fetches ──
  const getCurrentPeriod = useCallback(() => currentPeriod, [currentPeriod]);

  // ── Display metrics: from selected campaign or full account ──
  const displayMetrics = useMemo(() => {
    if (selectedCampaign) {
      return {
        spend: cm(selectedCampaign, 'spend'),
        messages: cm(selectedCampaign, 'messages'),
        costPerMessage: cm(selectedCampaign, 'costPerMessage'),
        impressions: cm(selectedCampaign, 'impressions'),
        reach: cm(selectedCampaign, 'reach'),
        cpm: cm(selectedCampaign, 'cpm'),
        ctr: cm(selectedCampaign, 'ctr'),
        frequency: cm(selectedCampaign, 'frequency'),
        conversions: cm(selectedCampaign, 'conversions'),
        costPerConversion: cm(selectedCampaign, 'costPerConversion'),
      };
    }
    const m = account?.metrics || {};
    return {
      spend: m.spend || 0,
      messages: m.messagingConversationsStarted || 0,
      costPerMessage: m.costPerMessage || 0,
      impressions: m.impressions || 0,
      reach: m.reach || 0,
      cpm: m.cpm || 0,
      ctr: m.ctr || 0,
      frequency: m.frequency || 0,
      conversions: m.conversions || 0,
      costPerConversion: m.costPerConversion || 0,
    };
  }, [selectedCampaign, account]);

  // ── Daily chart data (conversations per day) ──
  const chartData = useMemo(() => {
    if (!account?.dailyMetrics?.length) return [];
    return account.dailyMetrics.map(d => ({
      ...d,
      dateLabel: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      conversas: d.messages || getMessagesFromActions(d.actions) || 0,
    }));
  }, [account]);

  // ── Spend diff vs yesterday ──
  useEffect(() => {
    if (!selectedAccountId) {
      setPreviousPeriodMetrics(null);
      return;
    }

    let cancelled = false;
    const loadPreviousPeriod = async () => {
      try {
        const { prevStart, prevEnd } = resolvePreviousRange(currentPeriod);
        const prevPeriod = {
          type: 'custom',
          startDate: toYMD(prevStart),
          endDate: toYMD(prevEnd),
        };

        if (selectedCampaignId) {
          const [prevCampaigns, prevVideoDataRaw] = await Promise.all([
            fetchCampaignsWithInsights(selectedAccountId, prevPeriod),
            fetchVideoMetrics(selectedCampaignId, prevPeriod)
          ]);
          const prevCampaign = prevCampaigns.find(c => c.id === selectedCampaignId);
          const prevInsights = prevCampaign?.insights?.data?.[0];
          const prevMessages = getMessagesFromActions(prevInsights?.actions);
          const prevSpendValue = parseFloat(prevInsights?.spend || 0);
          if (!cancelled) {
            setPreviousPeriodMetrics({
              spend: prevSpendValue,
              messages: prevMessages,
              costPerMessage: prevMessages > 0 ? prevSpendValue / prevMessages : 0,
              impressions: parseInt(prevInsights?.impressions || 0, 10),
              reach: parseInt(prevInsights?.reach || 0, 10),
              cpm: parseFloat(prevInsights?.cpm || 0),
              frequency: parseFloat(prevInsights?.frequency || 0),
              plays: getVideoMetricTotal(prevVideoDataRaw?.video_play_actions),
              avgWatchTime: prevVideoDataRaw?.video_avg_time_watched_actions?.[0]?.value || 0,
            });
          }
          return;
        }

        const [prevAccountInsights, prevAccountVideoDataRaw] = await Promise.all([
          fetchAccountInsights(selectedAccountId, prevPeriod),
          fetchVideoMetrics(selectedAccountId, prevPeriod)
        ]);
        const prevMessages = getMessagesFromActions(prevAccountInsights?.actions);
        const prevSpendValue = parseFloat(prevAccountInsights?.spend || 0);
        if (!cancelled) {
          setPreviousPeriodMetrics({
            spend: prevSpendValue,
            messages: prevMessages,
            costPerMessage: prevMessages > 0 ? prevSpendValue / prevMessages : 0,
            impressions: parseInt(prevAccountInsights?.impressions || 0, 10),
            reach: parseInt(prevAccountInsights?.reach || 0, 10),
            cpm: parseFloat(prevAccountInsights?.cpm || 0),
            frequency: parseFloat(prevAccountInsights?.frequency || 0),
            plays: getVideoMetricTotal(prevAccountVideoDataRaw?.video_play_actions),
            avgWatchTime: prevAccountVideoDataRaw?.video_avg_time_watched_actions?.[0]?.value || 0,
          });
        }
      } catch {
        if (!cancelled) setPreviousPeriodMetrics(null);
      }
    };

    loadPreviousPeriod();
    return () => { cancelled = true; };
  }, [currentPeriod, selectedAccountId, selectedCampaignId]);

  // ── Local campaign analysis (Diagnóstico & Sugestões) ──
  useEffect(() => {
    if (!selectedCampaignId || !metaCampaigns?.length) {
      setAnalysisResult(null);
      return;
    }
    const campList = Array.isArray(metaCampaigns)
      ? metaCampaigns
      : (metaCampaigns[selectedAccountId] || []);
    const camp = campList.find(c => c.id === selectedCampaignId);
    if (!camp) { setAnalysisResult(null); return; }

    const m = camp.metrics || camp;
    const result = analyzeLocal({
      spend: parseFloat(m.spend || 0),
      impressions: parseInt(m.impressions || 0, 10),
      messages: parseInt(m.messages || 0, 10),
      cpc: parseFloat(m.cpc || 0),
      cpm: parseFloat(m.cpm || 0),
      ctr: parseFloat(m.ctr || 0),
      frequency: parseFloat(m.frequency || 0),
      costPerMessage: parseFloat(m.costPerMessage || 0),
    });
    setAnalysisResult(result);
  }, [selectedCampaignId, metaCampaigns, selectedAccountId]);


  // ── Breakdown chart data ──
  // Region: try messages first, fall back to impressions if no messaging data
  const regionData = useMemo(() => {
    if (!breakdowns.regions.length) return [];
    // First try messaging data
    const withMessages = breakdowns.regions.map(r => ({
      name: r.region || 'Desconhecido',
      mensagens: getMessagesFromActions(r.actions),
      impressoes: parseInt(r.impressions || 0, 10),
      alcance: parseInt(r.reach || 0, 10),
    })).filter(r => r.mensagens > 0 || r.impressoes > 0);

    const hasMessages = withMessages.some(r => r.mensagens > 0);
    return withMessages
      .filter(r => hasMessages ? r.mensagens > 0 : r.impressoes > 0)
      .sort((a, b) => hasMessages ? b.mensagens - a.mensagens : b.impressoes - a.impressoes)
      .slice(0, 15);
  }, [breakdowns.regions]);

  const regionMetricKey = useMemo(() => {
    if (!regionData.length) return 'mensagens';
    return regionData.some(r => r.mensagens > 0) ? 'mensagens' : 'impressoes';
  }, [regionData]);

  const platformData = useMemo(() => {
    return breakdowns.platforms.map(p => ({
      name: p.publisher_platform || 'Outro',
      value: getMessagesFromActions(p.actions),
    })).filter(p => p.value > 0);
  }, [breakdowns.platforms]);

  const placementData = useMemo(() => {
    return breakdowns.placements.map(p => {
      const platName = p.publisher_platform || '';
      const posName = p.platform_position || '';
      return {
        name: posName ? `${platName} — ${posName}` : platName,
        value: getMessagesFromActions(p.actions),
      };
    }).filter(p => p.value > 0).sort((a, b) => b.value - a.value);
  }, [breakdowns.placements]);

  const genderData = useMemo(() => {
    const genderLabels = { male: 'Masculino', female: 'Feminino', unknown: 'Desconhecido' };
    return breakdowns.genders.map(g => ({
      name: genderLabels[g.gender] || g.gender || 'Outro',
      value: getMessagesFromActions(g.actions),
    })).filter(g => g.value > 0).sort((a, b) => b.value - a.value);
  }, [breakdowns.genders]);

  const ageData = useMemo(() => {
    return breakdowns.ages.map(a => ({
      name: a.age || 'Outro',
      value: getMessagesFromActions(a.actions),
    })).filter(a => a.value > 0).sort((a, b) => {
      const numA = parseInt(a.name) || 0;
      const numB = parseInt(b.name) || 0;
      return numA - numB;
    });
  }, [breakdowns.ages]);

  const GENDER_COLORS = ['#18D8E4', '#0FA5AE', '#0B8089', '#076068'];
  const AGE_COLORS = ['#18D8E4', '#14C8D4', '#0FA5AE', '#0D929B', '#0B8089', '#097078', '#076068'];

  const videoData = useMemo(() => {
    const v = breakdowns.video;
    if (!v) return null;
    const plays = getVideoMetricTotal(v.video_play_actions);
    if (plays === 0) return null;
    return {
      plays,
      avgWatchTime: v.video_avg_time_watched_actions?.[0]?.value || 0,
      p25: getVideoMetricTotal(v.video_p25_watched_actions),
      p50: getVideoMetricTotal(v.video_p50_watched_actions),
      p75: getVideoMetricTotal(v.video_p75_watched_actions),
      p100: getVideoMetricTotal(v.video_p100_watched_actions),
    };
  }, [breakdowns.video]);

  const videoRetentionChart = useMemo(() => {
    if (!videoData) return [];
    const { plays, p25, p50, p75, p100 } = videoData;
    return [
      { label: '25%', value: p25, pct: plays > 0 ? (p25 / plays * 100) : 0 },
      { label: '50%', value: p50, pct: plays > 0 ? (p50 / plays * 100) : 0 },
      { label: '75%', value: p75, pct: plays > 0 ? (p75 / plays * 100) : 0 },
      { label: '100%', value: p100, pct: plays > 0 ? (p100 / plays * 100) : 0 },
    ];
  }, [videoData]);

  // ── Compute Diffs ──
  const diffs = useMemo(() => {
    if (!previousPeriodMetrics) return {};
    
    const calc = (curr, prev) => prev > 0 ? ((curr - prev) / prev) * 100 : undefined;
    
    const repetitions = Math.max(0, displayMetrics.impressions - displayMetrics.reach);
    const prevRepetitions = Math.max(0, (previousPeriodMetrics.impressions || 0) - (previousPeriodMetrics.reach || 0));

    return {
      spend: calc(displayMetrics.spend, previousPeriodMetrics.spend),
      messages: calc(displayMetrics.messages, previousPeriodMetrics.messages),
      costPerMessage: calc(displayMetrics.costPerMessage, previousPeriodMetrics.costPerMessage),
      impressions: calc(displayMetrics.impressions, previousPeriodMetrics.impressions),
      reach: calc(displayMetrics.reach, previousPeriodMetrics.reach),
      cpm: calc(displayMetrics.cpm, previousPeriodMetrics.cpm),
      ctr: calc(displayMetrics.ctr, previousPeriodMetrics.ctr),
      frequency: calc(displayMetrics.frequency, previousPeriodMetrics.frequency),
      repetitions: calc(repetitions, prevRepetitions),
      plays: videoData ? calc(videoData.plays, previousPeriodMetrics.plays) : undefined,
      avgWatchTime: videoData ? calc(videoData.avgWatchTime, previousPeriodMetrics.avgWatchTime) : undefined,
    };
  }, [displayMetrics, previousPeriodMetrics, videoData]);


  // ═══════════════════════════════════════════════════════
  // FETCH BREAKDOWNS (Meta only, on account/campaign selection)
  // ═══════════════════════════════════════════════════════

  useEffect(() => {
    if (!selectedAccountId || platform !== 'meta') {
      setBreakdowns({ regions: [], platforms: [], placements: [], video: null, ages: [], genders: [] });
      return;
    }

    const entityId = selectedCampaignId || selectedAccountId;
    const period = getCurrentPeriod();
    let cancelled = false;

    const load = async () => {
      setLoadingBreakdowns(true);
      try {
        const [regions, platforms, placements, video, ages, genders] = await Promise.allSettled([
          fetchRegionBreakdown(entityId, period),
          fetchPlatformBreakdown(entityId, period),
          fetchPlacementBreakdown(entityId, period),
          fetchVideoMetrics(entityId, period),
          fetchAgeBreakdown(entityId, period),
          fetchGenderBreakdown(entityId, period),
        ]);
        if (!cancelled) {
          setBreakdowns({
            regions: regions.status === 'fulfilled' ? regions.value : [],
            platforms: platforms.status === 'fulfilled' ? platforms.value : [],
            placements: placements.status === 'fulfilled' ? placements.value : [],
            video: video.status === 'fulfilled' ? video.value : null,
            ages: ages.status === 'fulfilled' ? ages.value : [],
            genders: genders.status === 'fulfilled' ? genders.value : [],
          });
        }
      } catch (err) {
        console.warn('[DetailedView] Error fetching breakdowns:', err);
      } finally {
        if (!cancelled) setLoadingBreakdowns(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [selectedAccountId, selectedCampaignId, platform, getCurrentPeriod]);

  // ═══════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════

  const handlePeriodChange = (period) => {
    setCurrentPeriod(period);
    if (platform === 'meta') metaSetPeriod(period);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (platform === 'meta') await metaRefreshData?.();
    } catch { /* refresh errors are silently ignored */ } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectAccount = (accountId) => {
    setSelectedAccountId(accountId);
    setSelectedCampaignId(''); // reset campaign when changing account
  };

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <div className="space-y-6 pb-12">

      {/* ═══ HEADER ═══ */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>

        <div className="relative">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
              <SearchCheck size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary tracking-tight">Visão Detalhada</h1>
              <p className="text-sm text-text-secondary">Análise profunda e insights por conta</p>
            </div>
          </div>
        </div>

        {/* Selectors */}
        <div className="relative mt-5 grid grid-cols-1 min-[560px]:grid-cols-2 sm:flex sm:flex-wrap items-end justify-center gap-3 sm:gap-5">
          {agencies.length > 0 && (
            <div className="flex flex-col gap-1.5 col-span-1 sm:w-[210px]">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Agência</label>
              <select
                value={selectedAgency}
                onChange={e => { setSelectedAgency(e.target.value); handleSelectAccount(''); }}
                className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
              >
                <option value="all">Todas</option>
                {agencies.map(ag => (
                  <option key={ag} value={ag}>{ag}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[295px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Conta</label>
            <select value={selectedAccountId} onChange={e => handleSelectAccount(e.target.value)}
              className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer">
              <option value="">Selecione uma conta</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.clientName}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[295px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Campanha</label>
            <div className="flex items-center gap-2">
              <select
                value={selectedCampaignId}
                onChange={e => setSelectedCampaignId(e.target.value)}
                disabled={!selectedAccountId || activeCampaigns.length === 0}
                className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Todas as campanhas</option>
                {activeCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {selectedCampaignId && (
                <button
                  onClick={() => setSelectedCampaignId('')}
                  className="p-2 rounded-xl bg-surface/60 border border-border/50 text-text-secondary hover:text-danger hover:border-danger/30 transition-all shrink-0"
                  title="Limpar seleção"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[210px] z-50">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Período</label>
            <PeriodSelector selectedPeriod={currentPeriod} onPeriodChange={handlePeriodChange} className="w-full" />
          </div>
        </div>

        {/* Action Row */}
        <div className="relative mt-6 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || loading}
            className="group relative inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-primary to-primary-light text-white shadow-lg shadow-primary/25
              hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
              transition-all duration-300 ease-out"
          >
            <RefreshCw size={18} className={isRefreshing || loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
            {isRefreshing || loading ? 'Atualizando...' : 'Atualizar Dados'}
            <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>

          {loadingBreakdowns && (
            <span className="text-xs text-text-secondary flex items-center gap-1">
              <RefreshCw size={12} className="animate-spin" /> Carregando detalhes...
            </span>
          )}
        </div>
      </div>

      {/* Empty states */}
      {!account ? (
        <div className="bg-surface/30 backdrop-blur-sm rounded-2xl border border-border/50 p-16 text-center shadow-lg">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/10 to-transparent flex items-center justify-center mx-auto mb-6 border border-primary/10">
            <SearchCheck size={48} className="text-primary-light/60" />
          </div>
          <h3 className="text-xl font-bold text-text-primary mb-2">Nenhuma Conta Selecionada</h3>
          <p className="text-text-secondary">Selecione uma plataforma e conta acima para ver a análise detalhada.</p>
        </div>
      ) : !hasData ? (
        <div className="bg-surface/30 backdrop-blur-sm rounded-2xl border border-border/50 p-16 text-center shadow-lg">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-warning/10 to-transparent flex items-center justify-center mx-auto mb-6 border border-warning/10">
            <AlertCircle size={48} className="text-warning/60" />
          </div>
          <h3 className="text-xl font-bold text-text-primary mb-1">{account.clientName}</h3>
          <p className="text-xs text-text-secondary font-mono bg-bg/50 inline-block px-3 py-1 rounded-md mb-4">{account.accountId}</p>
          <p className="text-sm text-text-secondary max-w-lg mx-auto">
            Esta conta ainda não possui dados de métricas para o período selecionado.
          </p>
        </div>
      ) : (
        <>
          {/* Campaign context badge */}
          {selectedCampaign && (
            <div className="flex items-center gap-3 bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-2xl px-5 py-4 shadow-sm">
              <span className="text-xs text-primary-light font-bold uppercase tracking-wider">Campanha:</span>
              <span className="text-base font-bold text-white">{selectedCampaign.name}</span>
              <button 
                onClick={() => setSelectedCampaignId('')} 
                className="ml-auto flex items-center gap-2 text-xs font-semibold text-primary-light hover:text-white px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/30 transition-all border border-primary/20"
              >
                Limpar Filtro <X size={14} />
              </button>
            </div>
          )}

          {/* ═══ KPI Cards (3) ═══ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ScrollReveal direction="up" delay={0}><KPICard label="Gasto Total" value={formatCurrency(displayMetrics.spend)} diff={diffs.spend} /></ScrollReveal>
            <ScrollReveal direction="up" delay={100}><KPICard
              label={platform === 'meta' ? 'Conversas' : 'Conversões'}
              value={formatNumber(platform === 'meta' ? displayMetrics.messages : displayMetrics.conversions)}
              diff={diffs.messages}
              invertColors={true}
            /></ScrollReveal>
            <ScrollReveal direction="up" delay={200}><KPICard
              label={platform === 'meta' ? 'Custo por Conversa' : 'Custo por Conversão'}
              value={formatCurrency(platform === 'meta' ? displayMetrics.costPerMessage : displayMetrics.costPerConversion)}
              diff={diffs.costPerMessage}
            /></ScrollReveal>
          </div>



          {/* ═══ Daily Conversations Chart ═══ */}
          <ScrollReveal direction="up" delay={100}>
          <div className="bg-surface/40 rounded-2xl border border-border/50 p-6 shadow-lg shadow-black/10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2.5">
                <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-primary-light to-primary inline-block"></span>
                {platform === 'meta' ? 'Conversas por Dia' : 'Resultados por Dia'}
              </h3>
              {chartData.length > 0 && (
                <span className="text-[10px] text-text-secondary font-medium px-2 py-1 rounded-md bg-surface border border-border/50">
                  {chartData.length} dias
                </span>
              )}
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dailyAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#18C8C8" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#18C8C8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                  <XAxis dataKey="dateLabel" stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <YAxis stroke={AXIS_STROKE} tick={AXIS_TICK} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip metricLabel={platform === 'meta' ? 'Conversas' : 'Resultados'} />} cursor={{ stroke: '#18C8C8', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area
                    type="monotone"
                    dataKey="conversas"
                    stroke="#18C8C8"
                    strokeWidth={2.5}
                    fill="url(#dailyAreaGradient)"
                    name={platform === 'meta' ? 'Conversas' : 'Resultados'}
                    dot={{ r: 3.5, fill: '#13161F', stroke: '#18C8C8', strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: '#18C8C8', stroke: '#13161F', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-text-secondary text-sm text-center py-12">Sem dados diários disponíveis.</p>
            )}
          </div>
          </ScrollReveal>

          {/* ═══ Breakdown Charts (Meta only) ═══ */}
          {platform === 'meta' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Region bar chart */}
              <ScrollReveal direction="up" delay={0}>
              <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg shadow-black/10 h-full">
                <h3 className="text-xs font-semibold text-text-primary mb-4 flex items-center gap-2">
                  <MapPin size={13} className="text-primary-light" />
                  {regionMetricKey === 'mensagens' ? 'Mensagens por Estado' : 'Impressões por Estado'}
                </h3>
                {regionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={regionData} layout="vertical" margin={{ left: 0, right: 10 }}>
                      <defs>
                        <linearGradient id="regionGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#0D9CA6" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#18C8C8" stopOpacity={0.9} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                      <XAxis type="number" stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} allowDecimals={false} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} width={90} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltip metricLabel={regionMetricKey === 'mensagens' ? 'Mensagens' : 'Impressões'} formatter={formatNumber} />} />
                      <Bar
                        dataKey={regionMetricKey}
                        fill="url(#regionGradient)"
                        name={regionMetricKey === 'mensagens' ? 'Mensagens' : 'Impressões'}
                        radius={[0, 4, 4, 0]}
                        barSize={16}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-text-secondary text-xs text-center py-12">
                    {loadingBreakdowns ? 'Carregando...' : 'Sem dados de região.'}
                  </p>
                )}
              </div>
              </ScrollReveal>

              {/* Platform donut chart */}
              <ScrollReveal direction="up" delay={150}>
              <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg shadow-black/10 h-full">
                <h3 className="text-xs font-semibold text-text-primary mb-4 flex items-center gap-2">
                  <Monitor size={13} className="text-primary-light" /> Plataformas
                </h3>
                {platformData.length > 0 ? (
                  <RankedBarList data={platformData} colors={PIE_COLORS} />
                ) : (
                  <p className="text-text-secondary text-xs text-center py-12">
                    {loadingBreakdowns ? 'Carregando...' : 'Sem dados de plataforma.'}
                  </p>
                )}
              </div>
              </ScrollReveal>

              {/* Placement donut chart */}
              <ScrollReveal direction="up" delay={300}>
              <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg shadow-black/10 h-full">
                <h3 className="text-xs font-semibold text-text-primary mb-4 flex items-center gap-2">
                  <Layout size={13} className="text-primary-light" /> Posicionamento
                </h3>
                {placementData.length > 0 ? (
                  <RankedBarList data={placementData} colors={PLACEMENT_COLORS} />
                ) : (
                  <p className="text-text-secondary text-xs text-center py-12">
                    {loadingBreakdowns ? 'Carregando...' : 'Sem dados de posicionamento.'}
                  </p>
                )}
              </div>
              </ScrollReveal>
            </div>
          )}

          {/* ═══ Gender + Age Charts (Meta only) ═══ */}
          {platform === 'meta' && (genderData.length > 0 || ageData.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Gender donut chart */}
              <ScrollReveal direction="up" delay={0}>
              <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg shadow-black/10 h-full">
                <h3 className="text-xs font-semibold text-text-primary mb-4 flex items-center gap-2">
                  <Users size={13} className="text-primary-light" /> Gênero
                </h3>
                {genderData.length > 0 ? (
                  <RankedBarList data={genderData} colors={GENDER_COLORS} />
                ) : (
                  <p className="text-text-secondary text-xs text-center py-12">
                    {loadingBreakdowns ? 'Carregando...' : 'Sem dados de gênero.'}
                  </p>
                )}
              </div>
              </ScrollReveal>

              {/* Age donut chart */}
              <ScrollReveal direction="up" delay={150}>
              <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg shadow-black/10 h-full">
                <h3 className="text-xs font-semibold text-text-primary mb-4 flex items-center gap-2">
                  <Calendar size={13} className="text-primary-light" /> Faixa Etária
                </h3>
                {ageData.length > 0 ? (
                  <RankedBarList data={ageData} colors={AGE_COLORS} />
                ) : (
                  <p className="text-text-secondary text-xs text-center py-12">
                    {loadingBreakdowns ? 'Carregando...' : 'Sem dados de faixa etária.'}
                  </p>
                )}
              </div>
              </ScrollReveal>
            </div>
          )}

          {/* ═══ Visibility + Video Metrics (Meta only) ═══ */}
          {platform === 'meta' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Visibility */}
              <ScrollReveal direction="left" delay={0}>
              <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg shadow-black/10 h-full">
                <h3 className="text-xs font-semibold text-text-primary mb-5 flex items-center gap-2">
                  <Eye size={13} className="text-primary-light" /> Visibilidade
                </h3>
                {(() => {
                  const imp = displayMetrics.impressions || 0;
                  const rch = displayMetrics.reach || 0;
                  const reachPct = imp > 0 ? Math.min((rch / imp) * 100, 100) : 0;
                  const fmtVal = (v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : formatNumber(v);

                  // Comparison bar data for the chart
                  const comparisonData = [
                    { label: 'Impressões', value: imp, pct: 100 },
                    { label: 'Alcance', value: rch, pct: reachPct },
                  ];

                  return (
                    <div className="space-y-4">
                      {/* Top metric cards — same style as Video Retention */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="relative rounded-xl p-3.5 border border-border/40 bg-surface/60">
                          <span className="text-[10px] text-text-secondary block font-medium uppercase tracking-wider mb-1">Impressões</span>
                          <span className="text-xl font-bold text-text-primary">{fmtVal(imp)}</span>
                          <div className="absolute top-3 right-3">
                            <DiffIndicator diff={diffs.impressions} invertColors={true} />
                          </div>
                        </div>
                        <div className="relative rounded-xl p-3.5 border border-border/40 bg-surface/60">
                          <span className="text-[10px] text-text-secondary block font-medium uppercase tracking-wider mb-1">Alcance</span>
                          <span className="text-xl font-bold text-text-primary">{fmtVal(rch)}</span>
                          <div className="absolute top-3 right-3">
                            <DiffIndicator diff={diffs.reach} invertColors={true} />
                          </div>
                        </div>
                      </div>

                      {/* Area chart — Impressões vs Alcance comparison */}
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={comparisonData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barCategoryGap="25%">
                          <defs>
                            <linearGradient id="visImpGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0FA5AE" stopOpacity={0.9} />
                              <stop offset="100%" stopColor="#0FA5AE" stopOpacity={0.3} />
                            </linearGradient>
                            <linearGradient id="visRchGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2DD4A8" stopOpacity={0.9} />
                              <stop offset="100%" stopColor="#2DD4A8" stopOpacity={0.3} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                          <XAxis dataKey="label" stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} tickLine={false} axisLine={false} />
                          <YAxis stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} unit="%" domain={[0, 100]} tickLine={false} axisLine={false} />
                          <Tooltip content={<ChartTooltip metricLabel="Proporção" formatter={v => `${v.toFixed(1)}%`} />} />
                          <Bar dataKey="pct" radius={[6, 6, 0, 0]} barSize={40}>
                            {comparisonData.map((entry, i) => (
                              <Cell key={i} fill={i === 0 ? 'url(#visImpGrad)' : i === 1 ? 'url(#visRchGrad)' : 'rgba(15,165,174,0.25)'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>

                      {/* Bottom metrics — CPM, Frequência e CTR */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border/30">
                        <div className="relative rounded-xl p-3 bg-surface/60 border border-border/30 overflow-hidden">
                          <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-primary-light to-emerald-400 rounded-b-xl transition-all duration-700"
                            style={{ width: '100%' }} />
                          <span className="text-[9px] text-text-secondary block font-medium uppercase tracking-wider mb-1">CPM</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-bold text-text-primary" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                              {formatCurrency(displayMetrics.cpm)}
                            </span>
                            <DiffIndicator diff={diffs.cpm} />
                          </div>
                        </div>
                        <div className="relative rounded-xl p-3 bg-surface/60 border border-border/30 overflow-hidden">
                          <div className={`absolute bottom-0 left-0 h-1 rounded-b-xl transition-all duration-700 ${displayMetrics.frequency > 3 ? 'bg-gradient-to-r from-danger to-danger/60' : displayMetrics.frequency > 2 ? 'bg-gradient-to-r from-warning to-warning/60' : 'bg-gradient-to-r from-emerald-400 to-emerald-300'}`}
                            style={{ width: `${Math.min((displayMetrics.frequency / 5) * 100, 100)}%` }} />
                          <span className="text-[9px] text-text-secondary block font-medium uppercase tracking-wider mb-1">Frequência</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className={`text-sm font-bold ${displayMetrics.frequency > 3 ? 'text-danger' : displayMetrics.frequency > 2 ? 'text-warning' : 'text-text-primary'}`}
                              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                              {displayMetrics.frequency > 0 ? displayMetrics.frequency.toFixed(2) : '—'}
                            </span>
                            <DiffIndicator diff={diffs.frequency} />
                          </div>
                          {displayMetrics.frequency > 3 && (
                            <div className="absolute top-1 right-1">
                              <span className="text-[7px] bg-danger/10 text-danger border border-danger/20 px-1 rounded font-bold uppercase">Alto</span>
                            </div>
                          )}
                        </div>
                        <div className="relative rounded-xl p-3 bg-surface/60 border border-border/30 overflow-hidden">
                          <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-primary to-primary-light rounded-b-xl transition-all duration-700"
                            style={{ width: `${Math.min((displayMetrics.ctr || 0) * 10, 100)}%` }} />
                          <span className="text-[9px] text-text-secondary block font-medium uppercase tracking-wider mb-1">CTR</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-bold text-text-primary" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                              {displayMetrics.ctr > 0 ? `${displayMetrics.ctr.toFixed(2)}%` : '—'}
                            </span>
                            <DiffIndicator diff={diffs.ctr} invertColors={true} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              </ScrollReveal>

              {/* Video Retention */}
              <ScrollReveal direction="right" delay={150}>
              <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg shadow-black/10 h-full">
                <h3 className="text-xs font-semibold text-text-primary mb-5 flex items-center gap-2">
                  <Video size={13} className="text-primary-light" /> Retenção de Vídeo
                </h3>
                {videoData ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative rounded-xl p-3.5 border border-border/40 bg-surface/60">
                        <span className="text-[10px] text-text-secondary block font-medium uppercase tracking-wider mb-1">Reproduções</span>
                        <span className="text-xl font-bold text-text-primary">{formatNumber(videoData.plays)}</span>
                        <div className="absolute top-3 right-3">
                          <DiffIndicator diff={diffs.plays} invertColors={true} />
                        </div>
                      </div>
                      <div className="relative rounded-xl p-3.5 border border-border/40 bg-surface/60">
                        <span className="text-[10px] text-text-secondary block font-medium uppercase tracking-wider mb-1">Tempo Médio</span>
                        <span className="text-xl font-bold text-text-primary">{formatSeconds(videoData.avgWatchTime)}</span>
                        <div className="absolute top-3 right-3">
                          <DiffIndicator diff={diffs.avgWatchTime} invertColors={true} />
                        </div>
                      </div>
                    </div>
                    {videoRetentionChart.length > 0 && (
                      <>
                        {/* Bar chart — same style as visibility */}
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={videoRetentionChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barCategoryGap="20%">
                            <defs>
                              <linearGradient id="retBarGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0FA5AE" stopOpacity={0.9} />
                                <stop offset="100%" stopColor="#20CFCF" stopOpacity={0.3} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                            <XAxis dataKey="label" stroke={AXIS_STROKE} tick={{ ...AXIS_TICK, fontSize: 10 }} tickLine={false} axisLine={false} />
                            <YAxis
                              stroke={AXIS_STROKE}
                              tick={{ ...AXIS_TICK, fontSize: 10 }}
                              tickFormatter={formatNumber}
                              allowDecimals={false}
                              tickLine={false}
                              axisLine={false}
                              width={48}
                            />
                            <Tooltip content={<ChartTooltip metricLabel="Reproduções" formatter={formatNumber} />} />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={32} fill="url(#retBarGrad)">
                              {videoRetentionChart.map((entry, i) => {
                                const colors = ['#0FA5AE', '#15B8B8', '#20CFCF', '#2DD4A8', '#34D399'];
                                return <Cell key={i} fill={colors[i] || colors[0]} fillOpacity={0.85} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>

                        {/* Video retention milestone cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border/30">
                          {[
                            { label: 'Visualizou 25%', value: videoData.p25, pct: videoData.plays > 0 ? (videoData.p25 / videoData.plays * 100) : 0, color: 'from-primary to-primary-light' },
                            { label: 'Visualizou 50%', value: videoData.p50, pct: videoData.plays > 0 ? (videoData.p50 / videoData.plays * 100) : 0, color: 'from-primary-light to-emerald-400' },
                            { label: 'Visualizou 75%', value: videoData.p75, pct: videoData.plays > 0 ? (videoData.p75 / videoData.plays * 100) : 0, color: 'from-emerald-400 to-emerald-300' },
                          ].map((m, i) => (
                            <div key={i} className="relative rounded-xl p-3 bg-surface/60 border border-border/30 overflow-hidden">
                              <div className={`absolute bottom-0 left-0 h-2.5 bg-gradient-to-r ${m.color} rounded-b-xl transition-all duration-700`}
                                style={{ width: `${Math.min(m.pct, 100)}%` }} />
                              <span className="text-[9px] text-text-secondary block font-medium uppercase tracking-wider mb-1">{m.label}</span>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-sm font-bold text-text-primary" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                                  {formatNumber(m.value)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-text-secondary text-xs text-center py-12">
                    {loadingBreakdowns ? 'Carregando...' : 'Sem dados de vídeo para este período.'}
                  </p>
                )}
              </div>
              </ScrollReveal>
            </div>
          )}

          {/* ═══ ANÁLISE COM IA ═══ */}
          {/* ═══ DIAGNÓSTICO & SUGESTÕES ═══ */}
          {analysisResult && (
            <div className="col-span-full space-y-6 mt-2">
              {/* Diagnóstico */}
              <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-600/10 border border-violet-500/20">
                    <Activity size={16} className="text-violet-400" />
                  </div>
                  <h2 className="text-lg font-bold text-text-primary">Diagnóstico</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-light border border-primary/20">
                    {analysisResult.diagnostics.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analysisResult.diagnostics.map((diag) => {
                    const config = SEVERITY_CONFIG[diag.severity];
                    const Icon = config.icon;
                    return (
                      <div key={diag.id} className={`relative overflow-hidden rounded-2xl border ${config.border} bg-gradient-to-br ${config.gradient} backdrop-blur-sm shadow-lg ${config.glow} hover:scale-[1.01] transition-all duration-300`}>
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${config.accentBar}`} />
                        <div className="p-5 pl-6">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`flex items-center justify-center w-9 h-9 rounded-xl bg-black/20 ${config.pulse}`}>
                                <Icon size={18} className={config.iconColor} />
                              </div>
                              <div>
                                <h3 className="font-semibold text-text-primary text-sm leading-tight">{diag.title}</h3>
                                <span className="text-xs text-text-secondary">{diag.metric}</span>
                              </div>
                            </div>
                            <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg border ${config.badge}`}>{config.badgeLabel}</span>
                          </div>
                          {diag.value && (
                            <div className="flex items-baseline gap-2 mb-2">
                              <span className={`text-2xl font-bold ${config.iconColor}`}>{diag.value}</span>
                              {diag.comparison && <span className="text-xs text-text-secondary">/ {diag.comparison}</span>}
                            </div>
                          )}
                          {!diag.value && diag.comparison && <p className="text-xs text-primary-light/70 mb-2">📊 {diag.comparison}</p>}
                          <p className="text-sm text-text-secondary leading-relaxed mb-2">{diag.description}</p>
                          {diag.cause && <p className="text-xs text-text-secondary/70 italic leading-relaxed">💡 {diag.cause}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {analysisResult.diagnostics.length === 0 && (
                  <div className="text-center py-10 text-text-secondary">
                    <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400/50" />
                    <p className="text-sm">Nenhum diagnóstico significativo.</p>
                  </div>
                )}
              </div>

              {/* Sugestões de Melhoria */}
              <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20">
                    <Lightbulb size={16} className="text-amber-400" />
                  </div>
                  <h2 className="text-lg font-bold text-text-primary">Sugestões de Melhoria</h2>
                  {analysisResult.suggestions.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-light border border-primary/20">
                      {analysisResult.suggestions.length} ações
                    </span>
                  )}
                </div>
                {analysisResult.suggestions.length > 0 ? (
                  <div className="space-y-3">
                    {analysisResult.suggestions.map((sug, i) => {
                      const pConfig = PRIORITY_CONFIG[sug.priority] || PRIORITY_CONFIG['média'];
                      const PriorityIcon = pConfig.icon;
                      return (
                        <div key={sug.id} className="group relative overflow-hidden rounded-2xl border border-border bg-surface/80 backdrop-blur-sm hover:border-primary/30 hover:bg-surface transition-all duration-300">
                          <div className="p-5">
                            <div className="flex items-start gap-4">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 border border-primary/20 shrink-0">
                                <span className="text-sm font-bold text-primary-light">{i + 1}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <h3 className="font-semibold text-text-primary text-sm">{sug.action}</h3>
                                  <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border ${pConfig.bg} ${pConfig.color}`}>
                                    <PriorityIcon size={12} /> {pConfig.label}
                                  </span>
                                </div>
                                <p className="text-sm text-text-secondary leading-relaxed">{sug.reason}</p>
                              </div>
                            </div>
                          </div>
                          <div className="absolute inset-y-0 left-0 w-1 bg-primary/0 group-hover:bg-primary/60 transition-all duration-300" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 rounded-2xl border border-border bg-surface/50">
                    <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400/50" />
                    <p className="text-sm text-text-secondary">Nenhuma sugestão — a campanha está performando bem!</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════

function DiffIndicator({ diff, invertColors = false, className = '' }) {
  if (diff === undefined || diff === null) return null;
  const isPositive = diff > 0;
  const isGood = invertColors ? isPositive : !isPositive;
  const color = isGood ? 'text-success' : 'text-danger';
  const Arrow = isPositive ? TrendingUp : TrendingDown;
  
  return (
    <div className={`flex items-center gap-0.5 text-[9px] font-bold ${color} ${className}`}>
      <Arrow size={10} />
      {Math.abs(diff).toFixed(1)}%
    </div>
  );
}

function KPICard({ label, value, diff, invertColors = false }) {
  return (
    <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg shadow-black/10 transition-all duration-300 hover:border-border relative overflow-hidden group">
      <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{label}</span>
      <p className="text-2xl font-bold text-text-primary mt-1.5 tracking-tight">{value}</p>
      {diff !== undefined && diff !== 0 && (() => {
        const isPositive = diff > 0;
        const isGood = invertColors ? isPositive : !isPositive;
        return (
          <div className={`flex items-center gap-1 text-[11px] font-semibold mt-2.5 px-2 py-0.5 rounded-md w-fit ${isGood ? 'bg-success/8 text-success' : 'bg-danger/8 text-danger'}`}>
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(diff).toFixed(1)}% vs. período anterior
          </div>
        );
      })()}
    </div>
  );
}

function MiniMetric({ label, value, good }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wider">{label}</span>
      <p className={`text-lg font-bold mt-0.5 ${good ? 'text-success' : 'text-warning'}`}>{value}</p>
    </div>
  );
}
