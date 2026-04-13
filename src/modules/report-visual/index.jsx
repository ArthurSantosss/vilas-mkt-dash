import React, { useState, useMemo, useCallback, useEffect, useRef, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../../services/supabase';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { formatCurrency, formatNumber } from '../../shared/utils/format';
import { Image, Download, Loader2, Sparkles, Copy, Check, Send, CheckCircle2 } from 'lucide-react';
import PeriodSelector from '../../shared/components/PeriodSelector';
import {
  fetchAccountInsights, fetchCampaignsWithInsights,
  fetchCampaignDailyInsights, getPreviousPeriodRange
} from '../../services/metaApi';
import { PRESETS } from '../../shared/utils/dateUtils';
import { toPng } from 'html-to-image';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts';

const SLACK_WEBHOOK_TAG = import.meta.env.VITE_SLACK_WEBHOOK_TAG;

// ── Allowed agencies for visual reports ──
const ALLOWED_AGENCIES_VISUAL = ['vilasmkt', 'tag'];

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

function formatCompact(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace('.0', '')} mi`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace('.0', '')} mil`;
  return formatNumber(value);
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

// (pie chart palette and gender labels removed — pies replaced by extended bar chart)

// Meta Ads logo is rendered as an <img> from /meta-ads-logo.png (converted to base64 at generate time)

// ── KPI Card ──
function ReportKPI({ label, value, color = '#2196F3' }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a2a3d, #1e2d3d)',
      borderRadius: 12,
      border: '1px solid #2a3a4d',
      padding: '16px 18px',
      flex: 1,
      minWidth: 0,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, ${color}60)` }} />
      <div style={{ fontSize: 10, color: '#8899aa', marginBottom: 6, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

// Meta logo uses /logometa.png converted to base64 at generate time

// ── SVG Funnel (Premium Floating Layers) ──
function SVGFunnel({ stages }) {
  const height = 310;
  const width = 240;
  const cx = width / 2;
  const stageCount = stages.length;
  const gap = 8;

  // Build widths at each boundary
  const topWidths = [];
  const bottomWidths = [];
  
  for (let i = 0; i < stageCount; i++) {
    const curPct = stages[i].widthPct / 100;
    const nextPct = i < stageCount - 1 ? stages[i + 1].widthPct / 100 : curPct * 0.45;
    
    let botW = width * nextPct;
    if (i === stageCount - 1) botW = width * curPct * 0.5;
    
    topWidths.push(width * curPct);
    bottomWidths.push(botW);
  }

  const stageH = height / stageCount;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
      <defs>
        {stages.map((s, i) => (
          <linearGradient key={i} id={`funnelGrad${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.95} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.6} />
          </linearGradient>
        ))}
        {stages.map((s, i) => (
          <linearGradient key={`highLight${i}`} id={`highLight${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.0} />
            <stop offset="50%" stopColor="#fff" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0.0} />
          </linearGradient>
        ))}
      </defs>
      {stages.map((s, i) => {
        const topW = topWidths[i];
        const bottomW = bottomWidths[i];
        const y1 = i * stageH + (i === 0 ? 0 : gap / 2);
        const y2 = (i + 1) * stageH - (i === stageCount - 1 ? 0 : gap / 2);
        
        const tl = cx - topW / 2;
        const tr = cx + topW / 2;
        const bl = cx - bottomW / 2;
        const br = cx + bottomW / 2;
        const midY = (y1 + y2) / 2;
        
        const pathData = `M ${tl} ${y1} 
                          L ${tr} ${y1} 
                          Q ${tr - (tr - br) * 0.15} ${midY}, ${br} ${y2} 
                          L ${bl} ${y2} 
                          Q ${tl + (tl - bl) * 0.15} ${midY}, ${tl} ${y1} 
                          Z`;

        return (
          <g key={i}>
            <path d={pathData} fill={`url(#funnelGrad${i})`} stroke={s.color} strokeWidth={1} strokeOpacity={0.5} />
            <path d={`M ${tl+2} ${y1+1} L ${tr-2} ${y1+1}`} stroke={`url(#highLight${i})`} strokeWidth={1.5} fill="none" strokeLinecap="round" />
            <text x={cx} y={midY - 10} textAnchor="middle" fill="#b0bec5" fontSize={10} fontWeight={700} letterSpacing={1.2}>
              {s.label.toUpperCase()}
            </text>
            <text x={cx} y={midY + 16} textAnchor="middle" fill="#ffffff" fontSize={24} fontWeight={800} fontFamily="Inter, system-ui, sans-serif">
              {formatCompact(s.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Helper: convert image URL to base64 for html-to-image compatibility ──
function resolveAssetUrl(url) {
  if (typeof window === 'undefined' || !url?.startsWith('/')) return url;
  return new URL(url, window.location.origin).toString();
}

async function toBase64(url) {
  try {
    const fullUrl = resolveAssetUrl(url);
    const res = await fetch(fullUrl);
    if (!res.ok) { console.warn('[toBase64] fetch failed for', url, res.status); return url; }
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        console.log('[toBase64]', url, '→', reader.result?.substring(0, 40), '...', blob.size, 'bytes');
        resolve(reader.result);
      };
      reader.readAsDataURL(blob);
    });
  } catch (e) { console.warn('[toBase64] error for', url, e); return url; }
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
    spend: reportData.spend,
    leads: reportData.leads,
    engagements: reportData.engagements,
    agencyLogoB64: reportData.agencyLogoB64?.slice(0, 64),
    metaLogoB64: reportData.metaLogoB64?.slice(0, 64),
  });
}

// ── Standalone report card for off-screen rendering ──
function ReportCard({ data, agencyLogoB64, metaLogoB64, agencyLabel: agLabel }) {
  const d = data;
  return (
    <div
      style={{
        width: 1200,
        minHeight: 750,
        background: 'linear-gradient(180deg, #0d1520 0%, #111827 100%)',
        borderRadius: 16,
        padding: 28,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        color: '#fff',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #1a2538, #1e2d3d)',
        borderRadius: 14, padding: '18px 28px', marginBottom: 22,
        border: '1px solid #2a3a4d', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
            {agencyLogoB64 ? (
              <img src={agencyLogoB64} alt={agLabel} style={{ height: 44, width: 'auto', maxWidth: 180, objectFit: 'contain', display: 'block' }} />
            ) : (
              <span style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', letterSpacing: 0.4 }}>{agLabel}</span>
            )}
          </div>
          <div style={{ height: 32, width: 1, background: '#2a3a4d', flexShrink: 0 }} />
          {metaLogoB64 && <img src={metaLogoB64} alt="Meta" width={38} height={38} style={{ width: 38, height: 38, objectFit: 'contain', display: 'block' }} />}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#243044', borderRadius: 10, padding: '10px 18px', border: '1px solid #2a3a4d',
        }}>
          <span style={{ fontSize: 13, color: '#b0bec5', fontWeight: 500 }}>{d.period.start} — {d.period.end}</span>
        </div>
      </div>

      {/* Account name */}
      <div style={{
        fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 18,
        padding: '12px 20px', background: 'linear-gradient(135deg, #1a2a3d, #1e2d3d)',
        borderRadius: 12, border: '1px solid #2a3a4d',
      }}>
        📊 {d.accountName}
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 22 }}>
        <ReportKPI label="Investimento" value={formatCurrency(d.spend)} color="#0FA5AE" />
        <ReportKPI label="Leads / Conversas" value={formatNumber(d.leads)} color="#1B8EC2" />
        <ReportKPI label="Custo por Lead" value={formatCurrency(d.costPerLead)} color="#2196F3" />
        <ReportKPI label="Engajamentos" value={formatNumber(d.engagements)} color="#42A5F5" />
        <ReportKPI label="Custo / Engajamento" value={formatCurrency(d.costPerEngagement)} color="#64B5F6" />
      </div>

      {/* Funnel */}
      <div style={{
        background: 'linear-gradient(135deg, #1a2a3d, #1e2d3d)',
        borderRadius: 14, border: '1px solid #2a3a4d', padding: '20px 20px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      }}>
        <div style={{ fontSize: 11, color: '#8899aa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14, textAlign: 'center' }}>
          Funil de Conversão
        </div>
        <SVGFunnel stages={[
          { label: 'Impressões', value: d.impressions, widthPct: 100, color: '#0B6E75' },
          { label: 'Alcance', value: d.reach, widthPct: Math.max(40, Math.min(82, (d.reach / Math.max(d.impressions, 1)) * 100)), color: '#0FA5AE' },
          { label: 'Cliques', value: d.clicks, widthPct: Math.max(24, Math.min(50, (d.clicks / Math.max(d.reach, 1)) * 100 + 20)), color: '#1B8EC2' },
          { label: 'Leads', value: d.leads, widthPct: Math.max(14, Math.min(30, (d.leads / Math.max(d.clicks, 1)) * 100 + 10)), color: '#2196F3' },
        ]} />
      </div>
    </div>
  );
}

async function renderCardToPng(reportCardProps) {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1200px;z-index:-1;';
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(createElement(ReportCard, reportCardProps));

  // Wait for render + images
  await new Promise(r => setTimeout(r, 500));
  await waitForImages(container);
  await new Promise(r => requestAnimationFrame(r));

  const opts = { quality: 1, pixelRatio: 1.15, backgroundColor: '#0d1520', cacheBust: false, skipFonts: true };
  // Warm-up pass
  await toPng(container.firstChild, opts).catch(() => {});
  await new Promise(r => requestAnimationFrame(r));
  const dataUrl = await toPng(container.firstChild, opts);

  root.unmount();
  document.body.removeChild(container);

  return dataUrlToBlob(dataUrl);
}

export default function ReportVisual() {
  const { accounts, campaigns, selectedPeriod, setSelectedPeriod } = useMetaAds();
  const { agencies, accountAgencies } = useAgency();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedAgency, setSelectedAgency] = useState('');
  const [selectedCampaignIds, setSelectedCampaignIds] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const reportRef = useRef(null);
  const exportCacheRef = useRef({ key: '', canvas: null, blob: null });

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

  const logoSrc = agencyType === 'tag' ? '/logotag.png' : '/favicon.png';
  const agencyLabel = agencyType === 'tag' ? 'Grupo Tag' : 'Vilas Growth Marketing';

  const filteredAccounts = useMemo(() => {
    if (selectedAgency === '__all__') return accounts;
    if (!selectedAgency) return [];
    return accounts.filter(a => accountAgencies[a.id] === selectedAgency);
  }, [accounts, selectedAgency, accountAgencies]);

  const accountCampaigns = useMemo(() => {
    if (!selectedAccount) return [];

    return campaigns
      .filter(campaign => campaign.accountId === selectedAccount)
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

      const diffs = {
        spend: calcDiff(spend, prevSpend),
        leads: calcDiff(leads, prevLeads),
        costPerLead: calcDiff(costPerLead, prevCostPerLead),
        engagements: calcDiff(engagements, prevEngagements),
        costPerEngagement: calcDiff(costPerEngagement, prevCostPerEngagement),
      };

      // Daily leads
      let dailyLeads = [];
      if (campData.length > 0) {
        try {
          const allDaily = await Promise.all(
            campData.map(c => fetchCampaignDailyInsights(c.id, selectedPeriod))
          );
          const dayMap = {};
          for (const daily of allDaily) {
            for (const d of daily) {
              const date = d.date_start;
              if (!dayMap[date]) dayMap[date] = { date, leads: 0 };
              dayMap[date].leads += getActionValueMulti(d.actions || [], LEAD_ACTION_TYPES);
            }
          }
          dailyLeads = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))
            .map(d => ({ date: `${d.date.split('-')[2]}/${d.date.split('-')[1]}`, leads: d.leads }));
        } catch { /* empty */ }
      }

      const account = accounts.find(a => a.id === selectedAccount);
      const periodDates = formatPeriodLabel(selectedPeriod);

      // Convert logos to base64 once, before export
      const [agencyLogoB64, metaLogoB64] = await Promise.all([
        toBase64(logoSrc),
        toBase64('/logometa.png'),
      ]);

      setReportData({
        accountName: account?.clientName || 'Conta',
        scopeLabel: hasCampaignFilter ? campaignScopeLabel : 'Conta inteira',
        selectedCampaignNames,
        filteredCampaignCount: hasCampaignFilter ? selectedCampaignIds.length : 0,
        period: periodDates,
        spend, impressions, reach, clicks, leads, engagements,
        costPerLead, costPerEngagement,
        diffs, dailyLeads, agencyLogoB64, metaLogoB64,
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
    accounts,
    logoSrc,
    hasCampaignFilter,
    selectedCampaignIds,
    selectedCampaigns,
    campaignScopeLabel,
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

  // ── Tag: send all accounts report to Slack ──
  const [sendingTag, setSendingTag] = useState(false);
  const [tagSent, setTagSent] = useState(false);
  const [tagError, setTagError] = useState(null);

  const tagAccounts = useMemo(() => {
    return accounts.filter(a => {
      const ag = accountAgencies[a.id];
      return ag && matchAgencyVisual(ag) === 'tag';
    });
  }, [accounts, accountAgencies]);

  const handleSendTagSlack = useCallback(async () => {
    if (tagAccounts.length === 0) {
      setTagError('Nenhuma conta Tag encontrada. Verifique as agências nas Configurações.');
      return;
    }
    setSendingTag(true);
    setTagSent(false);
    setTagError(null);

    try {
      const periodDates = formatPeriodLabel(selectedPeriod);

      // Pre-load logos as base64
      const [agencyLogoB64, metaLogoB64] = await Promise.all([
        toBase64('/logotag.png'),
        toBase64('/logometa.png'),
      ]);

      let sentCount = 0;

      for (const account of tagAccounts) {
        const accountCamps = campaigns.filter(c => c.accountId === account.id && Number(c.metrics?.spend || 0) > 0);
        if (accountCamps.length === 0) continue;

        const totalSpend = accountCamps.reduce((s, c) => s + Number(c.metrics?.spend || 0), 0);
        const totalImpressions = accountCamps.reduce((s, c) => s + Number(c.metrics?.impressions || 0), 0);
        const totalReach = accountCamps.reduce((s, c) => s + Number(c.metrics?.reach || 0), 0);
        const totalClicks = accountCamps.reduce((s, c) => s + Number(c.metrics?.clicks || c.metrics?.linkClicks || 0), 0);
        const totalLeads = accountCamps.reduce((s, c) => s + Number(c.metrics?.messages || 0), 0);
        const totalEngagements = accountCamps.reduce((s, c) => s + Number(c.metrics?.engagements || 0), 0);
        const costPerLead = totalLeads > 0 ? totalSpend / totalLeads : 0;
        const costPerEngagement = totalEngagements > 0 ? totalSpend / totalEngagements : 0;

        const cardData = {
          accountName: account.clientName || 'Conta',
          period: periodDates,
          spend: totalSpend,
          impressions: totalImpressions,
          reach: totalReach,
          clicks: totalClicks,
          leads: totalLeads,
          engagements: totalEngagements,
          costPerLead,
          costPerEngagement,
        };

        // Render card to PNG blob
        const pngBlob = await renderCardToPng({
          data: cardData,
          agencyLogoB64,
          metaLogoB64,
          agencyLabel: 'Grupo Tag',
        });

        // Upload to Supabase Storage
        const fileName = `tag-${account.id}-${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from('report-images')
          .upload(fileName, pngBlob, { contentType: 'image/png', upsert: true });

        if (uploadError) {
          console.error('[ReportVisual] Upload error:', uploadError);
          throw new Error(`Falha ao fazer upload da imagem: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('report-images')
          .getPublicUrl(fileName);

        const publicUrl = urlData?.publicUrl;
        if (!publicUrl) throw new Error('Não foi possível obter URL pública da imagem');

        // Send image to Slack via webhook
        const slackPayload = {
          text: `📊 Relatório Visual — ${account.clientName} (${periodDates.start} a ${periodDates.end})`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `⭐ *Relatório Visual — ${account.clientName}*\n📅 ${periodDates.start} a ${periodDates.end}`,
              },
            },
            {
              type: 'image',
              image_url: publicUrl,
              alt_text: `Relatório ${account.clientName}`,
            },
          ],
        };

        await fetch(SLACK_WEBHOOK_TAG, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `payload=${encodeURIComponent(JSON.stringify(slackPayload))}`,
        });

        sentCount++;

        // Clean up uploaded image after sending (async, no need to wait)
        supabase.storage.from('report-images').remove([fileName]).catch(() => {});
      }

      if (sentCount === 0) {
        setTagError('Nenhuma conta Tag com dados de campanhas no período selecionado.');
        return;
      }

      setTagSent(true);
      setTimeout(() => setTagSent(false), 4000);
    } catch (err) {
      console.error('[ReportVisual] Erro ao enviar relatórios Tag para Slack:', err);
      const msg = err.message || 'Erro desconhecido';
      if (msg.includes('Load failed') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setTagError('Erro de rede: não foi possível conectar ao Slack.');
      } else {
        setTagError(`Erro: ${msg}`);
      }
    } finally {
      setSendingTag(false);
    }
  }, [tagAccounts, campaigns, selectedPeriod]);

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
        <div className="relative mt-5 flex flex-wrap items-end justify-center gap-5">
          {hasAgencies ? (
            <div className="flex flex-col gap-1.5 w-[210px]">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Agência</label>
              <select
                value={selectedAgency}
                onChange={e => {
                  setSelectedAgency(e.target.value);
                  setSelectedAccount('');
                  setSelectedCampaignIds([]);
                }}
                className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
              >
                {allowedAgencyList.map(ag => <option key={ag} value={ag}>{ag}</option>)}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 w-[295px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Conta</label>
            <select
              value={selectedAccount}
              onChange={e => {
                setSelectedAccount(e.target.value);
                setSelectedCampaignIds([]);
              }}
              className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
            >
              <option value="">Selecione uma conta</option>
              {filteredAccounts.map(a => <option key={a.id} value={a.id}>{a.clientName}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 w-[210px] z-50">
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

          {agencyType === 'tag' && (
            <button
              onClick={handleSendTagSlack}
              disabled={sendingTag || tagAccounts.length === 0}
              className="group relative inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
                bg-gradient-to-r from-[#4A154B] to-[#611f69] text-white shadow-lg shadow-[#4A154B]/25
                hover:shadow-xl hover:shadow-[#4A154B]/30 hover:scale-[1.02] active:scale-[0.98]
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
                transition-all duration-300 ease-out"
            >
              {sendingTag ? <Loader2 size={16} className="animate-spin" /> : tagSent ? <CheckCircle2 size={16} /> : <Send size={16} />}
              {sendingTag ? 'Enviando...' : tagSent ? 'Enviado ao Slack!' : `Todos Tag → Slack (${tagAccounts.length})`}
              <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          )}
        </div>

        {tagError && agencyType === 'tag' && (
          <div className="relative mt-3 mx-auto max-w-lg rounded-lg bg-danger/10 border border-danger/30 px-4 py-2.5 text-center">
            <p className="text-sm text-danger">{tagError}</p>
          </div>
        )}
      </div>

      {/* REPORT CANVAS */}
      {d && !d.error && (
        <div className="overflow-x-auto pb-4">
          <div
            ref={reportRef}
            style={{
              width: 1200,
              minHeight: 750,
              background: 'linear-gradient(180deg, #0d1520 0%, #111827 100%)',
              borderRadius: 16,
              padding: 28,
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              color: '#fff',
            }}
          >
            {/* ROW 1: Header — agency logo (base64) + Meta Ads logo + period */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, #1a2538, #1e2d3d)',
              borderRadius: 14,
              padding: '18px 28px',
              marginBottom: 22,
              border: '1px solid #2a3a4d',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                {/* Agency Logo — base64 <img> for PNG export */}
                <div style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
                  {d.agencyLogoB64 ? (
                    <img
                      src={d.agencyLogoB64}
                      alt={agencyLabel}
                      style={{ height: 44, width: 'auto', maxWidth: 180, objectFit: 'contain', display: 'block' }}
                    />
                  ) : (
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', letterSpacing: 0.4 }}>
                      {agencyLabel}
                    </span>
                  )}
                </div>
                <div style={{ height: 32, width: 1, background: '#2a3a4d', flexShrink: 0 }} />
                {/* Meta Logo — base64 <img> from logometa.png */}
                {d.metaLogoB64 && (
                  <img
                    src={d.metaLogoB64}
                    alt="Meta"
                    width={38}
                    height={38}
                    style={{ width: 38, height: 38, objectFit: 'contain', display: 'block' }}
                  />
                )}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#243044', borderRadius: 10, padding: '10px 18px', border: '1px solid #2a3a4d',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64B5F6" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span style={{ fontSize: 13, color: '#b0bec5', fontWeight: 500 }}>
                  {d.period.start} — {d.period.end}
                </span>
              </div>
            </div>

            {/* ROW 2: KPI Cards */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 22 }}>
              <ReportKPI label="Investimento" value={formatCurrency(d.spend)} color="#0FA5AE" />
              <ReportKPI label="Leads / Conversas" value={formatNumber(d.leads)} color="#1B8EC2" />
              <ReportKPI label="Custo por Lead" value={formatCurrency(d.costPerLead)} color="#2196F3" />
              <ReportKPI label="Engajamentos" value={formatNumber(d.engagements)} color="#42A5F5" />
              <ReportKPI label="Custo / Engajamento" value={formatCurrency(d.costPerEngagement)} color="#64B5F6" />
            </div>

            {/* ROW 3: Funnel + Full-width Bar Chart */}
            <div style={{ display: 'flex', gap: 16 }}>
              {/* LEFT: Real SVG Funnel */}
              <div style={{
                width: 280,
                background: 'linear-gradient(135deg, #1a2a3d, #1e2d3d)',
                borderRadius: 14,
                border: '1px solid #2a3a4d',
                padding: '20px 20px',
                flexShrink: 0,
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              }}>
                <div style={{ fontSize: 11, color: '#8899aa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14, textAlign: 'center' }}>
                  Funil de Conversão
                </div>
                <SVGFunnel stages={[
                  { label: 'Impressões', value: d.impressions, widthPct: 100, color: '#0B6E75' },
                  { label: 'Alcance', value: d.reach, widthPct: Math.max(40, Math.min(82, (d.reach / Math.max(d.impressions, 1)) * 100)), color: '#0FA5AE' },
                  { label: 'Cliques', value: d.clicks, widthPct: Math.max(24, Math.min(50, (d.clicks / Math.max(d.reach, 1)) * 100 + 20)), color: '#1B8EC2' },
                  { label: 'Leads', value: d.leads, widthPct: Math.max(14, Math.min(30, (d.leads / Math.max(d.clicks, 1)) * 100 + 10)), color: '#2196F3' },
                ]} />
              </div>

              {/* RIGHT: Daily Leads Bar Chart (full width) */}
              <div style={{
                flex: 1,
                background: 'linear-gradient(135deg, #1a2a3d, #1e2d3d)',
                borderRadius: 14,
                border: '1px solid #2a3a4d',
                padding: '20px 20px',
                minWidth: 0,
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: 'linear-gradient(135deg, #0FA5AE, #2196F3)' }} />
                  <span style={{ fontSize: 12, color: '#b0bec5', fontWeight: 600 }}>Leads por dia</span>
                </div>
                {d.dailyLeads.length > 0 ? (
                  <ResponsiveContainer width="100%" height={290}>
                    <BarChart data={d.dailyLeads} margin={{ top: 24, right: 10, left: -10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="barGradVis" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#20CFCF" stopOpacity={1} />
                          <stop offset="40%" stopColor="#0FA5AE" stopOpacity={0.92} />
                          <stop offset="100%" stopColor="#0B6E75" stopOpacity={0.75} />
                        </linearGradient>
                        <linearGradient id="barGlowVis" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#20CFCF" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#0FA5AE" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#6b7f8e', fontSize: 10, fontWeight: 500 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7f8e', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(15,165,174,0.08)', radius: 6 }}
                        contentStyle={{ background: 'linear-gradient(135deg, #1a2538, #1e2d3d)', border: '1px solid #0FA5AE40', borderRadius: 12, fontSize: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
                        labelStyle={{ color: '#8899aa', fontWeight: 600, marginBottom: 4 }}
                        itemStyle={{ color: '#20CFCF', fontWeight: 700 }}
                        formatter={(value) => [`${value} leads`, '']}
                      />
                      {/* Glow shadow bar behind main bar */}
                      <Bar dataKey="leads" fill="url(#barGlowVis)" radius={[8, 8, 0, 0]} barSize={d.dailyLeads.length > 20 ? 22 : 36} isAnimationActive={false} />
                      {/* Main bar with gradient + value labels on top */}
                      <Bar
                        dataKey="leads"
                        fill="url(#barGradVis)"
                        radius={[8, 8, 0, 0]}
                        barSize={d.dailyLeads.length > 20 ? 18 : 32}
                        label={{ position: 'top', fill: '#b0bec5', fontSize: 10, fontWeight: 700, offset: 6 }}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 290, color: '#6b7f8e', fontSize: 12 }}>
                    Sem dados diários disponíveis
                  </div>
                )}
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

    </div>
  );
}
