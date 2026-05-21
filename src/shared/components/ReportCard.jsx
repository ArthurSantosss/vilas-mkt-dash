import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
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

const OBJECTIVES = {
  messages: {
    label: 'Mensagens',
    metricLabel: 'Mensagens',
    metricLabelSingular: 'mensagem',
    dailyKey: 'leads',
    dailyTitle: 'Mensagens por dia',
    buildKpis: (d) => [
      { label: 'Investimento', value: formatCurrency(d.spend), color: '#00F2FE' },
      { label: 'Mensagens', value: formatNumber(d.leads), color: '#38BDF8' },
      { label: 'Custo / Mensagem', value: formatCurrency(d.costPerLead), color: '#0EA5E9' },
      { label: 'Alcance', value: formatNumber(d.reach), color: '#60A5FA' },
      { label: 'Impressões', value: formatNumber(d.impressions), color: '#818CF8' },
    ],
    buildFunnel: (d) => [
      { label: 'Impressões', value: d.impressions, widthPct: 100, color: '#075985' },
      { label: 'Alcance', value: d.reach, widthPct: Math.max(40, Math.min(82, (d.reach / Math.max(d.impressions, 1)) * 100)), color: '#0284C7' },
      { label: 'Cliques', value: d.clicks, widthPct: Math.max(24, Math.min(50, (d.clicks / Math.max(d.reach, 1)) * 100 + 20)), color: '#0EA5E9' },
      { label: 'Mensagens', value: d.leads, widthPct: Math.max(14, Math.min(30, (d.leads / Math.max(d.clicks, 1)) * 100 + 10)), color: '#38BDF8' },
    ],
  },
  clicks: {
    label: 'Cliques no link',
    metricLabel: 'Cliques',
    metricLabelSingular: 'clique',
    dailyKey: 'clicks',
    dailyTitle: 'Cliques por dia',
    buildKpis: (d) => [
      { label: 'Investimento', value: formatCurrency(d.spend), color: '#00F2FE' },
      { label: 'Cliques', value: formatNumber(d.clicks), color: '#38BDF8' },
      { label: 'Custo / Clique', value: formatCurrency(d.costPerClick), color: '#0EA5E9' },
      { label: 'CTR', value: formatPercent(d.ctr), color: '#60A5FA' },
      { label: 'Alcance', value: formatNumber(d.reach), color: '#818CF8' },
    ],
    buildFunnel: (d) => [
      { label: 'Impressões', value: d.impressions, widthPct: 100, color: '#075985' },
      { label: 'Alcance', value: d.reach, widthPct: Math.max(40, Math.min(82, (d.reach / Math.max(d.impressions, 1)) * 100)), color: '#0284C7' },
      { label: 'Cliques', value: d.clicks, widthPct: Math.max(20, Math.min(55, (d.clicks / Math.max(d.reach, 1)) * 100 + 15)), color: '#38BDF8' },
    ],
  },
  engagements: {
    label: 'Engajamentos',
    metricLabel: 'Engajamentos',
    metricLabelSingular: 'engajamento',
    dailyKey: 'engagements',
    dailyTitle: 'Engajamentos por dia',
    buildKpis: (d) => [
      { label: 'Investimento', value: formatCurrency(d.spend), color: '#00F2FE' },
      { label: 'Engajamentos', value: formatNumber(d.engagements), color: '#38BDF8' },
      { label: 'Custo / Engajamento', value: formatCurrency(d.costPerEngagement), color: '#0EA5E9' },
      { label: 'Alcance', value: formatNumber(d.reach), color: '#60A5FA' },
      { label: 'Impressões', value: formatNumber(d.impressions), color: '#818CF8' },
    ],
    buildFunnel: (d) => [
      { label: 'Impressões', value: d.impressions, widthPct: 100, color: '#075985' },
      { label: 'Alcance', value: d.reach, widthPct: Math.max(40, Math.min(82, (d.reach / Math.max(d.impressions, 1)) * 100)), color: '#0284C7' },
      { label: 'Engajamentos', value: d.engagements, widthPct: Math.max(16, Math.min(46, (d.engagements / Math.max(d.reach, 1)) * 100 + 12)), color: '#38BDF8' },
    ],
  },
};

