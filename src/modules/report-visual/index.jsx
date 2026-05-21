import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { formatCurrency } from '../../shared/utils/format';
import { Image, Download, Loader2, Sparkles, Copy, Check, Send, CheckCircle2, Target, Link2, X, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import PeriodSelector from '../../shared/components/PeriodSelector';
import ReportCard from '../../shared/components/ReportCard';
import {
  fetchAccountInsights, fetchCampaignsWithInsights,
  fetchCampaignDailyInsights, getPreviousPeriodRange
} from '../../services/metaApi';
import { PRESETS } from '../../shared/utils/dateUtils';
import { toPng } from 'html-to-image';

const SHARE_BASE_URL = (import.meta.env.VITE_PUBLIC_SHARE_BASE_URL || '').trim();
const META_LOGO_SOURCES = ['/meta-ads-logo.png', '/logometa.png'];

function matchAgencyVisual(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('tag')) return 'tag';
  if (n.includes('vilas')) return 'vilasmkt';
  return null;
}

// ── Helpers ──
function getActionValue(actions, actionType) {
  if (!actions || !Array.isArray(actions)) return 0;
  const found = actions.find(a => a.action_type === actionType);
  return found ? parseInt(found.value, 10) : 0;
}

function getActionValueMulti(actions, actionTypes) {
  if (!actions || !Array.isArray(actions)) return 0;
  for (const t of actionTypes) {
    const v = getActionValue(actions, t);
    if (v > 0) return v;
  }
  return 0;
}

function formatPeriodLabel(period) {
  if (typeof period === 'object' && period.type === 'custom') {
    const fmt = (d) => { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; };
    const fmtShort = (d) => { const p = d.split('-'); return `${p[2]}-${p[1]}`; };
    return { start: fmt(period.startDate), end: fmt(period.endDate), startShort: fmtShort(period.startDate), endShort: fmtShort(period.endDate) };
  }
  const preset = PRESETS.find(p => p.id === period);
  if (preset) {
    const range = preset.getRange();
    const fmtFull = (d) => { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; };
    const fmtShort = (d) => { const p = d.split('-'); return `${p[2]}-${p[1]}`; };
    return { start: fmtFull(range.startDate), end: fmtFull(range.endDate), startShort: fmtShort(range.startDate), endShort: fmtShort(range.endDate) };
  }
  return { start: '??/??/????', end: '??/??/????', startShort: '??-??', endShort: '??-??' };
}

function calcDiff(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous * 100).toFixed(1);
}

const LEAD_ACTION_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
];

const ENGAGEMENT_ACTION_TYPES = ['post_engagement', 'page_engagement'];

const OBJECTIVE_OPTIONS = [
  { id: 'messages', label: 'Mensagens' },
  { id: 'clicks', label: 'Cliques no link' },
  { id: 'engagements', label: 'Engajamentos' },
];

function aggregateCampaignMetrics(campaigns = []) {
  const summary = campaigns.reduce((acc, campaign) => {
    const insight = campaign.insights?.data?.[0];
    const actions = insight?.actions || [];

    acc.spend += parseFloat(insight?.spend || 0);
    acc.impressions += parseInt(insight?.impressions || 0, 10);
    acc.reach += parseInt(insight?.reach || 0, 10);
    acc.clicks += parseInt(insight?.inline_link_clicks || 0, 10);
    acc.leads += getActionValueMulti(actions, LEAD_ACTION_TYPES);
    acc.engagements += getActionValueMulti(actions, ENGAGEMENT_ACTION_TYPES);

    return acc;
  }, {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    leads: 0,
    engagements: 0,
  });

  return {
    ...summary,
    costPerLead: summary.leads > 0 ? summary.spend / summary.leads : 0,
    costPerEngagement: summary.engagements > 0 ? summary.spend / summary.engagements : 0,
  };
}

function buildCampaignScopeLabel(selectedCampaigns, totalCampaignCount) {
  if (!selectedCampaigns.length) {
    return `Todas as campanhas (${totalCampaignCount})`;
  }

  if (selectedCampaigns.length === 1) {
    return `Campanha filtrada: ${selectedCampaigns[0].name}`;
  }

  return `${selectedCampaigns.length} campanhas filtradas`;
}

