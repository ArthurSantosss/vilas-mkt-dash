import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { formatCurrency, formatNumber } from '../../shared/utils/format';
import { Image, Download, Loader2, Sparkles, Copy, Check, Zap } from 'lucide-react';
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
import { supabase } from '../../services/supabase';

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

// (pie chart palette and gender labels removed — pies replaced by extended bar chart)

// Meta Ads logo is rendered as an <img> from /meta-ads-logo.png (converted to base64 at generate time)

// ── KPI Card with comparison ──
function ReportKPI({ label, value, diff, color = '#2196F3', invertColors = false }) {
  const diffNum = diff ? parseFloat(diff) : null;
  const isPositive = diffNum > 0;
  const isGood = invertColors ? isPositive : !isPositive;
  const diffColor = diffNum === null ? '#6b7f8e' : isGood ? '#34D399' : '#F87171';
  const diffArrow = diffNum > 0 ? '▲' : diffNum < 0 ? '▼' : '';

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
      {diffNum !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: diffColor }}>
            {diffArrow} {Math.abs(diffNum)}%
          </span>
          <span style={{ fontSize: 9, color: '#6b7f8e' }}>vs período anterior</span>
        </div>
      )}
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
    start: reportData.period?.startShort,
    end: reportData.period?.endShort,
    spend: reportData.spend,
    leads: reportData.leads,
    engagements: reportData.engagements,
    agencyLogoB64: reportData.agencyLogoB64?.slice(0, 64),
    metaLogoB64: reportData.metaLogoB64?.slice(0, 64),
  });
}

