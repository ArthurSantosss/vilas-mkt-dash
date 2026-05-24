import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, ReferenceLine,
} from 'recharts';
import { formatCurrency, formatNumber, formatPercent } from '../utils/format';

function getImageSources(src) {
  if (Array.isArray(src)) return src.filter(Boolean);
  return src ? [src] : [];
}

function AgencyLogo({ src, label }) {
  const sources = useMemo(() => getImageSources(src), [src]);
  const [index, setIndex] = useState(0);
  const currentSrc = sources[index] || sources[0];

  if (!currentSrc) {
    return (
      <span style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </span>
    );
  }
  return (
    <img
      src={currentSrc}
      alt={label}
      onError={() => setIndex((prev) => (prev + 1 < sources.length ? prev + 1 : sources.length))}
      style={{ height: 42, width: 'auto', maxWidth: 180, objectFit: 'contain', display: 'block' }}
    />
  );
}

function MetaLogo({ src }) {
  const sources = useMemo(() => getImageSources(src), [src]);
  const [index, setIndex] = useState(0);
  const currentSrc = sources[index] || sources[0];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32 }}>
      {currentSrc && (
        <img
          src={currentSrc}
          alt="Meta Ads"
          onError={() => setIndex((prev) => (prev + 1 < sources.length ? prev + 1 : sources.length))}
          style={{ height: 26, width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0 }}
        />
      )}
      <span style={{ fontSize: 16, fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em', whiteSpace: 'nowrap', opacity: 0.95 }}>
        Meta Ads
      </span>
    </div>
  );
}

function ClientLogo({ src }) {
  const sources = useMemo(() => getImageSources(src), [src]);
  const [index, setIndex] = useState(0);
  const currentSrc = sources[index] || sources[0];

  if (!currentSrc) return null;
  return (
    <img
      src={currentSrc}
      alt="Client Logo"
      onError={() => setIndex((prev) => (prev + 1 < sources.length ? prev + 1 : sources.length))}
      style={{ height: 42, width: 'auto', maxWidth: 180, objectFit: 'contain', display: 'block' }}
    />
  );
}

function formatCompact(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace('.0', '')} mi`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace('.0', '')} mil`;
  return formatNumber(value);
}