function slugifyShareLabel(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function makePublicSlug(label, fallbackId) {
  const baseSlug = slugifyShareLabel(label);
  return baseSlug || fallbackId;
}

function getShareBaseUrl() {
  if (SHARE_BASE_URL) return SHARE_BASE_URL.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

// ── Helper: convert image URL to base64 for html-to-image compatibility ──
function resolveAssetUrl(url) {
  if (typeof window === 'undefined' || !url?.startsWith('/')) return url;
  return new URL(url, window.location.origin).toString();
}

function getAgencyLogoSources(agencyType) {
  return agencyType === 'tag' ? ['/logotag.png'] : ['/favicon.png'];
}

async function toBase64(url) {
  try {
    const fullUrl = resolveAssetUrl(url);
    const res = await fetch(fullUrl);
    if (!res.ok) { console.warn('[toBase64] fetch failed for', url, res.status); return null; }
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        console.log('[toBase64]', url, '→', reader.result?.substring(0, 40), '...', blob.size, 'bytes');
        resolve(reader.result);
      };
      reader.readAsDataURL(blob);
    });
  } catch (e) { console.warn('[toBase64] error for', url, e); return null; }
}

async function toBase64FromSources(sources) {
  for (const source of sources) {
    const base64 = await toBase64(source);
    if (base64) return base64;
  }
  return null;
}

async function waitForImages(container) {
  if (!container) return;
  const images = Array.from(container.querySelectorAll('img'));

  await Promise.all(images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }));

  await Promise.all(images.map((img) => (
    typeof img.decode === 'function'
      ? img.decode().catch(() => {})
      : Promise.resolve()
  )));
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

function getExportCacheKey(reportData) {
  if (!reportData) return '';
  return JSON.stringify({
    accountName: reportData.accountName,
    scopeLabel: reportData.scopeLabel,
    start: reportData.period?.startShort,
    end: reportData.period?.endShort,
    objective: reportData.objective,
    spend: reportData.spend,
    leads: reportData.leads,
    clicks: reportData.clicks,
    engagements: reportData.engagements,
    agencyLogoB64: reportData.agencyLogoB64?.slice(0, 64),
    metaLogoB64: reportData.metaLogoB64?.slice(0, 64),
  });
}