export default function ReportVisual() {
  const { accounts, selectedPeriod, setSelectedPeriod } = useMetaAds();
  const { agencies, accountAgencies } = useAgency();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedAgency, setSelectedAgency] = useState('');
  const [reportData, setReportData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
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

  useEffect(() => {
    if (filteredAccounts.length > 0 && !filteredAccounts.find(a => a.id === selectedAccount)) {
      setSelectedAccount(filteredAccounts[0].id);
    }
  }, [filteredAccounts, selectedAccount]);

  const handleGenerate = useCallback(async () => {
    if (!selectedAccount) return;
    setGenerating(true);
    setReportData(null);
    exportCacheRef.current = { key: '', dataUrl: '', blob: null };

    try {
      const prevPeriod = getPreviousPeriodRange(selectedPeriod);
      const [insights, prevInsights, campData] = await Promise.all([
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

      const spend = parseFloat(insights.spend || 0);
      const impressions = parseInt(insights.impressions || 0, 10);
      const reach = parseInt(insights.reach || 0, 10);
      const clicks = parseInt(insights.inline_link_clicks || 0, 10);

      const prevSpend = parseFloat(prevInsights?.spend || 0);

      const leads = getActionValueMulti(actions, [
        'onsite_conversion.messaging_conversation_started_7d',
        'messaging_conversation_started_7d',
        'onsite_conversion.messaging_first_reply',
      ]);
      const prevLeads = getActionValueMulti(prevActions, [
        'onsite_conversion.messaging_conversation_started_7d',
        'messaging_conversation_started_7d',
        'onsite_conversion.messaging_first_reply',
      ]);

      const engagements = getActionValueMulti(actions, ['post_engagement', 'page_engagement']);
      const prevEngagements = getActionValueMulti(prevActions, ['post_engagement', 'page_engagement']);

      const costPerLead = leads > 0 ? spend / leads : 0;
      const prevCostPerLead = prevLeads > 0 ? prevSpend / prevLeads : 0;
      const costPerEngagement = engagements > 0 ? spend / engagements : 0;
      const prevCostPerEngagement = prevEngagements > 0 ? prevSpend / prevEngagements : 0;

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
            campData.slice(0, 5).map(c => fetchCampaignDailyInsights(c.id, selectedPeriod))
          );
          const dayMap = {};
          for (const daily of allDaily) {
            for (const d of daily) {
              const date = d.date_start;
              if (!dayMap[date]) dayMap[date] = { date, leads: 0 };
              dayMap[date].leads += getActionValueMulti(d.actions || [], [
                'onsite_conversion.messaging_conversation_started_7d',
                'messaging_conversation_started_7d',
                'onsite_conversion.messaging_first_reply',
              ]);
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
  }, [selectedAccount, selectedPeriod, accounts, logoSrc]);

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

  // Generate AI Analysis
  const handleGenerateAI = useCallback(async () => {
    if (!selectedAccount) return;
    setLoadingAI(true);
    setAiAnalysis(null);
    try {
      const account = accounts.find(a => a.id === selectedAccount);
      const periodLabel = formatPeriodLabel(selectedPeriod);
      const campaignsData = await fetchCampaignsWithInsights(selectedAccount, selectedPeriod);

      const campaignsForAI = (campaignsData || [])
        .filter(c => c.insights?.data?.[0])
        .map(c => {
          const insight = c.insights.data[0];
          return {
            id: c.id,
            name: c.name,
            spend: parseFloat(insight.spend || 0),
            impressions: parseInt(insight.impressions || 0, 10),
            reach: parseInt(insight.reach || 0, 10),
            cpm: parseFloat(insight.cpm || 0),
          };
        });

      if (campaignsForAI.length === 0) {
        setAiAnalysis({ error: 'Sem campanhas com dados para análise.' });
        return;
      }

      const { data: aiData, error: fnError } = await supabase.functions.invoke('analyze-campaign', {
        body: {
          accountName: account?.clientName || '',
          platform: 'Meta Ads',
          periodLabel: `${periodLabel.start} a ${periodLabel.end}`,
          todayDate: new Date().toLocaleDateString('pt-BR'),
          campaigns: campaignsForAI,
        },
      });

      if (fnError) throw fnError;
      if (aiData?.error) throw new Error(aiData.error);

      setAiAnalysis({ analysis: aiData.relatorio || aiData || 'Análise gerada com sucesso.' });
    } catch (err) {
      console.error('Erro ao gerar análise com IA:', err);
      setAiAnalysis({ error: `Erro: ${err.message}` });
    } finally {
      setLoadingAI(false);
    }
  }, [selectedAccount, selectedPeriod, accounts]);

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
                onChange={e => { setSelectedAgency(e.target.value); setSelectedAccount(''); }}
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
              onChange={e => setSelectedAccount(e.target.value)}
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

          <button
            onClick={handleGenerateAI}
            disabled={!selectedAccount || loadingAI}
            className="group relative inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-warning to-warning/80 text-black shadow-lg shadow-warning/25
              hover:shadow-xl hover:shadow-warning/30 hover:scale-[1.02] active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
              transition-all duration-300 ease-out"
          >
            {loadingAI ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {loadingAI ? 'Gerando...' : 'Gerar Análise com IA'}
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
        </div>
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

            {/* ROW 2: KPI Cards with comparison */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 22 }}>
              <ReportKPI label="Investimento" value={formatCurrency(d.spend)} diff={d.diffs.spend} color="#0FA5AE" />
              <ReportKPI label="Leads / Conversas" value={formatNumber(d.leads)} diff={d.diffs.leads} color="#1B8EC2" invertColors={true} />
              <ReportKPI label="Custo por Lead" value={formatCurrency(d.costPerLead)} diff={d.diffs.costPerLead} color="#2196F3" />
              <ReportKPI label="Engajamentos" value={formatNumber(d.engagements)} diff={d.diffs.engagements} color="#42A5F5" invertColors={true} />
              <ReportKPI label="Custo / Engajamento" value={formatCurrency(d.costPerEngagement)} diff={d.diffs.costPerEngagement} color="#64B5F6" />
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

      {/* AI ANALYSIS */}
      {aiAnalysis && (
        <div className="relative bg-gradient-to-br from-warning/10 to-warning/5 rounded-2xl border border-warning/30 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-warning/5 blur-3xl" />
          </div>
          <div className="relative p-6">
            <div className="flex items-center gap-3 mb-4">
              <Zap size={20} className="text-warning" />
              <h3 className="text-lg font-bold text-text-primary">Análise com IA</h3>
            </div>
            {aiAnalysis.error ? (
              <div className="text-danger text-sm">{aiAnalysis.error}</div>
            ) : (
              <div className="prose prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed font-sans">
                  {aiAnalysis.analysis}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