// ── Lucide-style inline SVG icons (html-to-image friendly) ──
function KpiIcon({ name, color = '#94A3B8', size = 16 }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (name) {
    case 'wallet':
      return (<svg {...common}><path d="M20 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>);
    case 'message':
      return (<svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>);
    case 'click':
      return (<svg {...common}><path d="M9 9l5 12 1.8-5.2L21 14Z"/><path d="M7.2 2.2L8 5.1"/><path d="M5.1 8L2.2 7.2"/><path d="M14 4.1L12 6"/><path d="M6 12l-1.9 2"/></svg>);
    case 'heart':
      return (<svg {...common}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>);
    case 'coins':
      return (<svg {...common}><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="M16.71 13.88l.7.71-2.82 2.82"/></svg>);
    case 'users':
      return (<svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
    case 'eye':
      return (<svg {...common}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>);
    case 'percent':
      return (<svg {...common}><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>);
    case 'instagram':
      return (<svg {...common}><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>);
    default:
      return null;
  }
}

// ── Delta helpers (variação % vs período anterior) ──
function getDeltaPalette(intent, value) {
  if (value == null) return null;
  const num = parseFloat(value);
  if (Number.isNaN(num)) return null;
  const arrow = num >= 0 ? '▲' : '▼';
  if (intent === 'neutral') {
    return { color: '#CBD5E1', bg: 'rgba(203,213,225,0.08)', border: 'rgba(203,213,225,0.18)', arrow };
  }
  const isGood = intent === 'higher_is_better' ? num >= 0 : num < 0;
  return isGood
    ? { color: '#34D399', bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.28)', arrow }
    : { color: '#F87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.28)', arrow };
}

function formatDelta(value) {
  if (value == null) return '';
  const num = parseFloat(value);
  if (Number.isNaN(num)) return '';
  return `${Math.abs(num).toFixed(1)}%`;
}

const OBJECTIVES = {
  messages: {
    label: 'Mensagens',
    metricLabel: 'Mensagens',
    metricLabelSingular: 'mensagem',
    dailyKey: 'leads',
    dailyTitle: 'Mensagens por dia',
    buildKpis: (d) => [
      { label: 'Investimento',     value: formatCurrency(d.spend),       color: '#22D3EE', icon: 'wallet',  diffKey: 'spend',       intent: 'neutral' },
      { label: 'Mensagens',        value: formatNumber(d.leads),         color: '#38BDF8', icon: 'message', diffKey: 'leads',       intent: 'higher_is_better' },
      { label: 'Custo / Mensagem', value: formatCurrency(d.costPerLead), color: '#F59E0B', icon: 'coins',   diffKey: 'costPerLead', intent: 'lower_is_better' },
      { label: 'Alcance',          value: formatNumber(d.reach),         color: '#A78BFA', icon: 'users',   diffKey: 'reach',       intent: 'higher_is_better' },
      { label: 'CTR',              value: formatPercent(d.ctr),          color: '#34D399', icon: 'percent', diffKey: 'ctr',         intent: 'higher_is_better' },
    ],
    buildFunnel: (d) => [
      { label: 'Impressões', value: d.impressions, widthPct: 100, color: '#0C4A6E' },
      { label: 'Alcance', value: d.reach, widthPct: Math.max(40, Math.min(82, (d.reach / Math.max(d.impressions, 1)) * 100)), color: '#0369A1' },
      { label: 'Cliques', value: d.clicks, widthPct: Math.max(24, Math.min(50, (d.clicks / Math.max(d.reach, 1)) * 100 + 20)), color: '#0EA5E9' },
      { label: 'Mensagens', value: d.leads, widthPct: Math.max(14, Math.min(30, (d.leads / Math.max(d.clicks, 1)) * 100 + 10)), color: '#22D3EE' },
    ],
  },
  clicks: {
    label: 'Cliques no link',
    metricLabel: 'Cliques',
    metricLabelSingular: 'clique',
    dailyKey: 'clicks',
    dailyTitle: 'Cliques por dia',
    buildKpis: (d) => [
      { label: 'Investimento',   value: formatCurrency(d.spend),        color: '#22D3EE', icon: 'wallet',  diffKey: 'spend', intent: 'neutral' },
      { label: 'Cliques',        value: formatNumber(d.clicks),         color: '#38BDF8', icon: 'click' },
      { label: 'Custo / Clique', value: formatCurrency(d.costPerClick), color: '#F59E0B', icon: 'coins' },
      { label: 'CTR',            value: formatPercent(d.ctr),           color: '#34D399', icon: 'percent', diffKey: 'ctr',   intent: 'higher_is_better' },
      { label: 'Alcance',        value: formatNumber(d.reach),          color: '#A78BFA', icon: 'users',   diffKey: 'reach', intent: 'higher_is_better' },
    ],
    buildFunnel: (d) => [
      { label: 'Impressões', value: d.impressions, widthPct: 100, color: '#0C4A6E' },
      { label: 'Alcance', value: d.reach, widthPct: Math.max(40, Math.min(82, (d.reach / Math.max(d.impressions, 1)) * 100)), color: '#0369A1' },
      { label: 'Cliques', value: d.clicks, widthPct: Math.max(20, Math.min(55, (d.clicks / Math.max(d.reach, 1)) * 100 + 15)), color: '#22D3EE' },
    ],
  },
  engagements: {
    label: 'Engajamentos',
    metricLabel: 'Engajamentos',
    metricLabelSingular: 'engajamento',
    dailyKey: 'engagements',
    dailyTitle: 'Engajamentos por dia',
    buildKpis: (d) => [
      { label: 'Investimento',        value: formatCurrency(d.spend),             color: '#22D3EE', icon: 'wallet',  diffKey: 'spend',             intent: 'neutral' },
      { label: 'Engajamentos',        value: formatNumber(d.engagements),         color: '#38BDF8', icon: 'heart',   diffKey: 'engagements',       intent: 'higher_is_better' },
      { label: 'Custo / Engajamento', value: formatCurrency(d.costPerEngagement), color: '#F59E0B', icon: 'coins',   diffKey: 'costPerEngagement', intent: 'lower_is_better' },
      { label: 'Alcance',             value: formatNumber(d.reach),               color: '#A78BFA', icon: 'users',   diffKey: 'reach',             intent: 'higher_is_better' },
      { label: 'CTR',                 value: formatPercent(d.ctr),                color: '#34D399', icon: 'percent', diffKey: 'ctr',               intent: 'higher_is_better' },
    ],
    buildFunnel: (d) => [
      { label: 'Impressões', value: d.impressions, widthPct: 100, color: '#0C4A6E' },
      { label: 'Alcance', value: d.reach, widthPct: Math.max(40, Math.min(82, (d.reach / Math.max(d.impressions, 1)) * 100)), color: '#0369A1' },
      { label: 'Engajamentos', value: d.engagements, widthPct: Math.max(16, Math.min(46, (d.engagements / Math.max(d.reach, 1)) * 100 + 12)), color: '#22D3EE' },
    ],
  },
};

function ReportKPI({ label, value, color = '#38BDF8', icon, delta }) {
  return (
    <div style={{
      background: 'linear-gradient(155deg, rgba(15,22,38,0.96) 0%, rgba(20,29,48,0.96) 100%)',
      borderRadius: 16,
      border: '1px solid rgba(255, 255, 255, 0.06)',
      padding: '18px 16px 16px',
      flex: 1,
      minWidth: 0,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 6px 24px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255,255,255,0.04)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
    }}>
      {/* Top accent bar — gradient feathered ends */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
      }} />
      {/* Soft halo behind value */}
      <div style={{
        position: 'absolute', top: '52%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 140, height: 70, borderRadius: '50%',
        background: `radial-gradient(ellipse, ${color}22, transparent 70%)`,
        filter: 'blur(18px)', pointerEvents: 'none',
      }} />

      {/* Icon */}
      {icon && (
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: `linear-gradient(135deg, ${color}22, ${color}0d)`,
          border: `1px solid ${color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 8,
          position: 'relative',
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}>
          <KpiIcon name={icon} color={color} size={15} />
        </div>
      )}

      {/* Label */}
      <div style={{
        fontSize: 10, color: '#94A3B8', marginBottom: 6, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        position: 'relative',
      }}>{label}</div>

      {/* Value */}
      <div style={{
        fontSize: 24, fontWeight: 800, color: '#fff',
        fontFamily: 'Outfit, Inter, system-ui, sans-serif',
        lineHeight: 1.15,
        fontVariantNumeric: 'tabular-nums',
        textShadow: `0 0 22px ${color}40`,
        position: 'relative',
      }}>{value}</div>

      {/* Delta pill */}
      {delta && (
        <div style={{
          marginTop: 8,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 9px', borderRadius: 999,
          fontSize: 10, fontWeight: 800, letterSpacing: '0.02em',
          fontFamily: 'Outfit, Inter, system-ui, sans-serif',
          fontVariantNumeric: 'tabular-nums',
          color: delta.color,
          background: delta.bg,
          border: `1px solid ${delta.border}`,
          position: 'relative',
          lineHeight: 1,
        }}>
          <span style={{ fontSize: 8, lineHeight: 1 }}>{delta.arrow}</span>
          {formatDelta(delta.value)}
        </div>
      )}
    </div>
  );
}

function SVGFunnel({ stages }) {
  const height = 340;
  const width = 240;
  const cx = width / 2;
  const stageCount = stages.length;
  const gap = 14;

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
        <filter id="text-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="1" />
        </filter>
        {stages.map((s, i) => (
          <linearGradient key={i} id={`funnelGrad${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={1} />
            <stop offset="50%" stopColor={s.color} stopOpacity={0.78} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.42} />
          </linearGradient>
        ))}
        {stages.map((s, i) => (
          <linearGradient key={`highLight${i}`} id={`highLight${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.0} />
            <stop offset="50%" stopColor="#fff" stopOpacity={0.35} />
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
            <path d={pathData} fill={`url(#funnelGrad${i})`} stroke={s.color} strokeWidth={1.4} strokeOpacity={0.6} />
            <path d={`M ${tl + 2} ${y1 + 1} L ${tr - 2} ${y1 + 1}`} stroke={`url(#highLight${i})`} strokeWidth={1.6} fill="none" strokeLinecap="round" />
            <text x={cx} y={midY - 9} textAnchor="middle" fill="#F1F5F9" fontSize={11} fontWeight={800} letterSpacing="0.14em" filter="url(#text-shadow)">
              {s.label.toUpperCase()}
            </text>
            <text x={cx} y={midY + 20} textAnchor="middle" fill="#ffffff" fontSize={24} fontWeight={800} fontFamily="Outfit, Inter, system-ui, sans-serif" filter="url(#text-shadow)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatCompact(s.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const ReportCard = function ReportCard({
  data,
  agencyLogoSrc,
  metaLogoSrc,
  clientLogoSrc,
  agencyLabel,
  showAccountName = true,
  objective = 'messages',
  innerRef,
  withBarChart = false,
  width = 1200,
}) {
  const d = data;
  const config = OBJECTIVES[objective] || OBJECTIVES.messages;
  const baseKpis = config.buildKpis(d);
  const funnelStages = config.buildFunnel(d);
  const dailyData = useMemo(() => {
    if (!withBarChart) return [];
    const key = `daily${config.dailyKey.charAt(0).toUpperCase() + config.dailyKey.slice(1)}`;
    return d[key] || [];
  }, [withBarChart, config.dailyKey, d]);
  const metricLabel = config.metricLabel.toLowerCase();

  // Attach delta info per KPI based on diffs available in data
  const kpis = useMemo(() => baseKpis.map((kpi) => {
    if (!kpi.diffKey || !d.diffs) return kpi;
    const raw = d.diffs[kpi.diffKey];
    if (raw == null) return kpi;
    const palette = getDeltaPalette(kpi.intent, raw);
    if (!palette) return kpi;
    return { ...kpi, delta: { ...palette, value: raw } };
  }), [baseKpis, d.diffs]);

  // Average for the daily bar chart reference line
  const dailyAvg = useMemo(() => {
    if (!dailyData.length) return 0;
    const sum = dailyData.reduce((acc, item) => acc + (item[config.dailyKey] || 0), 0);
    return sum / dailyData.length;
  }, [dailyData, config.dailyKey]);

  const showClientLogo = useMemo(() => {
    if (!clientLogoSrc) return false;
    if (Array.isArray(clientLogoSrc)) return clientLogoSrc.filter(Boolean).length > 0;
    return true;
  }, [clientLogoSrc]);

  return (
    <div
      ref={innerRef}
      style={{
        width,
        minHeight: 720,
        background: `
          radial-gradient(ellipse 80% 50% at 85% -10%, rgba(56,189,248,0.09), transparent 60%),
          radial-gradient(ellipse 70% 50% at 10% 110%, rgba(15,165,174,0.08), transparent 55%),
          linear-gradient(180deg, #050b14 0%, #09101f 100%)
        `,
        borderRadius: 20,
        padding: 32,
        fontFamily: 'Outfit, Inter, system-ui, -apple-system, sans-serif',
        color: '#fff',
        border: '1px solid rgba(255, 255, 255, 0.04)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.03)',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* HEADER */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(135deg, rgba(13,22,39,0.95), rgba(18,29,52,0.95))',
        borderRadius: 16,
        padding: '20px 28px',
        marginBottom: 24,
        border: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
            <AgencyLogo src={agencyLogoSrc} label={agencyLabel} />
          </div>
          <div style={{
            height: 32, width: 1, flexShrink: 0,
            background: 'linear-gradient(to bottom, transparent, rgba(56,189,248,0.4), transparent)',
          }} />
          <MetaLogo src={metaLogoSrc} />
        </div>

        {showClientLogo && (
          <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
          }}>
            <ClientLogo src={clientLogoSrc} />
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'linear-gradient(135deg, rgba(56,189,248,0.09), rgba(56,189,248,0.02))',
          borderRadius: 12, padding: '10px 18px',
          border: '1px solid rgba(56,189,248,0.22)',
          boxShadow: '0 0 24px -8px rgba(56,189,248,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span style={{
            fontSize: 13, color: '#E2E8F0', fontWeight: 700, letterSpacing: '0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}>{d.period.start} — {d.period.end}</span>
        </div>
      </div>

      {showAccountName && (
        <div style={{
          fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 20,
          padding: '14px 24px', background: 'linear-gradient(135deg, #0e1726, #142037)',
          borderRadius: 14, border: '1px solid rgba(255, 255, 255, 0.04)',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
        }}>
          📊 {d.accountName}
        </div>
      )}

      {/* KPI GRID */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        {kpis.map((kpi, idx) => (
          <ReportKPI
            key={idx}
            label={kpi.label}
            value={kpi.value}
            color={kpi.color}
            icon={kpi.icon}
            delta={kpi.delta}
          />
        ))}
      </div>

      {/* GRAPH AND FUNNEL */}
      {withBarChart ? (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* Funnel Card */}
          <div style={{
            width: 300,
            background: 'linear-gradient(135deg, rgba(13,22,39,0.95), rgba(18,29,52,0.95))',
            borderRadius: 16,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '24px 24px',
            flexShrink: 0,
            boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
            boxSizing: 'border-box',
          }}>
            <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 18, textAlign: 'center' }}>
              Funil — {config.metricLabel}
            </div>
            <SVGFunnel stages={funnelStages} />
          </div>

          {/* Daily Bar Chart Card */}
          <div style={{
            flex: 1,
            background: 'linear-gradient(135deg, rgba(13,22,39,0.95), rgba(18,29,52,0.95))',
            borderRadius: 16,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '24px 24px',
            minWidth: 0,
            boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
            boxSizing: 'border-box',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: 'linear-gradient(135deg, #00F2FE, #38BDF8)', boxShadow: '0 0 12px rgba(56,189,248,0.6)' }} />
                <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{config.dailyTitle}</span>
              </div>
              {dailyAvg > 0 && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '3px 9px', borderRadius: 999,
                  background: 'rgba(167,139,250,0.10)',
                  border: '1px solid rgba(167,139,250,0.28)',
                  fontSize: 10, fontWeight: 800, color: '#C4B5FD',
                  letterSpacing: '0.04em',
                  fontFamily: 'Outfit, Inter, system-ui, sans-serif',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  <span style={{ width: 10, height: 1.5, background: '#A78BFA', display: 'inline-block' }} />
                  MÉDIA {formatCompact(Math.round(dailyAvg))}
                </div>
              )}
            </div>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={310}>
                <BarChart data={dailyData} margin={{ top: 24, right: 14, left: -22, bottom: 5 }}>
                  <defs>
                    <linearGradient id="barGradVis" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#67E8F9" stopOpacity={1} />
                      <stop offset="40%" stopColor="#22D3EE" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#0E7490" stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="barGradHover" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#A5F3FC" stopOpacity={1} />
                      <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 4" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#CBD5E1', fontSize: 10, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    dy={4}
                  />
                  <YAxis
                    tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    tickFormatter={(v) => formatCompact(v)}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(56, 189, 248, 0.08)', radius: 6 }}
                    contentStyle={{
                      background: 'linear-gradient(135deg, #0b1220, #0f1a2e)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      borderRadius: 12,
                      fontSize: 12,
                      boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                      backdropFilter: 'blur(8px)',
                    }}
                    labelStyle={{ color: '#94A3B8', fontWeight: 700, marginBottom: 4 }}
                    itemStyle={{ color: '#22D3EE', fontWeight: 800 }}
                    formatter={(value) => [`${value} ${metricLabel}`, '']}
                  />
                  {dailyAvg > 0 && (
                    <ReferenceLine
                      y={dailyAvg}
                      stroke="#A78BFA"
                      strokeDasharray="4 5"
                      strokeWidth={1.4}
                      ifOverflow="extendDomain"
                    />
                  )}
                  <Bar
                    dataKey={config.dailyKey}
                    fill="url(#barGradVis)"
                    radius={[8, 8, 2, 2]}
                    barSize={dailyData.length > 20 ? 14 : 26}
                    label={{
                      position: 'top',
                      fill: '#E2E8F0',
                      fontSize: 10,
                      fontWeight: 800,
                      offset: 7,
                      fontFamily: 'Outfit, Inter, system-ui, sans-serif',
                    }}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 310, color: '#64748B', fontSize: 12 }}>
                Sem dados diários disponíveis
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{
          background: 'linear-gradient(135deg, rgba(13,22,39,0.95), rgba(18,29,52,0.95))',
          borderRadius: 16, border: '1px solid rgba(255, 255, 255, 0.06)', padding: '24px 24px',
          boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}>
          <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 20, textAlign: 'center' }}>
            Funil de Conversão — {config.metricLabel}
          </div>
          <SVGFunnel stages={funnelStages} />
        </div>
      )}
    </div>
  );
};

export default ReportCard;
