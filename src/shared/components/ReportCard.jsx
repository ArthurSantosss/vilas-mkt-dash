import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts';
import { formatCurrency, formatNumber, formatPercent } from '../utils/format';

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
      { label: 'Investimento', value: formatCurrency(d.spend), color: '#0FA5AE' },
      { label: 'Mensagens', value: formatNumber(d.leads), color: '#1B8EC2' },
      { label: 'Custo / Mensagem', value: formatCurrency(d.costPerLead), color: '#2196F3' },
      { label: 'Alcance', value: formatNumber(d.reach), color: '#42A5F5' },
      { label: 'Impressões', value: formatNumber(d.impressions), color: '#64B5F6' },
    ],
    buildFunnel: (d) => [
      { label: 'Impressões', value: d.impressions, widthPct: 100, color: '#0B6E75' },
      { label: 'Alcance', value: d.reach, widthPct: Math.max(40, Math.min(82, (d.reach / Math.max(d.impressions, 1)) * 100)), color: '#0FA5AE' },
      { label: 'Cliques', value: d.clicks, widthPct: Math.max(24, Math.min(50, (d.clicks / Math.max(d.reach, 1)) * 100 + 20)), color: '#1B8EC2' },
      { label: 'Mensagens', value: d.leads, widthPct: Math.max(14, Math.min(30, (d.leads / Math.max(d.clicks, 1)) * 100 + 10)), color: '#2196F3' },
    ],
  },
  clicks: {
    label: 'Cliques no link',
    metricLabel: 'Cliques',
    metricLabelSingular: 'clique',
    dailyKey: 'clicks',
    dailyTitle: 'Cliques por dia',
    buildKpis: (d) => [
      { label: 'Investimento', value: formatCurrency(d.spend), color: '#0FA5AE' },
      { label: 'Cliques', value: formatNumber(d.clicks), color: '#1B8EC2' },
      { label: 'Custo / Clique', value: formatCurrency(d.costPerClick), color: '#2196F3' },
      { label: 'CTR', value: formatPercent(d.ctr), color: '#42A5F5' },
      { label: 'Alcance', value: formatNumber(d.reach), color: '#64B5F6' },
    ],
    buildFunnel: (d) => [
      { label: 'Impressões', value: d.impressions, widthPct: 100, color: '#0B6E75' },
      { label: 'Alcance', value: d.reach, widthPct: Math.max(40, Math.min(82, (d.reach / Math.max(d.impressions, 1)) * 100)), color: '#0FA5AE' },
      { label: 'Cliques', value: d.clicks, widthPct: Math.max(20, Math.min(55, (d.clicks / Math.max(d.reach, 1)) * 100 + 15)), color: '#2196F3' },
    ],
  },
  engagements: {
    label: 'Engajamentos',
    metricLabel: 'Engajamentos',
    metricLabelSingular: 'engajamento',
    dailyKey: 'engagements',
    dailyTitle: 'Engajamentos por dia',
    buildKpis: (d) => [
      { label: 'Investimento', value: formatCurrency(d.spend), color: '#0FA5AE' },
      { label: 'Engajamentos', value: formatNumber(d.engagements), color: '#1B8EC2' },
      { label: 'Custo / Engajamento', value: formatCurrency(d.costPerEngagement), color: '#2196F3' },
      { label: 'Alcance', value: formatNumber(d.reach), color: '#42A5F5' },
      { label: 'Impressões', value: formatNumber(d.impressions), color: '#64B5F6' },
    ],
    buildFunnel: (d) => [
      { label: 'Impressões', value: d.impressions, widthPct: 100, color: '#0B6E75' },
      { label: 'Alcance', value: d.reach, widthPct: Math.max(40, Math.min(82, (d.reach / Math.max(d.impressions, 1)) * 100)), color: '#0FA5AE' },
      { label: 'Engajamentos', value: d.engagements, widthPct: Math.max(16, Math.min(46, (d.engagements / Math.max(d.reach, 1)) * 100 + 12)), color: '#42A5F5' },
    ],
  },
};

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
            <path d={`M ${tl + 2} ${y1 + 1} L ${tr - 2} ${y1 + 1}`} stroke={`url(#highLight${i})`} strokeWidth={1.5} fill="none" strokeLinecap="round" />
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

const ReportCard = function ReportCard({
  data,
  agencyLogoSrc,
  metaLogoSrc,
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

  return (
    <div
      ref={innerRef}
      style={{
        width,
        minHeight: 750,
        background: 'linear-gradient(180deg, #0d1520 0%, #111827 100%)',
        borderRadius: 16,
        padding: 28,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        color: '#fff',
      }}
    >
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
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
            {agencyLogoSrc ? (
              <img
                src={agencyLogoSrc}
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
          {metaLogoSrc && (
            <img src={metaLogoSrc} alt="Meta" width={38} height={38} style={{ width: 38, height: 38, objectFit: 'contain', display: 'block' }} />
          )}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#243044', borderRadius: 10, padding: '10px 18px', border: '1px solid #2a3a4d',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64B5F6" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          <span style={{ fontSize: 13, color: '#b0bec5', fontWeight: 500 }}>{d.period.start} — {d.period.end}</span>
        </div>
      </div>

      {showAccountName && (
        <div style={{
          fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 18,
          padding: '12px 20px', background: 'linear-gradient(135deg, #1a2a3d, #1e2d3d)',
          borderRadius: 12, border: '1px solid #2a3a4d',
        }}>
          📊 {d.accountName}
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, marginBottom: 22 }}>
        {kpis.map((kpi, idx) => (
          <ReportKPI key={idx} label={kpi.label} value={kpi.value} color={kpi.color} />
        ))}
      </div>

      {withBarChart ? (
        <div style={{ display: 'flex', gap: 16 }}>
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
              Funil — {config.metricLabel}
            </div>
            <SVGFunnel stages={funnelStages} />
          </div>

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
              <span style={{ fontSize: 12, color: '#b0bec5', fontWeight: 600 }}>{config.dailyTitle}</span>
            </div>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={dailyData} margin={{ top: 24, right: 10, left: -10, bottom: 5 }}>
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
                    formatter={(value) => [`${value} ${metricLabel}`, '']}
                  />
                  <Bar dataKey={config.dailyKey} fill="url(#barGlowVis)" radius={[8, 8, 0, 0]} barSize={dailyData.length > 20 ? 22 : 36} isAnimationActive={false} />
                  <Bar
                    dataKey={config.dailyKey}
                    fill="url(#barGradVis)"
                    radius={[8, 8, 0, 0]}
                    barSize={dailyData.length > 20 ? 18 : 32}
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
      ) : (
        <div style={{
          background: 'linear-gradient(135deg, #1a2a3d, #1e2d3d)',
          borderRadius: 14, border: '1px solid #2a3a4d', padding: '20px 20px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          <div style={{ fontSize: 11, color: '#8899aa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14, textAlign: 'center' }}>
            Funil de Conversão — {config.metricLabel}
          </div>
          <SVGFunnel stages={funnelStages} />
        </div>
      )}
    </div>
  );
};

export default ReportCard;
