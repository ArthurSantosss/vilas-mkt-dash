import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import {
  fetchVideoMetrics, fetchCampaignDailyInsights, fetchCampaignPreviousPeriodInsights,
  fetchAgeBreakdown, fetchGenderBreakdown, fetchPlatformBreakdown, fetchPlacementBreakdown,
} from '../../services/metaApi';
import { analyzeCampaign as analyzeLocal } from '../../services/campaignAnalysis';
import { invokeAnalyzeCampaign } from '../../services/aiReports';
import { supabase } from '../../services/supabase';
import PeriodSelector from '../../shared/components/PeriodSelector';
import {
  Activity, AlertTriangle, CheckCircle2, XCircle,
  Copy, Check, Sparkles, Brain, MessageSquareText, Lightbulb,
  Zap, Shield, Target, BarChart3, RefreshCw, WifiOff,
  FileText, Loader2, ChevronRight, X
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateBR(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function getPeriodLabel(period) {
  if (typeof period === 'object' && period.type === 'custom') {
    const start = new Date(period.startDate + 'T00:00:00');
    const end = new Date(period.endDate + 'T00:00:00');
    return `${fmtDateBR(start)} a ${fmtDateBR(end)}`;
  }
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  let startDate;
  switch (period) {
    case 'today': return fmtDateBR(today);
    case 'yesterday': return fmtDateBR(yesterday);
    case '7d':
      startDate = new Date(yesterday); startDate.setDate(startDate.getDate() - 6);
      return `${fmtDateBR(startDate)} a ${fmtDateBR(yesterday)}`;
    case '30d':
      startDate = new Date(yesterday); startDate.setDate(startDate.getDate() - 29);
      return `${fmtDateBR(startDate)} a ${fmtDateBR(yesterday)}`;
    case 'month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      return `${fmtDateBR(startDate)} a ${fmtDateBR(yesterday)}`;
    default:
      startDate = new Date(yesterday); startDate.setDate(startDate.getDate() - 6);
      return `${fmtDateBR(startDate)} a ${fmtDateBR(yesterday)}`;
  }
}

function getMessagesFromActions(actions) {
  if (!actions || !Array.isArray(actions)) return 0;
  const types = [
    'onsite_conversion.messaging_conversation_started_7d',
    'messaging_conversation_started_7d',
    'onsite_conversion.messaging_first_reply',
    'messaging_first_reply',
  ];
  for (const t of types) {
    const found = actions.find(a => a.action_type === t);
    if (found) return parseInt(found.value, 10);
  }
  const anyMsg = actions.find(a => a.action_type?.includes('messaging'));
  return anyMsg ? parseInt(anyMsg.value, 10) : 0;
}

function cacheKey(campaignId, period) {
  const p = typeof period === 'object' ? `${period.startDate}_${period.endDate}` : period;
  return `${campaignId}__${p}`;
}

// ─── Visual configs (unchanged) ──────────────────────────────────────────────

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

// ─── CopyButton sub-component ────────────────────────────────────────────────

function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
        transition-all duration-300 ease-out shrink-0
        ${copied
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          : 'bg-primary/10 text-primary-light border border-primary/20 hover:bg-primary/20 hover:scale-105 active:scale-95'
        } ${className}`}
    >
      {copied ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar</>}
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CampaignAnalysis() {
  const { accounts, campaigns } = useMetaAds();
  const { agencies, accountAgencies } = useAgency();

  // Selectors
  const [selectedAgency, setSelectedAgency] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [currentPeriod, setCurrentPeriod] = useState('7d');

  // Local analysis state (diagnostics + suggestions)
  const [localResult, setLocalResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  // AI report state
  const [reportResult, setReportResult] = useState(null); // { relatorio }
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  // Cache for AI reports: Map<cacheKey, reportResult>
  const reportCacheRef = useRef(new Map());

  // Collected data ref (to share between analysis and report generation)
  const collectedDataRef = useRef(null);

  // Deep analysis state (structured AI: diagnosticos, acoes, insights)
  const [deepResult, setDeepResult] = useState(null);
  const [loadingDeep, setLoadingDeep] = useState(false);
  const [deepError, setDeepError] = useState(null);

  // Animation state
  const [visibleCards, setVisibleCards] = useState(new Set());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // ── Derived data ──

  const filteredAccounts = useMemo(() => {
    if (!selectedAgency) return accounts;
    return accounts.filter(a => accountAgencies[a.id] === selectedAgency);
  }, [accounts, selectedAgency, accountAgencies]);

  // All campaigns for this account that had ANY data in the period (spend, impressions, messages, or active status)
  const accountCampaigns = useMemo(() => {
    if (!selectedAccountId) return [];
    return campaigns
      .filter(c => c.accountId === selectedAccountId)
      .filter(c => {
        const m = c.metrics || {};
        const spend = m.spend ?? c.spend ?? 0;
        const impressions = m.impressions ?? 0;
        const messages = m.messages ?? 0;
        // Include if had any activity in the period OR is currently active
        return spend > 0 || impressions > 0 || messages > 0 || c.status === 'active';
      });
  }, [campaigns, selectedAccountId]);

  const isAllCampaigns = selectedCampaignId === '__all__';

  const selectedCampaign = useMemo(() => {
    if (isAllCampaigns) return null;
    return accountCampaigns.find(c => c.id === selectedCampaignId) || null;
  }, [accountCampaigns, selectedCampaignId, isAllCampaigns]);

  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === selectedAccountId) || null;
  }, [accounts, selectedAccountId]);

  // Auto-select first account
  useEffect(() => {
    if (filteredAccounts.length > 0 && !filteredAccounts.find(a => a.id === selectedAccountId)) {
      setSelectedAccountId(filteredAccounts[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedAccountId intentionally omitted to avoid resetting selection on every change
  }, [filteredAccounts]);

  // Reset on account change
  useEffect(() => {
    setSelectedCampaignId('');
    setLocalResult(null);
    setReportResult(null);
    setReportError(null);
    setDeepResult(null);
    setDeepError(null);
  }, [selectedAccountId]);

  // Reset on campaign/period change
  useEffect(() => {
    setLocalResult(null);
    setReportResult(null);
    setReportError(null);
    setDeepResult(null);
    setDeepError(null);
    setVisibleCards(new Set());
    setShowSuggestions(false);
    setShowReport(false);
    collectedDataRef.current = null;
  }, [selectedCampaignId, currentPeriod]);

  // ── Run local analysis (diagnostics + suggestions) ──

  const runAnalysis = useCallback(async () => {
    if (!isAllCampaigns && !selectedCampaign) return;

    setAnalyzing(true);
    setLocalResult(null);
    setReportResult(null);
    setReportError(null);
    setVisibleCards(new Set());
    setShowSuggestions(false);
    setShowReport(false);

    try {
      // All campaigns with any data in the period
      const allCampsWithData = accountCampaigns.filter(c => {
        const m = c.metrics || {};
        return (m.spend ?? 0) > 0 || (m.impressions ?? 0) > 0 || (m.messages ?? 0) > 0;
      });

      if (isAllCampaigns) {
        // ── ALL CAMPAIGNS MODE ──
        // Fetch breakdowns at account level
        const [ageData, genderData, platformData, placementData] = await Promise.allSettled([
          fetchAgeBreakdown(selectedAccountId, currentPeriod),
          fetchGenderBreakdown(selectedAccountId, currentPeriod),
          fetchPlatformBreakdown(selectedAccountId, currentPeriod),
          fetchPlacementBreakdown(selectedAccountId, currentPeriod),
        ]);

        collectedDataRef.current = {
          parsedDaily: [], parsedPrevDaily: [], parsedVideo: null,
          metrics: null, siblingCampaigns: allCampsWithData,
          allCampaigns: allCampsWithData,
          rawAge: ageData.status === 'fulfilled' ? ageData.value : [],
          rawGender: genderData.status === 'fulfilled' ? genderData.value : [],
          rawPlatform: platformData.status === 'fulfilled' ? platformData.value : [],
          rawPlacement: placementData.status === 'fulfilled' ? placementData.value : [],
        };

        // Skip local analysis — go directly to report
        setShowReport(true);

        // Check report cache
        const key = cacheKey('__all__', currentPeriod);
        const cached = reportCacheRef.current.get(key);
        if (cached) {
          setReportResult(cached);
        }

      } else {
        // ── SINGLE CAMPAIGN MODE (original) ──
        const [videoData, dailyInsights, prevDailyInsights, ageData, genderData, platformData, placementData] = await Promise.allSettled([
          fetchVideoMetrics(selectedCampaign.id, currentPeriod),
          fetchCampaignDailyInsights(selectedCampaign.id, currentPeriod),
          fetchCampaignPreviousPeriodInsights(selectedCampaign.id, currentPeriod),
          fetchAgeBreakdown(selectedCampaign.id, currentPeriod),
          fetchGenderBreakdown(selectedCampaign.id, currentPeriod),
          fetchPlatformBreakdown(selectedCampaign.id, currentPeriod),
          fetchPlacementBreakdown(selectedCampaign.id, currentPeriod),
        ]);

        const video = videoData.status === 'fulfilled' ? videoData.value : null;
        const daily = dailyInsights.status === 'fulfilled' ? dailyInsights.value : [];
        const prevDaily = prevDailyInsights.status === 'fulfilled' ? prevDailyInsights.value : [];
        const rawAge = ageData.status === 'fulfilled' ? ageData.value : [];
        const rawGender = genderData.status === 'fulfilled' ? genderData.value : [];
        const rawPlatform = platformData.status === 'fulfilled' ? platformData.value : [];
        const rawPlacement = placementData.status === 'fulfilled' ? placementData.value : [];

        // Parse video
        let parsedVideo = null;
        if (video) {
          const getV = (arr) => {
            if (!arr || !Array.isArray(arr)) return 0;
            const v = arr.find(a => a.action_type === 'video_view');
            return v ? parseInt(v.value, 10) : (arr[0] ? parseInt(arr[0].value, 10) : 0);
          };
          parsedVideo = {
            plays: getV(video.video_play_actions),
            p25: getV(video.video_p25_watched_actions),
            p50: getV(video.video_p50_watched_actions),
            p75: getV(video.video_p75_watched_actions),
            p100: getV(video.video_p100_watched_actions),
          };
          if (parsedVideo.plays === 0) parsedVideo = null;
        }

        const parseDaily = (raw) => raw.map(d => ({
          date_start: d.date_start, date: d.date_start,
          spend: d.spend, impressions: d.impressions, cpm: d.cpm, ctr: d.ctr,
          actions: d.actions, reach: d.reach, frequency: d.frequency,
          messages: getMessagesFromActions(d.actions),
        }));

        const parsedDaily = parseDaily(daily);
        const parsedPrevDaily = parseDaily(prevDaily);

        const metrics = {
          spend: selectedCampaign.metrics?.spend ?? 0,
          impressions: selectedCampaign.metrics?.impressions ?? 0,
          cpm: selectedCampaign.metrics?.cpm ?? 0,
          ctr: selectedCampaign.metrics?.ctr ?? 0,
          reach: selectedCampaign.metrics?.reach ?? 0,
          frequency: selectedCampaign.metrics?.frequency ?? 0,
          messages: selectedCampaign.metrics?.messages ?? 0,
          costPerMessage: selectedCampaign.metrics?.costPerMessage ?? 0,
        };

        const siblingCampaigns = allCampsWithData;

        // Run LOCAL analysis
        const result = analyzeLocal({
          campaignName: selectedCampaign.name,
          metrics,
          dailyMetrics: parsedDaily,
          prevDailyMetrics: parsedPrevDaily,
          siblingCampaigns,
          campaignId: selectedCampaign.id,
          videoData: parsedVideo,
          campaign: selectedCampaign,
          periodLabel: getPeriodLabel(currentPeriod),
        });

        setLocalResult(result);

        // Save collected data for AI report generation later
        collectedDataRef.current = {
          parsedDaily, parsedPrevDaily, parsedVideo, metrics, siblingCampaigns,
          rawAge, rawGender, rawPlatform, rawPlacement,
        };

        // Stagger animations
        result.diagnostics.forEach((d, i) => {
          setTimeout(() => setVisibleCards(prev => new Set([...prev, d.id])), 150 * i);
        });
        setTimeout(() => setShowSuggestions(true), 150 * result.diagnostics.length + 300);
        setTimeout(() => setShowReport(true), 150 * result.diagnostics.length + 600);

        // Check report cache
        const key = cacheKey(selectedCampaignId, currentPeriod);
        const cached = reportCacheRef.current.get(key);
        if (cached) {
          setReportResult(cached);
        }
      }

    } catch (err) {
      console.error('Erro na análise:', err);
    } finally {
      setAnalyzing(false);
    }
  }, [selectedCampaign, selectedCampaignId, isAllCampaigns, selectedAccountId, currentPeriod, accountCampaigns]);

  // ── Generate AI report ──

  const generateReport = useCallback(async (forceRefresh = false) => {
    if (!isAllCampaigns && !selectedCampaign) return;
    if (!collectedDataRef.current) return;

    const key = cacheKey(isAllCampaigns ? '__all__' : selectedCampaignId, currentPeriod);

    // Check cache
    if (!forceRefresh) {
      const cached = reportCacheRef.current.get(key);
      if (cached) {
        setReportResult(cached);
        return;
      }
    }

    setGeneratingReport(true);
    setReportError(null);
    setReportResult(null);

    try {
      const { parsedPrevDaily, parsedVideo, siblingCampaigns, rawAge, rawGender, rawPlatform, rawPlacement } = collectedDataRef.current;

      // ── Parse breakdowns into structured format ──
      const parseBreakdown = (raw, labelKey) => {
        if (!raw || raw.length === 0) return null;
        const segments = raw.map(row => {
          const msgs = getMessagesFromActions(row.actions);
          const spend = parseFloat(row.spend || 0);
          return {
            label: row[labelKey] || 'Desconhecido',
            messages: msgs,
            spend,
            costPerMessage: msgs > 0 ? spend / msgs : 0,
          };
        }).filter(s => s.spend > 0);
        return segments.length > 0 ? segments : null;
      };

      const genderLabelMap = { male: 'Masculino', female: 'Feminino', unknown: 'Desconhecido' };
      const parseGenderBreakdown = (raw) => {
        if (!raw || raw.length === 0) return null;
        const segments = raw.map(row => {
          const msgs = getMessagesFromActions(row.actions);
          const spend = parseFloat(row.spend || 0);
          return {
            label: genderLabelMap[row.gender] || row.gender || 'Desconhecido',
            messages: msgs,
            spend,
            costPerMessage: msgs > 0 ? spend / msgs : 0,
          };
        }).filter(s => s.spend > 0);
        return segments.length > 0 ? segments : null;
      };

      const parsePlacementBreakdown = (raw) => {
        if (!raw || raw.length === 0) return null;
        const segments = raw.map(row => {
          const msgs = getMessagesFromActions(row.actions);
          const spend = parseFloat(row.spend || 0);
          const platform = row.publisher_platform || '';
          const position = row.platform_position || '';
          return {
            label: position ? `${platform} — ${position}` : platform,
            messages: msgs,
            spend,
            costPerMessage: msgs > 0 ? spend / msgs : 0,
          };
        }).filter(s => s.spend > 0);
        return segments.length > 0 ? segments : null;
      };

      const breakdowns = {
        age: parseBreakdown(rawAge, 'age'),
        gender: parseGenderBreakdown(rawGender),
        platform: parseBreakdown(rawPlatform, 'publisher_platform'),
        placement: parsePlacementBreakdown(rawPlacement),
      };

      // Build campaigns array for the AI
      const buildCampaignData = (camp) => {
        const m = camp.metrics || {};
        const data = {
          name: camp.name,
          objective: camp.objective || 'mensagens',
          spend: m.spend ?? 0,
          impressions: m.impressions ?? 0,
          clicks: m.cpc > 0 && m.spend > 0 ? Math.round(m.spend / m.cpc) : 0,
          ctr: m.ctr ?? 0,
          cpc: m.cpc ?? 0,
          cpm: m.cpm ?? 0,
          messages: m.messages ?? 0,
          costPerMessage: m.costPerMessage ?? 0,
          frequency: m.frequency ?? 0,
        };
        // Video rates (only for single campaign mode)
        if (parsedVideo && selectedCampaign && camp.id === selectedCampaign.id && parsedVideo.plays > 0) {
          data.hookRate = (parsedVideo.p25 / parsedVideo.plays) * 100;
          data.holdRate = (parsedVideo.p100 / parsedVideo.plays) * 100;
        }
        return data;
      };

      let campaignsForAI;
      let previousPeriodCampaigns = null;

      if (isAllCampaigns) {
        // ALL CAMPAIGNS — build data then merge campaigns with same cleaned name
        const allCamps = collectedDataRef.current.allCampaigns || siblingCampaigns;
        const allBuilt = allCamps.map(c => buildCampaignData(c));

        // Clean campaign name: remove everything in brackets [...], then optionally remove "C13 - " prefix only if content remains
        const cleanName = (name) => {
          let cleaned = name.replace(/\[.*?\]\s*/g, '').trim();
          // Remove "C13 - " prefix only if there's content after it
          const withoutPrefix = cleaned.replace(/^C\d+\s*-?\s*/i, '').trim();
          return withoutPrefix || cleaned; // fallback to original if removing prefix empties it
        };

        // Group by cleaned name (case-insensitive)
        const grouped = {};
        const displayNames = {}; // keep original casing for display
        for (const c of allBuilt) {
          const cleaned = cleanName(c.name);
          const key = cleaned.toLowerCase();
          if (!grouped[key]) {
            displayNames[key] = cleaned; // keep readable version
            grouped[key] = { ...c, name: cleaned };
          } else {
            const g = grouped[key];
            g.spend += c.spend;
            g.impressions += c.impressions;
            g.clicks += c.clicks;
            g.messages += c.messages;
            // Recalculate derived metrics from summed values
            g.costPerMessage = g.messages > 0 ? g.spend / g.messages : 0;
            g.cpm = g.impressions > 0 ? (g.spend / g.impressions) * 1000 : 0;
            g.ctr = g.impressions > 0 ? (g.clicks / g.impressions) * 100 : 0;
            g.cpc = g.clicks > 0 ? g.spend / g.clicks : 0;
            // Average frequency (weighted would be better but this is good enough)
            g.frequency = c.frequency > 0 ? (g.frequency + c.frequency) / 2 : g.frequency;
          }
        }

        campaignsForAI = Object.values(grouped);
      } else {
        // SINGLE CAMPAIGN
        campaignsForAI = [buildCampaignData(selectedCampaign)];

        // Compute previous period aggregates for the selected campaign
        if (parsedPrevDaily && parsedPrevDaily.length > 0) {
          const totalSpend = parsedPrevDaily.reduce((s, d) => s + parseFloat(d.spend || 0), 0);
          const totalImp = parsedPrevDaily.reduce((s, d) => s + parseInt(d.impressions || 0, 10), 0);
          const totalMsgs = parsedPrevDaily.reduce((s, d) => s + (d.messages || 0), 0);
          const ctrVals = parsedPrevDaily.map(d => parseFloat(d.ctr || 0)).filter(v => v > 0);
          const freqVals = parsedPrevDaily.map(d => parseFloat(d.frequency || 0)).filter(v => v > 0);

          previousPeriodCampaigns = [{
            name: selectedCampaign.name,
            spend: totalSpend,
            impressions: totalImp,
            messages: totalMsgs,
            costPerMessage: totalMsgs > 0 ? totalSpend / totalMsgs : 0,
            cpm: totalImp > 0 ? (totalSpend / totalImp) * 1000 : 0,
            ctr: ctrVals.length > 0 ? ctrVals.reduce((s, v) => s + v, 0) / ctrVals.length : 0,
            frequency: freqVals.length > 0 ? freqVals.reduce((s, v) => s + v, 0) / freqVals.length : 0,
          }];
        }
      }

      const aiResult = await invokeAnalyzeCampaign({
        accountName: selectedAccount?.clientName || '',
        platform: 'Meta Ads',
        periodLabel: getPeriodLabel(currentPeriod),
        todayDate: fmtDateBR(new Date()),
        campaigns: campaignsForAI,
        previousPeriodCampaigns,
        breakdowns,
      });

      const report = {
        relatorio: aiResult.analysis || '',
      };

      reportCacheRef.current.set(key, report);
      setReportResult(report);

    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      setReportError(err.message || 'Erro ao gerar relatório com IA.');
    } finally {
      setGeneratingReport(false);
    }
  }, [selectedCampaign, selectedCampaignId, isAllCampaigns, currentPeriod, selectedAccount]);

  // ── Deep Analysis (structured: diagnosticos, acoes, insights via deep-analysis edge function) ──

  const runDeepAnalysis = useCallback(async () => {
    if (!selectedAccountId || (!isAllCampaigns && !selectedCampaign)) return;
    if (!collectedDataRef.current) return;

    setLoadingDeep(true);
    setDeepError(null);
    setDeepResult(null);

    try {
      const { parsedPrevDaily, parsedVideo, siblingCampaigns, rawAge, rawGender, rawPlatform, rawPlacement } = collectedDataRef.current;

      // Build breakdowns
      const genderLabelMap = { male: 'Masculino', female: 'Feminino', unknown: 'Desconhecido' };
      const parseSegments = (raw, getLabel) => {
        if (!raw || raw.length === 0) return null;
        const segments = raw.map(row => {
          const msgs = getMessagesFromActions(row.actions);
          const spend = parseFloat(row.spend || 0);
          return { label: getLabel(row), messages: msgs, spend, costPerMessage: msgs > 0 ? spend / msgs : 0 };
        }).filter(s => s.spend > 0);
        return segments.length > 0 ? segments : null;
      };

      const breakdowns = {
        age: parseSegments(rawAge, r => r.age || 'Desconhecido'),
        gender: parseSegments(rawGender, r => genderLabelMap[r.gender] || r.gender || 'Desconhecido'),
        platform: parseSegments(rawPlatform, r => r.publisher_platform || 'Desconhecido'),
        placement: parseSegments(rawPlacement, r => {
          const platform = r.publisher_platform || '';
          const position = r.platform_position || '';
          return position ? `${platform} — ${position}` : platform;
        }),
      };

      // Build metrics from campaigns
      const allCamps = isAllCampaigns
        ? (collectedDataRef.current.allCampaigns || siblingCampaigns)
        : [selectedCampaign];

      const activeWithData = allCamps.filter(c => {
        const m = c.metrics || {};
        return (m.spend ?? 0) > 0 || (m.impressions ?? 0) > 0;
      });

      const totalSpend = activeWithData.reduce((s, c) => s + (c.metrics?.spend ?? 0), 0);
      const totalImpressions = activeWithData.reduce((s, c) => s + (c.metrics?.impressions ?? 0), 0);
      const totalReach = activeWithData.reduce((s, c) => s + (c.metrics?.reach ?? 0), 0);
      const totalMessages = activeWithData.reduce((s, c) => s + (c.metrics?.messages ?? 0), 0);

      const metrics = {
        spend: totalSpend,
        messages: totalMessages,
        costPerMessage: totalMessages > 0 ? totalSpend / totalMessages : 0,
        impressions: totalImpressions,
        reach: totalReach,
        cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
        ctr: activeWithData.length > 0 ? activeWithData.reduce((s, c) => s + (c.metrics?.ctr ?? 0), 0) / activeWithData.length : 0,
        frequency: activeWithData.length > 0 ? activeWithData.reduce((s, c) => s + (c.metrics?.frequency ?? 0), 0) / activeWithData.length : 0,
      };

      // Previous period metrics
      let previousMetrics = null;
      if (parsedPrevDaily && parsedPrevDaily.length > 0) {
        const prevSpend = parsedPrevDaily.reduce((s, d) => s + parseFloat(d.spend || 0), 0);
        const prevImp = parsedPrevDaily.reduce((s, d) => s + parseInt(d.impressions || 0, 10), 0);
        const prevMsgs = parsedPrevDaily.reduce((s, d) => s + (d.messages || 0), 0);
        previousMetrics = {
          spend: prevSpend,
          messages: prevMsgs,
          costPerMessage: prevMsgs > 0 ? prevSpend / prevMsgs : 0,
          impressions: prevImp,
          cpm: prevImp > 0 ? (prevSpend / prevImp) * 1000 : 0,
        };
      }

      // Video data
      let videoPayload = null;
      if (parsedVideo && parsedVideo.plays > 0) {
        videoPayload = {
          plays: parsedVideo.plays,
          hookRate: parsedVideo.p25 ? (parsedVideo.p25 / parsedVideo.plays * 100) : 0,
          holdRate: parsedVideo.p75 ? (parsedVideo.p75 / parsedVideo.plays * 100) : 0,
        };
      }

      // All campaigns context
      const allCampsForAI = activeWithData
        .map(c => ({ name: c.name, spend: c.metrics?.spend ?? 0, messages: c.metrics?.messages ?? 0 }));

      const body = {
        accountName: selectedAccount?.clientName || '',
        campaignName: isAllCampaigns ? null : selectedCampaign?.name,
        periodLabel: getPeriodLabel(currentPeriod),
        todayDate: fmtDateBR(new Date()),
        metrics,
        previousMetrics,
        breakdowns,
        videoData: videoPayload,
        allCampaigns: allCampsForAI,
      };

      const { data, error } = await supabase.functions.invoke('deep-analysis', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDeepResult(data);
    } catch (err) {
      console.error('Erro na análise profunda:', err);
      setDeepError(err.message || 'Erro ao gerar análise profunda.');
    } finally {
      setLoadingDeep(false);
    }
  }, [selectedAccountId, selectedAccount, selectedCampaign, isAllCampaigns, currentPeriod]);

  // ── Severity counts ──

  const severityCounts = useMemo(() => {
    if (!localResult) return { critical: 0, warning: 0, good: 0 };
    return localResult.diagnostics.reduce((acc, d) => {
      acc[d.severity] = (acc[d.severity] || 0) + 1;
      return acc;
    }, { critical: 0, warning: 0, good: 0 });
  }, [localResult]);

  // ─── RENDER ────────────────────────────────────────────────────────────────

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
              <Brain size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary tracking-tight">Análise com IA</h1>
              <p className="text-sm text-text-secondary">Diagnósticos, relatórios e insights gerados por inteligência artificial</p>
            </div>
          </div>
        </div>

        {/* Selectors */}
        <div className="relative mt-5 flex flex-wrap items-end justify-center gap-5">
          {agencies.length > 0 && (
            <div className="flex flex-col gap-1.5 w-[210px]">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Agência</label>
              <select 
                value={selectedAgency} 
                onChange={e => setSelectedAgency(e.target.value)}
                className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
              >
                <option value="">Todas</option>
                {agencies.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5 w-[295px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Conta</label>
            <select 
              value={selectedAccountId} 
              onChange={e => setSelectedAccountId(e.target.value)}
              className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
            >
              <option value="">Selecione uma conta</option>
              {filteredAccounts.map(a => <option key={a.id} value={a.id}>{a.clientName}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 w-[295px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Campanha</label>
            <select 
              value={selectedCampaignId} 
              onChange={e => setSelectedCampaignId(e.target.value)}
              className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
            >
              <option value="">Selecione uma campanha</option>
              {accountCampaigns.length > 1 && (
                <option value="__all__">📊 Todas as campanhas ({accountCampaigns.length})</option>
              )}
              {accountCampaigns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name.length > 28 ? c.name.substring(0, 28) + '...' : c.name} {c.metrics?.spend > 0 ? `(R$${c.metrics.spend.toFixed(0)})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 w-[210px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Período</label>
            <PeriodSelector selectedPeriod={currentPeriod} onPeriodChange={setCurrentPeriod} className="w-full" />
          </div>
        </div>

        {/* Action Row */}
        <div className="relative mt-6 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={runAnalysis}
            disabled={!selectedCampaignId || analyzing}
            className="group relative inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-primary to-primary-light text-white shadow-lg shadow-primary/25
              hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
              transition-all duration-300 ease-out"
          >
            {analyzing ? (
              <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analisando...</>
            ) : (
              <><Sparkles size={18} className="group-hover:rotate-12 transition-transform duration-300" /> {isAllCampaigns ? 'Analisar Todas' : 'Analisar Campanha'}</>
            )}
            <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>

          <button
            onClick={runDeepAnalysis}
            disabled={!selectedCampaignId || !collectedDataRef.current || loadingDeep}
            className="group relative inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-violet-600 to-purple-500 text-white shadow-lg shadow-violet-500/25
              hover:shadow-xl hover:shadow-violet-500/30 hover:scale-[1.02] active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
              transition-all duration-300 ease-out"
            title="Requer análise prévia — clique primeiro em Analisar"
          >
            {loadingDeep ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Brain size={18} className="group-hover:scale-110 transition-transform duration-300" />
            )}
            {loadingDeep ? 'Analisando...' : 'Análise Profunda IA'}
            <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>
        </div>
      </div>

      {/* ═══ LOADING ═══ */}
      {analyzing && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <Brain size={24} className="absolute inset-0 m-auto text-primary animate-pulse" />
          </div>
          <p className="text-text-secondary text-sm animate-pulse">Analisando métricas e identificando padrões...</p>
        </div>
      )}

      {/* ═══ EMPTY STATE ═══ */}
      {!localResult && !analyzing && !isAllCampaigns && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/10 rounded-full blur-2xl scale-150" />
            <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-surface border border-border">
              <BarChart3 size={36} className="text-primary/50" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-text-primary">Selecione uma campanha para analisar</h3>
          <p className="text-sm text-text-secondary max-w-md">
            Escolha a conta e campanha acima, depois clique em "Analisar Campanha" para diagnóstico,
            sugestões e relatório para o cliente gerado por IA.
          </p>
        </div>
      )}

      {/* ═══ ALL CAMPAIGNS MODE — direct to AI report ═══ */}
      {isAllCampaigns && showReport && !analyzing && !localResult && (
        <div className="space-y-8">
          {/* Campaign summary */}
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 border border-primary/20">
                <Target size={16} className="text-primary-light" />
              </div>
              <h2 className="text-base font-bold text-text-primary">Todas as Campanhas</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-light border border-primary/20">
                {accountCampaigns.filter(c => (c.metrics?.spend ?? 0) > 0).length} ativas
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {accountCampaigns.filter(c => (c.metrics?.spend ?? 0) > 0).map(c => (
                <span key={c.id} className="text-xs px-2.5 py-1 rounded-lg bg-surface/80 border border-border/50 text-text-secondary">
                  {c.name.replace(/\[.*?\]\s*/g, '')} — R${(c.metrics?.spend ?? 0).toFixed(2)}
                </span>
              ))}
            </div>
          </div>

          {/* Report section — same as single campaign */}
          <section className="transition-all duration-700 ease-out opacity-100 translate-y-0">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary-light/10 border border-primary/20">
                  <MessageSquareText size={16} className="text-primary-light" />
                </div>
                <h2 className="text-lg font-bold text-text-primary">Relatório para o Cliente</h2>
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
                  <Sparkles size={10} /> IA
                </span>
              </div>
              <div className="flex items-center gap-2">
                {reportResult && !generatingReport && (
                  <button onClick={() => generateReport(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface border border-border text-text-secondary hover:text-primary-light hover:border-primary/30 transition-all duration-200">
                    <RefreshCw size={14} /> Regerar relatório
                  </button>
                )}
                {!reportResult && !generatingReport && (
                  <button onClick={() => generateReport(false)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-violet-500 text-white shadow-lg shadow-violet-500/20 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300">
                    <Sparkles size={16} /> Gerar Relatório com IA
                  </button>
                )}
              </div>
            </div>

            {generatingReport && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-border bg-surface/50">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-3 border-violet-500/20 border-t-violet-500 animate-spin" />
                  <Sparkles size={18} className="absolute inset-0 m-auto text-violet-400 animate-pulse" />
                </div>
                <p className="text-text-secondary text-sm animate-pulse">Gerando relatório de todas as campanhas com IA...</p>
              </div>
            )}

            {reportError && !generatingReport && (
              <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-2xl border border-red-500/20 bg-red-500/5">
                <WifiOff size={24} className="text-red-400" />
                <p className="text-sm text-text-secondary">{reportError}</p>
                <button onClick={() => generateReport(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-primary/10 text-primary-light border border-primary/20 hover:bg-primary/20 transition-all">
                  <RefreshCw size={14} /> Tentar novamente
                </button>
              </div>
            )}

            {!reportResult && !generatingReport && !reportError && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-border bg-surface/30">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20">
                  <Sparkles size={24} className="text-violet-400/50" />
                </div>
                <p className="text-sm text-text-secondary">Clique em "Gerar Relatório com IA" para criar o relatório de todas as campanhas.</p>
              </div>
            )}

            {reportResult && !generatingReport && (
              <div className="space-y-4">
                <div className="relative rounded-2xl border border-border bg-gradient-to-br from-surface via-surface to-[#1e2130] overflow-hidden">
                  <div className="pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-black/20">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-primary-light" />
                      <span className="text-xs font-medium text-text-secondary">Relatório Completo</span>
                    </div>
                    <CopyButton text={reportResult.relatorio} />
                  </div>
                  <div className="p-6 relative">
                    <pre className="whitespace-pre-wrap font-sans text-sm text-text-primary leading-relaxed">{reportResult.relatorio}</pre>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ═══ RESULTS (single campaign) ═══ */}
      {localResult && !analyzing && (
        <div className="space-y-8">

          {/* Summary bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border">
              <Activity size={16} className="text-primary-light" />
              <span className="text-sm font-medium text-text-primary">{localResult.diagnostics.length} diagnósticos</span>
            </div>
            {severityCounts.critical > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <XCircle size={14} className="text-red-400" />
                <span className="text-sm font-medium text-red-300">{severityCounts.critical} problemas</span>
              </div>
            )}
            {severityCounts.warning > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle size={14} className="text-amber-400" />
                <span className="text-sm font-medium text-amber-300">{severityCounts.warning} atenções</span>
              </div>
            )}
            {severityCounts.good > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-sm font-medium text-emerald-300">{severityCounts.good} positivos</span>
              </div>
            )}
          </div>

          {/* ═══ SECTION 1 — DIAGNÓSTICO (LOCAL) ═══ */}
          <section>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-600/10 border border-violet-500/20">
                <Activity size={16} className="text-violet-400" />
              </div>
              <h2 className="text-lg font-bold text-text-primary">Diagnóstico</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {localResult.diagnostics.map((diag) => {
                const config = SEVERITY_CONFIG[diag.severity];
                const Icon = config.icon;
                const isVisible = visibleCards.has(diag.id);
                return (
                  <div key={diag.id} className={`relative overflow-hidden rounded-2xl border ${config.border} bg-gradient-to-br ${config.gradient} backdrop-blur-sm shadow-lg ${config.glow} transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'} hover:scale-[1.02] hover:shadow-xl`}>
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

            {localResult.diagnostics.length === 0 && (
              <div className="text-center py-10 text-text-secondary">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400/50" />
                <p className="text-sm">Nenhum diagnóstico significativo. Dados insuficientes ou campanha muito recente.</p>
              </div>
            )}
          </section>

          {/* ═══ SECTION 2 — SUGESTÕES (LOCAL) ═══ */}
          <section className={`transition-all duration-700 ease-out ${showSuggestions ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20">
                <Lightbulb size={16} className="text-amber-400" />
              </div>
              <h2 className="text-lg font-bold text-text-primary">Sugestões de Melhoria</h2>
              {localResult.suggestions.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-light border border-primary/20">
                  {localResult.suggestions.length} ações
                </span>
              )}
            </div>

            {localResult.suggestions.length > 0 ? (
              <div className="space-y-3">
                {localResult.suggestions.map((sug, i) => {
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
          </section>

          {/* ═══ SECTION 3 — RELATÓRIO PARA O CLIENTE (IA) ═══ */}
          <section className={`transition-all duration-700 ease-out ${showReport ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary-light/10 border border-primary/20">
                  <MessageSquareText size={16} className="text-primary-light" />
                </div>
                <h2 className="text-lg font-bold text-text-primary">Relatório para o Cliente</h2>
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
                  <Sparkles size={10} /> IA
                </span>
              </div>

              {/* Generate / Regenerate buttons */}
              <div className="flex items-center gap-2">
                {reportResult && !generatingReport && (
                  <button
                    onClick={() => generateReport(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                      bg-surface border border-border text-text-secondary hover:text-primary-light hover:border-primary/30
                      transition-all duration-200"
                  >
                    <RefreshCw size={14} /> Regerar relatório
                  </button>
                )}
                {!reportResult && !generatingReport && (
                  <button
                    onClick={() => generateReport(false)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                      bg-gradient-to-r from-violet-600 to-violet-500 text-white shadow-lg shadow-violet-500/20
                      hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]
                      transition-all duration-300"
                  >
                    <Sparkles size={16} /> Gerar Relatório com IA
                  </button>
                )}
              </div>
            </div>

            {/* Loading state for report */}
            {generatingReport && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-border bg-surface/50">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-3 border-violet-500/20 border-t-violet-500 animate-spin" />
                  <Sparkles size={18} className="absolute inset-0 m-auto text-violet-400 animate-pulse" />
                </div>
                <p className="text-text-secondary text-sm animate-pulse">Gerando relatório com IA...</p>
              </div>
            )}

            {/* Error state for report */}
            {reportError && !generatingReport && (
              <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-2xl border border-red-500/20 bg-red-500/5">
                <WifiOff size={24} className="text-red-400" />
                <p className="text-sm text-text-secondary">{reportError}</p>
                <button
                  onClick={() => generateReport(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
                    bg-primary/10 text-primary-light border border-primary/20 hover:bg-primary/20 transition-all"
                >
                  <RefreshCw size={14} /> Tentar novamente
                </button>
              </div>
            )}

            {/* Empty state — not yet generated */}
            {!reportResult && !generatingReport && !reportError && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-border bg-surface/30">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20">
                  <Sparkles size={24} className="text-violet-400/50" />
                </div>
                <p className="text-sm text-text-secondary">Clique em "Gerar Relatório com IA" para criar o texto para o cliente.</p>
              </div>
            )}

            {/* Report result */}
            {reportResult && !generatingReport && (
              <div className="space-y-4">

                {/* Relatório completo */}
                <div className="relative rounded-2xl border border-border bg-gradient-to-br from-surface via-surface to-[#1e2130] overflow-hidden">
                  <div className="pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-black/20">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-primary-light" />
                      <span className="text-xs font-medium text-text-secondary">Relatório Completo</span>
                    </div>
                    <CopyButton text={reportResult.relatorio} />
                  </div>
                  <div className="p-6 relative">
                    <pre className="whitespace-pre-wrap font-sans text-sm text-text-primary leading-relaxed">{reportResult.relatorio}</pre>
                  </div>
                </div>
              </div>
            )}
          </section>

        </div>
      )}

      {/* ═══ DEEP ANALYSIS RESULT ═══ */}
      {loadingDeep && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-violet-500/20 border-t-violet-500 animate-spin" />
            <Brain size={24} className="absolute inset-0 m-auto text-violet-400 animate-pulse" />
          </div>
          <p className="text-text-secondary text-sm animate-pulse">Gerando análise profunda com IA...</p>
        </div>
      )}

      {deepError && !loadingDeep && (
        <div className="bg-danger/10 border border-danger/30 rounded-2xl p-5 text-danger text-sm">
          <strong>Erro na análise profunda:</strong> {deepError}
        </div>
      )}

      {deepResult && !loadingDeep && (
        <div className="space-y-5">
          {/* Deep Analysis Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-violet-950/40 via-surface/60 to-purple-950/30 rounded-2xl border border-violet-500/30 p-6 shadow-lg">
            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
              <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
              <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-purple-500/10 blur-3xl" />
            </div>
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg shadow-violet-500/25">
                  <Brain size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-text-primary">Análise Profunda</h2>
                  <p className="text-xs text-violet-300/70">Powered by Claude AI</p>
                </div>
                <button
                  onClick={() => setDeepResult(null)}
                  className="ml-auto p-2 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-all"
                  title="Fechar análise"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{deepResult.resumo}</p>
            </div>
          </div>

          {/* Diagnósticos IA */}
          {deepResult.diagnosticos?.length > 0 && (
            <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-600/10 border border-violet-500/20">
                  <Activity size={16} className="text-violet-400" />
                </div>
                <h2 className="text-lg font-bold text-text-primary">Diagnósticos IA</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
                  {deepResult.diagnosticos.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {deepResult.diagnosticos.map((diag, i) => {
                  const sevMap = {
                    critico: { border: 'border-red-500/40', bg: 'from-red-500/15 to-transparent', icon: XCircle, iconColor: 'text-red-400', badge: 'bg-red-500/20 text-red-300 border-red-500/30', label: 'Crítico', accent: 'bg-gradient-to-b from-red-400 to-red-600' },
                    atencao: { border: 'border-amber-500/40', bg: 'from-amber-500/15 to-transparent', icon: AlertTriangle, iconColor: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30', label: 'Atenção', accent: 'bg-gradient-to-b from-amber-400 to-amber-600' },
                    positivo: { border: 'border-emerald-500/40', bg: 'from-emerald-500/15 to-transparent', icon: CheckCircle2, iconColor: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', label: 'Positivo', accent: 'bg-gradient-to-b from-emerald-400 to-emerald-600' },
                  };
                  const cfg = sevMap[diag.severidade] || sevMap.atencao;
                  const Icon = cfg.icon;
                  return (
                    <div key={i} className={`relative overflow-hidden rounded-2xl border ${cfg.border} bg-gradient-to-br ${cfg.bg} backdrop-blur-sm shadow-lg hover:scale-[1.01] transition-all duration-300`}>
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.accent}`} />
                      <div className="p-5 pl-6">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/20">
                              <Icon size={18} className={cfg.iconColor} />
                            </div>
                            <h3 className="font-semibold text-text-primary text-sm leading-tight">{diag.titulo}</h3>
                          </div>
                          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg border ${cfg.badge}`}>{cfg.label}</span>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed mb-2">{diag.analise}</p>
                        {diag.impacto && <p className="text-xs text-violet-300/80 font-medium">💡 {diag.impacto}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ações Recomendadas */}
          {deepResult.acoes?.length > 0 && (
            <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20">
                  <Zap size={16} className="text-amber-400" />
                </div>
                <h2 className="text-lg font-bold text-text-primary">Ações Recomendadas</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
                  {deepResult.acoes.length}
                </span>
              </div>
              <div className="space-y-3">
                {deepResult.acoes.map((acao, i) => {
                  const prioMap = {
                    alta: { color: 'text-red-300', bg: 'bg-red-500/10 border-red-500/30', icon: Zap },
                    media: { color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/30', icon: Target },
                    baixa: { color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/30', icon: Shield },
                  };
                  const difMap = {
                    facil: { label: 'Fácil', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                    medio: { label: 'Médio', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                    complexo: { label: 'Complexo', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
                  };
                  const pCfg = prioMap[acao.prioridade] || prioMap.media;
                  const dCfg = difMap[acao.dificuldade] || difMap.medio;
                  const PIcon = pCfg.icon;
                  return (
                    <div key={i} className="group relative overflow-hidden rounded-2xl border border-border bg-surface/80 backdrop-blur-sm hover:border-violet-500/30 hover:bg-surface transition-all duration-300">
                      <div className="p-5">
                        <div className="flex items-start gap-4">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/10 border border-violet-500/20 shrink-0">
                            <span className="text-sm font-bold text-violet-300">{i + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <h3 className="font-semibold text-text-primary text-sm">{acao.acao}</h3>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${dCfg.color}`}>{dCfg.label}</span>
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border ${pCfg.bg} ${pCfg.color}`}>
                                  <PIcon size={12} /> {acao.prioridade === 'alta' ? 'Alta' : acao.prioridade === 'media' ? 'Média' : 'Baixa'}
                                </span>
                              </div>
                            </div>
                            <p className="text-sm text-text-secondary leading-relaxed">{acao.motivo}</p>
                          </div>
                        </div>
                      </div>
                      <div className="absolute inset-y-0 left-0 w-1 bg-violet-500/0 group-hover:bg-violet-500/60 transition-all duration-300" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Insights */}
          {deepResult.insights?.length > 0 && (
            <div className="bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/20">
                  <Sparkles size={16} className="text-cyan-400" />
                </div>
                <h2 className="text-lg font-bold text-text-primary">Insights</h2>
              </div>
              <div className="space-y-3">
                {deepResult.insights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-surface/60 border border-border/30 hover:border-cyan-500/20 transition-all">
                    <ChevronRight size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-text-secondary leading-relaxed">{insight}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