export default function ReportVisual() {
  const { accounts, campaigns, selectedPeriod, setSelectedPeriod } = useMetaAds();
  const { agencies, accountAgencies } = useAgency();
  const [selectedAccount, setSelectedAccount] = useState('');

  const clientLogos = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('client_logos')) || {};
    } catch {
      return {};
    }
  }, []);
  const [selectedAgency, setSelectedAgency] = useState('');
  const [selectedObjective, setSelectedObjective] = useState('messages');
  const [selectedCampaignIds, setSelectedCampaignIds] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const reportRef = useRef(null);
  const previewFrameRef = useRef(null);
  const exportCacheRef = useRef({ key: '', canvas: null, blob: null });
  const [previewScale, setPreviewScale] = useState(1);

  // Filter agencies to only vilasmkt and tag
  const allowedAgencyList = useMemo(() => {
    return agencies.filter(ag => matchAgencyVisual(ag) !== null);
  }, [agencies]);

  const hasAgencies = allowedAgencyList.length > 0;

  useEffect(() => {
    if (!selectedAgency) {
      if (hasAgencies) {
        setSelectedAgency(allowedAgencyList[0]);
      } else {
        setSelectedAgency('__all__');
      }
    }
  }, [allowedAgencyList, selectedAgency, hasAgencies]);

  const agencyType = useMemo(() => {
    // When __all__ mode, detect agency from account assignment OR account name
    if (selectedAgency === '__all__' && selectedAccount) {
      // First try accountAgencies map
      const accAgency = accountAgencies[selectedAccount];
      if (accAgency) {
        const detected = matchAgencyVisual(accAgency);
        if (detected) return detected;
      }
      // Fallback: detect by account name containing "tag"
      const acc = accounts.find(a => a.id === selectedAccount);
      if (acc) {
        const name = (acc.clientName || acc.name || '').toLowerCase();
        if (name.includes('tag')) return 'tag';
      }
    }
    if (selectedAgency === '__all__') return 'vilasmkt';
    return matchAgencyVisual(selectedAgency) || 'vilasmkt';
  }, [selectedAgency, selectedAccount, accountAgencies, accounts]);

  const logoSources = useMemo(() => getAgencyLogoSources(agencyType), [agencyType]);
  const agencyLabel = agencyType === 'tag' ? 'Grupo Tag' : 'Vilas Growth Marketing';

  const filteredAccounts = useMemo(() => {
    if (selectedAgency === '__all__') return accounts;
    if (!selectedAgency) return [];
    return accounts.filter(a => accountAgencies[a.id] === selectedAgency);
  }, [accounts, selectedAgency, accountAgencies]);

  const accountCampaigns = useMemo(() => {
    if (!selectedAccount) return [];

    return campaigns
      .filter(campaign => campaign.accountId === selectedAccount && (campaign.metrics?.spend || 0) > 0)
      .sort((a, b) => {
        const spendDiff = (b.metrics?.spend || 0) - (a.metrics?.spend || 0);
        if (spendDiff !== 0) return spendDiff;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [campaigns, selectedAccount]);

  const selectedCampaigns = useMemo(() => {
    if (!selectedCampaignIds.length) return [];
    const selectedSet = new Set(selectedCampaignIds);
    return accountCampaigns.filter(campaign => selectedSet.has(campaign.id));
  }, [accountCampaigns, selectedCampaignIds]);

  const hasCampaignFilter = selectedCampaignIds.length > 0;
  const campaignScopeLabel = useMemo(
    () => buildCampaignScopeLabel(selectedCampaigns, accountCampaigns.length),
    [selectedCampaigns, accountCampaigns.length]
  );

  useEffect(() => {
    const element = previewFrameRef.current;
    if (!element) return undefined;

    const updateScale = () => {
      const nextScale = Math.min(1, element.clientWidth / 1200);
      setPreviewScale(nextScale > 0 ? nextScale : 1);
    };

    updateScale();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
    }

    const observer = new ResizeObserver(updateScale);
    observer.observe(element);

    return () => observer.disconnect();
  }, [reportData]);

  useEffect(() => {
    if (filteredAccounts.length > 0 && !filteredAccounts.find(a => a.id === selectedAccount)) {
      setSelectedAccount(filteredAccounts[0].id);
    }
  }, [filteredAccounts, selectedAccount]);

  useEffect(() => {
    if (!selectedAccount) {
      setSelectedCampaignIds([]);
      return;
    }

    const availableIds = new Set(accountCampaigns.map(campaign => campaign.id));
    setSelectedCampaignIds(prev => prev.filter(id => availableIds.has(id)));
  }, [selectedAccount, accountCampaigns]);

  const handleGenerate = useCallback(async () => {
    if (!selectedAccount) return;
    setGenerating(true);
    setReportData(null);
    exportCacheRef.current = { key: '', dataUrl: '', blob: null };

    try {
      const prevPeriod = getPreviousPeriodRange(selectedPeriod);
      let spend = 0;
      let impressions = 0;
      let reach = 0;
      let clicks = 0;
      let leads = 0;
      let engagements = 0;
      let costPerLead = 0;
      let costPerEngagement = 0;
      let prevSpend = 0;
      let prevLeads = 0;
      let prevEngagements = 0;
      let prevCostPerLead = 0;
      let prevCostPerEngagement = 0;
      let campData = [];
      let selectedCampaignNames = [];

      if (hasCampaignFilter) {
        const selectedCampaignSet = new Set(selectedCampaignIds);
        const [currentCampaigns, previousCampaigns] = await Promise.all([
          fetchCampaignsWithInsights(selectedAccount, selectedPeriod),
          fetchCampaignsWithInsights(selectedAccount, prevPeriod),
        ]);

        campData = currentCampaigns.filter(campaign => selectedCampaignSet.has(campaign.id));
        const prevCampData = previousCampaigns.filter(campaign => selectedCampaignSet.has(campaign.id));

        if (!campData.length) {
          setReportData({ error: 'Nenhuma das campanhas selecionadas teve dados no período escolhido.' });
          return;
        }

        const currentSummary = aggregateCampaignMetrics(campData);
        const previousSummary = aggregateCampaignMetrics(prevCampData);

        spend = currentSummary.spend;
        impressions = currentSummary.impressions;
        reach = currentSummary.reach;
        clicks = currentSummary.clicks;
        leads = currentSummary.leads;
        engagements = currentSummary.engagements;
        costPerLead = currentSummary.costPerLead;
        costPerEngagement = currentSummary.costPerEngagement;
        prevSpend = previousSummary.spend;
        prevLeads = previousSummary.leads;
        prevEngagements = previousSummary.engagements;
        prevCostPerLead = previousSummary.costPerLead;
        prevCostPerEngagement = previousSummary.costPerEngagement;
        selectedCampaignNames = selectedCampaigns.map(campaign => campaign.name);
      } else {
        const [insights, prevInsights, currentCampaigns] = await Promise.all([
          fetchAccountInsights(selectedAccount, selectedPeriod),
          fetchAccountInsights(selectedAccount, prevPeriod),
          fetchCampaignsWithInsights(selectedAccount, selectedPeriod),
        ]);

        if (!insights) {
          setReportData({ error: 'Sem dados para o período selecionado.' });
          return;
        }

        const actions = insights.actions || [];
        const prevActions = prevInsights?.actions || [];

        spend = parseFloat(insights.spend || 0);
        impressions = parseInt(insights.impressions || 0, 10);
        reach = parseInt(insights.reach || 0, 10);
        clicks = parseInt(insights.inline_link_clicks || 0, 10);
        prevSpend = parseFloat(prevInsights?.spend || 0);
        leads = getActionValueMulti(actions, LEAD_ACTION_TYPES);
        prevLeads = getActionValueMulti(prevActions, LEAD_ACTION_TYPES);
        engagements = getActionValueMulti(actions, ENGAGEMENT_ACTION_TYPES);
        prevEngagements = getActionValueMulti(prevActions, ENGAGEMENT_ACTION_TYPES);
        costPerLead = leads > 0 ? spend / leads : 0;
        prevCostPerLead = prevLeads > 0 ? prevSpend / prevLeads : 0;
        costPerEngagement = engagements > 0 ? spend / engagements : 0;
        prevCostPerEngagement = prevEngagements > 0 ? prevSpend / prevEngagements : 0;
        campData = currentCampaigns;
      }

      const costPerClick = clicks > 0 ? spend / clicks : 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

      const diffs = {
        spend: calcDiff(spend, prevSpend),
        leads: calcDiff(leads, prevLeads),
        costPerLead: calcDiff(costPerLead, prevCostPerLead),
        engagements: calcDiff(engagements, prevEngagements),
        costPerEngagement: calcDiff(costPerEngagement, prevCostPerEngagement),
      };

      // Daily series: leads, clicks, engagements from the same campaign fetch
      let dailyLeads = [];
      let dailyClicks = [];
      let dailyEngagements = [];
      if (campData.length > 0) {
        try {
          const allDaily = await Promise.all(
            campData.map(c => fetchCampaignDailyInsights(c.id, selectedPeriod))
          );
          const dayMap = {};
          for (const daily of allDaily) {
            for (const d of daily) {
              const date = d.date_start;
              if (!dayMap[date]) dayMap[date] = { date, leads: 0, clicks: 0, engagements: 0 };
              dayMap[date].leads += getActionValueMulti(d.actions || [], LEAD_ACTION_TYPES);
              dayMap[date].clicks += parseInt(d.inline_link_clicks || 0, 10);
              dayMap[date].engagements += getActionValueMulti(d.actions || [], ENGAGEMENT_ACTION_TYPES);
            }
          }
          const sorted = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
          const formatDay = (date) => `${date.split('-')[2]}/${date.split('-')[1]}`;
          dailyLeads = sorted.map(d => ({ date: formatDay(d.date), leads: d.leads }));
          dailyClicks = sorted.map(d => ({ date: formatDay(d.date), clicks: d.clicks }));
          dailyEngagements = sorted.map(d => ({ date: formatDay(d.date), engagements: d.engagements }));
        } catch { /* empty */ }
      }

      const account = accounts.find(a => a.id === selectedAccount);
      const periodDates = formatPeriodLabel(selectedPeriod);

      // Achar cliente associado para obter a logo
      const clientLogoUrl = clientLogos[selectedAccount] ||
        (account && clientLogos[account.accountId]) ||
        (account && clientLogos[account.id]) ||
        null;

      // Convert logos to base64 once, before export
      const [agencyLogoB64, metaLogoB64] = await Promise.all([
        toBase64FromSources(logoSources),
        toBase64FromSources(META_LOGO_SOURCES),
      ]);

      setReportData({
        accountName: account?.clientName || 'Conta',
        scopeLabel: hasCampaignFilter ? campaignScopeLabel : 'Conta inteira',
        selectedCampaignNames,
        filteredCampaignCount: hasCampaignFilter ? selectedCampaignIds.length : 0,
        period: periodDates,
        objective: selectedObjective,
        spend, impressions, reach, clicks, leads, engagements,
        costPerLead, costPerEngagement, costPerClick, ctr,
        diffs,
        dailyLeads, dailyClicks, dailyEngagements,
        agencyLogoB64, metaLogoB64,
        clientLogoUrl,
      });
    } catch (err) {
      console.error('Erro ao gerar relatório visual:', err);
      setReportData({ error: `Erro: ${err.message}` });
    } finally {
      setGenerating(false);
    }
  }, [
    selectedAccount,
    selectedPeriod,
    selectedObjective,
    accounts,
    logoSources,
    hasCampaignFilter,
    selectedCampaignIds,
    selectedCampaigns,
    campaignScopeLabel,
    clientLogos,
  ]);

  const buildExportAsset = useCallback(async () => {
    if (!reportRef.current || !reportData) return null;

    const cacheKey = getExportCacheKey(reportData);
    if (exportCacheRef.current.key === cacheKey && exportCacheRef.current.dataUrl && exportCacheRef.current.blob) {
      return exportCacheRef.current;
    }

    await withTimeout(waitForImages(reportRef.current), 2000, 'As imagens do relatório demoraram demais para carregar.');
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const opts = {
      quality: 1,
      pixelRatio: 1.15,
      backgroundColor: '#0d1520',
      cacheBust: false,
      skipFonts: true,
    };

    // First call warms up browser image cache inside html-to-image clone
    await toPng(reportRef.current, opts).catch(() => {});
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const dataUrl = await withTimeout(
      toPng(reportRef.current, opts),
      15000,
      'A exportação do PNG demorou demais.'
    );
    const blob = dataUrlToBlob(dataUrl);

    const asset = { key: cacheKey, dataUrl, blob };
    exportCacheRef.current = asset;
    return asset;
  }, [reportData]);

  const handleDownload = useCallback(async () => {
    if (!reportRef.current || !reportData) return;
    setDownloading(true);
    try {
      const asset = await buildExportAsset();
      const link = document.createElement('a');
      const accountSlug = (reportData.accountName || 'meta').replace(/\s+/g, '-').toLowerCase();
      const periodSlug = reportData.period ? `${reportData.period.startShort}_${reportData.period.endShort}` : '';
      link.download = `relatorio-${accountSlug}-${periodSlug}.png`;
      link.href = asset.dataUrl;
      link.click();
    } catch (err) {
      console.error('Erro ao exportar PNG:', err);
      alert(err.message || 'Erro ao gerar PNG. Tente novamente.');
    } finally {
      setDownloading(false);
    }
  }, [reportData, buildExportAsset]);

  const handleCopy = useCallback(async () => {
    if (!reportRef.current || !reportData) return;
    setCopying(true);
    setCopied(false);
    try {
      const asset = await buildExportAsset();
      if (!asset?.blob) return;
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Seu navegador não suporta copiar imagem diretamente.');
      }

      await navigator.clipboard.write([
        new ClipboardItem({ [asset.blob.type]: asset.blob }),
      ]);

      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Erro ao copiar:', err);
      alert(err.message || 'Não foi possível copiar. Tente baixar o PNG.');
    } finally {
      setCopying(false);
    }
  }, [reportData, buildExportAsset]);



  // ── Share link with client ──
  const { user } = useAuth();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareList, setShareList] = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCreating, setShareCreating] = useState(false);
  const [shareError, setShareError] = useState(null);
  const [copiedShareId, setCopiedShareId] = useState(null);

  const buildShareUrl = useCallback((share) => {
    if (!share) return '';
    const baseUrl = getShareBaseUrl();
    if (SHARE_BASE_URL && share.public_slug) {
      return `${baseUrl}/${encodeURIComponent(share.public_slug)}`;
    }
    return `${baseUrl}/r/${share.id}`;
  }, []);

  const loadShares = useCallback(async () => {
    if (!selectedAccount) return;
    setShareLoading(true);
    setShareError(null);
    try {
      const { data, error } = await supabase
        .from('shared_reports')
        .select('*')
        .eq('account_id', selectedAccount)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setShareList(data || []);
    } catch (err) {
      setShareError(`Erro ao carregar links: ${err.message}`);
    } finally {
      setShareLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (shareModalOpen) loadShares();
  }, [shareModalOpen, loadShares]);

  const handleCreateShare = useCallback(async () => {
    if (!selectedAccount) return;
    setShareCreating(true);
    setShareError(null);
    try {
      const account = accounts.find(a => a.id === selectedAccount);
      const id = Array.from(crypto.getRandomValues(new Uint8Array(9)))
        .map(b => b.toString(36).padStart(2, '0'))
        .join('')
        .slice(0, 14);

      const baseSlug = makePublicSlug(account?.clientName, id);
      let { error } = await supabase
        .from('shared_reports')
        .insert({
          id,
          owner_email: user?.email || null,
          account_id: selectedAccount,
          agency: agencyType,
          objective: selectedObjective,
          campaign_ids: hasCampaignFilter ? selectedCampaignIds : null,
          client_label: account?.clientName || null,
          public_slug: baseSlug,
        });
      if (error?.code === '23505') {
        const retrySlug = `${baseSlug}-${id.slice(-4)}`;
        ({ error } = await supabase
          .from('shared_reports')
          .insert({
            id,
            owner_email: user?.email || null,
            account_id: selectedAccount,
            agency: agencyType,
            objective: selectedObjective,
            campaign_ids: hasCampaignFilter ? selectedCampaignIds : null,
            client_label: account?.clientName || null,
            public_slug: retrySlug,
          }));
      }
      if (error) throw error;
      await loadShares();
    } catch (err) {
      setShareError(`Erro ao criar link: ${err.message}`);
    } finally {
      setShareCreating(false);
    }
  }, [selectedAccount, accounts, user, agencyType, selectedObjective, hasCampaignFilter, selectedCampaignIds, loadShares]);

  const handleDeleteShare = useCallback(async (id) => {
    if (!confirm('Remover este link? O cliente perderá acesso imediatamente.')) return;
    try {
      const { error } = await supabase.from('shared_reports').delete().eq('id', id);
      if (error) throw error;
      setShareList(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      setShareError(`Erro ao remover: ${err.message}`);
    }
  }, []);

  const handleCopyShareLink = useCallback(async (id) => {
    try {
      const share = shareList.find(item => item.id === id);
      await navigator.clipboard.writeText(buildShareUrl(share));
      setCopiedShareId(id);
      setTimeout(() => setCopiedShareId(null), 2000);
    } catch (err) {
      setShareError(`Não foi possível copiar: ${err.message}`);
    }
  }, [buildShareUrl, shareList]);

  const d = reportData;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="relative z-10 rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-5 lg:p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>

        {/* Title aligned LEFT */}
        <div className="relative flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
            <Image size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-text-primary tracking-tight">Relatório Visual</h1>
            <p className="text-xs lg:text-sm text-text-secondary">Gere relatórios visuais em PNG para envio ao cliente</p>
          </div>
        </div>

        {/* Selectors */}
        <div className="relative mt-5 grid grid-cols-1 min-[560px]:grid-cols-2 sm:flex sm:flex-wrap items-end justify-center gap-3 sm:gap-5">
          {hasAgencies ? (
            <div className="flex flex-col gap-1.5 col-span-1 sm:w-[210px]">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Agência</label>
              <select
                value={selectedAgency}
                onChange={e => {
                  setSelectedAgency(e.target.value);
                  setSelectedAccount('');
                  setSelectedCampaignIds([]);
                }}
                className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
              >
                {allowedAgencyList.map(ag => <option key={ag} value={ag}>{ag}</option>)}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[295px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Conta</label>
            <select
              value={selectedAccount}
              onChange={e => {
                setSelectedAccount(e.target.value);
                setSelectedCampaignIds([]);
              }}
              className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
            >
              <option value="">Selecione uma conta</option>
              {filteredAccounts.map(a => <option key={a.id} value={a.id}>{a.clientName}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[210px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Target size={12} className="text-primary-light" />
              Objetivo
            </label>
            <select
              value={selectedObjective}
              onChange={e => setSelectedObjective(e.target.value)}
              className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
            >
              {OBJECTIVE_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 col-span-1 min-[560px]:col-span-2 sm:col-span-1 sm:w-[210px] z-50">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Período</label>
            <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} className="w-full" />
          </div>
        </div>

        {selectedAccount && (
          <div className="relative mt-5 rounded-2xl border border-border/60 bg-surface/45 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Filtro por campanhas</h3>
                <p className="mt-1 text-xs text-text-secondary">
                  Deixe vazio para considerar a conta inteira ou marque apenas as campanhas que quer incluir no relatório visual.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCampaignIds([])}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    !hasCampaignFilter
                      ? 'bg-primary/15 text-primary-light border border-primary/30'
                      : 'bg-bg/60 text-text-secondary border border-border hover:text-text-primary hover:border-primary/20'
                  }`}
                >
                  Todas as campanhas ({accountCampaigns.length})
                </button>
                {hasCampaignFilter && (
                  <button
                    type="button"
                    onClick={() => setSelectedCampaignIds([])}
                    className="rounded-xl border border-border bg-bg/60 px-3 py-2 text-xs font-medium text-text-secondary transition hover:border-primary/20 hover:text-text-primary"
                  >
                    Limpar filtro
                  </button>
                )}
              </div>
            </div>

            {accountCampaigns.length > 0 ? (
              <>
                <div className="mt-4 grid max-h-56 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                  {accountCampaigns.map((campaign) => {
                    const checked = selectedCampaignIds.includes(campaign.id);
                    return (
                      <label
                        key={campaign.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                          checked
                            ? 'border-primary/35 bg-primary/10'
                            : 'border-border/70 bg-bg/50 hover:border-primary/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedCampaignIds((prev) => (
                              prev.includes(campaign.id)
                                ? prev.filter(id => id !== campaign.id)
                                : [...prev, campaign.id]
                            ));
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-border bg-bg text-primary focus:ring-primary/40"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text-primary">
                            {campaign.name}
                          </span>
                          <span className="mt-1 block text-[11px] text-text-secondary">
                            Investimento: {formatCurrency(campaign.metrics?.spend || 0)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
                  <span className="rounded-full border border-border bg-bg/50 px-2.5 py-1">
                    Escopo atual: <span className="font-semibold text-text-primary">{campaignScopeLabel}</span>
                  </span>
                  {hasCampaignFilter && selectedCampaigns.length > 0 && (
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary-light">
                      {selectedCampaigns.length} selecionada(s)
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-border bg-bg/35 px-4 py-5 text-sm text-text-secondary">
                Nenhuma campanha encontrada para esta conta no período atual.
              </div>
            )}
          </div>
        )}

        {/* Action Row */}
        <div className="relative mt-6 flex items-center justify-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={!selectedAccount || generating}
            className="group relative inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-primary to-primary-light text-white shadow-lg shadow-primary/25
              hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
              transition-all duration-300 ease-out"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generating ? 'Gerando...' : 'Gerar Relatório'}
            <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>

          {d && !d.error && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
                bg-surface border border-primary/40 text-primary-light shadow-sm
                hover:bg-primary/10 hover:scale-[1.02] active:scale-[0.98]
                disabled:opacity-40 transition-all duration-300 ease-out"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {downloading ? 'Exportando...' : 'Baixar PNG'}
            </button>
          )}

          {d && !d.error && (
            <button
              onClick={handleCopy}
              disabled={copying}
              className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
                shadow-sm transition-all duration-300 ease-out
                ${copied
                  ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-400'
                  : 'bg-surface border border-primary/40 text-primary-light hover:bg-primary/10 hover:scale-[1.02] active:scale-[0.98]'}
                disabled:opacity-40`}
            >
              {copying ? <Loader2 size={16} className="animate-spin" /> : copied ? <Check size={16} /> : <Copy size={16} />}
              {copying ? 'Copiando...' : copied ? 'Copiado!' : 'Copiar Relatório'}
            </button>
          )}

          {selectedAccount && (
            <button
              onClick={() => setShareModalOpen(true)}
              className="group relative inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
                bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/25
                hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98]
                transition-all duration-300 ease-out"
              title="Gerar link compartilhável com o cliente"
            >
              <Link2 size={16} />
              Compartilhar com cliente
              <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          )}


        </div>


      </div>

      {/* REPORT CANVAS */}
      {d && !d.error && (
        <div className="pb-4">
          <div className="rounded-[28px] border border-border/60 bg-gradient-to-b from-surface/90 to-bg/90 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 px-1 sm:px-2">
              <div>
                <p className="text-sm font-semibold text-text-primary">Pré-visualização</p>
                <p className="text-xs text-text-secondary">A tela e a exportação agora usam o mesmo componente-base.</p>
              </div>
              <span className="rounded-full border border-border bg-bg/60 px-3 py-1 text-[11px] font-medium text-text-secondary">
                Escala {Math.round(previewScale * 100)}%
              </span>
            </div>
            <div
              ref={previewFrameRef}
              className="overflow-x-auto rounded-2xl border border-border/50 bg-[#0a1018] p-3 sm:p-4"
            >
              <div
                style={{
                  width: `${1200 * previewScale}px`,
                  height: `${750 * previewScale}px`,
                  minWidth: previewScale < 1 ? `${1200 * previewScale}px` : 'auto',
                  margin: '0 auto',
                }}
              >
                <div
                  style={{
                    width: 1200,
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top center',
                  }}
                >
                  <ReportCard
                    data={d}
                    agencyLogoSrc={d.agencyLogoB64 ? [d.agencyLogoB64] : logoSources}
                    metaLogoSrc={d.metaLogoB64 ? [d.metaLogoB64] : META_LOGO_SOURCES}
                    clientLogoSrc={d.clientLogoUrl}
                    agencyLabel={agencyLabel}
                    showAccountName={false}
                    objective={d.objective || selectedObjective}
                    withBarChart
                    innerRef={reportRef}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {d?.error && (
        <div className="bg-surface rounded-2xl border border-danger/30 p-6 text-center">
          <p className="text-danger text-sm">{d.error}</p>
        </div>
      )}

      {!d && !generating && (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center">
          <Image size={48} className="text-text-secondary/20 mx-auto mb-4" />
          <p className="text-text-secondary text-sm">Selecione uma agência, conta, período e clique em "Gerar Relatório"</p>
        </div>
      )}

      {shareModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShareModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div>
                <div className="flex items-center gap-2">
                  <Link2 size={18} className="text-emerald-400" />
                  <h2 className="text-lg font-bold text-text-primary">Links compartilháveis</h2>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  O cliente vê o relatório atualizado em tempo real e pode escolher o período. Sem expiração e sem senha.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                className="rounded-lg p-1.5 text-text-secondary transition hover:bg-bg/60 hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-text-secondary">
                <p>
                  <span className="font-semibold text-emerald-400">Conta selecionada:</span>{' '}
                  {accounts.find(a => a.id === selectedAccount)?.clientName || '—'}
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-emerald-400">Objetivo:</span>{' '}
                  {OBJECTIVE_OPTIONS.find(o => o.id === selectedObjective)?.label || selectedObjective}
                  {hasCampaignFilter && (
                    <> · <span className="font-semibold text-emerald-400">Campanhas:</span> {selectedCampaignIds.length} filtrada(s)</>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCreateShare}
                disabled={shareCreating || !selectedAccount}
                className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:shadow-xl hover:shadow-emerald-500/30 disabled:opacity-40"
              >
                {shareCreating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {shareCreating ? 'Gerando link...' : 'Gerar novo link'}
              </button>

              {shareError && (
                <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {shareError}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Links existentes ({shareList.length})
                </p>

                {shareLoading && (
                  <div className="flex items-center justify-center py-8 text-text-secondary">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                )}

                {!shareLoading && shareList.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border bg-bg/30 px-4 py-6 text-center text-sm text-text-secondary">
                    Nenhum link gerado para esta conta ainda.
                  </div>
                )}

                {!shareLoading && shareList.map((share) => {
                  const url = buildShareUrl(share);
                  const isCopied = copiedShareId === share.id;
                  const filterCount = Array.isArray(share.campaign_ids) ? share.campaign_ids.length : 0;
                  const created = new Date(share.created_at).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  });
                  return (
                    <div
                      key={share.id}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-bg/40 p-3 transition hover:border-primary/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="truncate text-xs font-medium text-text-primary">{url}</code>
                        </div>
                        <p className="mt-1 text-[11px] text-text-secondary">
                          {OBJECTIVE_OPTIONS.find(o => o.id === share.objective)?.label || share.objective}
                          {filterCount > 0 ? ` · ${filterCount} campanha(s)` : ' · conta inteira'}
                          {' · '}
                          criado em {created}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyShareLink(share.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          isCopied
                            ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-400'
                            : 'border-primary/30 bg-primary/10 text-primary-light hover:bg-primary/15'
                        }`}
                      >
                        {isCopied ? <Check size={12} /> : <Copy size={12} />}
                        {isCopied ? 'Copiado!' : 'Copiar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteShare(share.id)}
                        className="rounded-lg p-1.5 text-text-secondary transition hover:bg-danger/15 hover:text-danger"
                        title="Remover link"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