function ReportKPI({ label, value, color = '#38BDF8' }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f1626, #141d30)',
      borderRadius: 14,
      border: '1px solid rgba(255, 255, 255, 0.05)',
      padding: '18px 20px',
      flex: 1,
      minWidth: 0,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, ${color}50)` }} />
      <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 6, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', fontFamily: 'Outfit, Inter, system-ui, sans-serif', lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

function SVGFunnel({ stages }) {
  const height = 310;
  const width = 240;
  const cx = width / 2;
  const stageCount = stages.length;
  const gap = 8;

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
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.95" />
        </filter>
        {stages.map((s, i) => (
          <linearGradient key={i} id={`funnelGrad${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.9} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.4} />
          </linearGradient>
        ))}
        {stages.map((s, i) => (
          <linearGradient key={`highLight${i}`} id={`highLight${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.0} />
            <stop offset="50%" stopColor="#fff" stopOpacity={0.2} />
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
            <path d={pathData} fill={`url(#funnelGrad${i})`} stroke={s.color} strokeWidth={1} strokeOpacity={0.3} />
            <path d={`M ${tl + 2} ${y1 + 1} L ${tr - 2} ${y1 + 1}`} stroke={`url(#highLight${i})`} strokeWidth={1.2} fill="none" strokeLinecap="round" />
            <text x={cx} y={midY - 8} textAnchor="middle" fill="#F1F5F9" fontSize={10} fontWeight={700} letterSpacing="0.1em" filter="url(#text-shadow)">
              {s.label.toUpperCase()}
            </text>
            <text x={cx} y={midY + 16} textAnchor="middle" fill="#ffffff" fontSize={22} fontWeight={800} fontFamily="Outfit, Inter, system-ui, sans-serif" filter="url(#text-shadow)">
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
  const kpis = config.buildKpis(d);
  const funnelStages = config.buildFunnel(d);
  const dailyData = withBarChart
    ? d[`daily${config.dailyKey.charAt(0).toUpperCase() + config.dailyKey.slice(1)}`] || []
    : [];
  const metricLabel = config.metricLabel.toLowerCase();

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
        background: 'linear-gradient(180deg, #050b14 0%, #09101f 100%)',
        borderRadius: 20,
        padding: 32,
        fontFamily: 'Outfit, Inter, system-ui, -apple-system, sans-serif',
        color: '#fff',
        border: '1px solid rgba(255, 255, 255, 0.03)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        boxSizing: 'border-box',
      }}
    >
      {/* HEADER */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #0d1627, #121d34)',
        borderRadius: 16,
        padding: '20px 32px',
        marginBottom: 24,
        border: '1px solid rgba(255, 255, 255, 0.05)',
        boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.3)',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
            <AgencyLogo src={agencyLogoSrc} label={agencyLabel} />
          </div>
          <div style={{ height: 28, width: 1, background: 'rgba(255, 255, 255, 0.08)', flexShrink: 0 }} />
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
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, padding: '10px 18px', border: '1px solid rgba(255, 255, 255, 0.05)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          <span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{d.period.start} — {d.period.end}</span>
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
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        {kpis.map((kpi, idx) => (
          <ReportKPI key={idx} label={kpi.label} value={kpi.value} color={kpi.color} />
        ))}
      </div>

      {/* GRAPH AND FUNNEL */}
      {withBarChart ? (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* Funnel Card */}
          <div style={{
            width: 290,
            background: 'linear-gradient(135deg, #0d1627, #121d34)',
            borderRadius: 16,
            border: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '24px 24px',
            flexShrink: 0,
            boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.3)',
            boxSizing: 'border-box',
          }}>
            <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20, textAlign: 'center' }}>
              Funil — {config.metricLabel}
            </div>
            <SVGFunnel stages={funnelStages} />
          </div>

          {/* Daily Bar Chart Card */}
          <div style={{
            flex: 1,
            background: 'linear-gradient(135deg, #0d1627, #121d34)',
            borderRadius: 16,
            border: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '24px 24px',
            minWidth: 0,
            boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.3)',
            boxSizing: 'border-box',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: 'linear-gradient(135deg, #00F2FE, #38BDF8)' }} />
              <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 700, tracking: '0.02em' }}>{config.dailyTitle}</span>
            </div>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={dailyData} margin={{ top: 24, right: 10, left: -22, bottom: 5 }}>
                  <defs>
                    <linearGradient id="barGradVis" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00F2FE" stopOpacity={1} />
                      <stop offset="50%" stopColor="#38BDF8" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.03)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(56, 189, 248, 0.05)', radius: 6 }}
                    contentStyle={{
                      background: 'linear-gradient(135deg, #0b1220, #0f1a2e)',
                      border: '1px solid rgba(56, 189, 248, 0.15)',
                      borderRadius: 12,
                      fontSize: 12,
                      boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                      backdropFilter: 'blur(8px)',
                    }}
                    labelStyle={{ color: '#94A3B8', fontWeight: 700, marginBottom: 4 }}
                    itemStyle={{ color: '#00F2FE', fontWeight: 800 }}
                    formatter={(value) => [`${value} ${metricLabel}`, '']}
                  />
                  {/* Single bar ensures perfect alignment with XAxis dataKey labels (legends) */}
                  <Bar
                    dataKey={config.dailyKey}
                    fill="url(#barGradVis)"
                    radius={[6, 6, 0, 0]}
                    barSize={dailyData.length > 20 ? 16 : 28}
                    label={{ position: 'top', fill: '#94A3B8', fontSize: 10, fontWeight: 700, offset: 6 }}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyStyle: 'center', height: 290, color: '#64748B', fontSize: 12 }}>
                Sem dados diários disponíveis
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{
          background: 'linear-gradient(135deg, #0d1627, #121d34)',
          borderRadius: 16, border: '1px solid rgba(255, 255, 255, 0.05)', padding: '24px 24px',
          boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.3)',
        }}>
          <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20, textAlign: 'center' }}>
            Funil de Conversão — {config.metricLabel}
          </div>
          <SVGFunnel stages={funnelStages} />
        </div>
      )}
    </div>
  );
};

export default ReportCard;
