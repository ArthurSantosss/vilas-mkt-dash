import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar, CartesianGrid, ComposedChart, Area, AreaChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ExternalLink, Instagram, Loader2, Trophy } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../shared/utils/format';
import { fetchInstagramOverview } from '../../services/instagramApi';
import { engagementRate, postInteractions } from '../../shared/utils/instagramMetrics';

const CARD = 'bg-surface/40 rounded-2xl border border-border/50 p-5 shadow-lg shadow-black/10';
const GRID_COLOR = 'rgba(31, 35, 53, 0.6)';
const AXIS_TICK = { fill: '#7D8590', fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif' };
const AXIS_STROKE = '#1F2335';
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(19, 22, 31, 0.95)', border: '1px solid rgba(31, 35, 53, 0.8)', borderRadius: '12px',
  padding: '10px 14px', fontSize: '12px', color: '#E6EDF3', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};
const percent = value => `${Number(value || 0).toFixed(2).replace('.', ',')}%`;
const dayLabel = date => String(date).slice(5, 10).split('-').reverse().join('/');

function SectionTitle({ children, right }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
    <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2.5">
      <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-primary-light to-primary inline-block" />
      {children}
    </h3>
    {right}
  </div>;
}

/* ───────────── Faixa de métricas de entrega ───────────── */

/** Métricas secundárias da conta ou campanha selecionada; as que não existirem somem. */
export function MetricStrip({ platform, metrics }) {
  const m = metrics || {};
  const clicks = m.linkClicks ?? m.clicks;
  const items = platform === 'meta'
    ? [
      ['Impressões', m.impressions, formatNumber],
      ['Alcance', m.reach, formatNumber],
      ['Frequência', m.frequency, v => Number(v).toFixed(2).replace('.', ',')],
      ['Cliques no link', clicks, formatNumber],
      ['CTR', m.ctr, percent],
      ['CPC', m.cpc, formatCurrency],
      ['CPM', m.cpm, formatCurrency],
    ]
    : [
      ['Impressões', m.impressions, formatNumber],
      ['Cliques', clicks, formatNumber],
      ['CTR', m.ctr, percent],
      ['CPC', m.cpc, formatCurrency],
      ['CPM', m.cpm, formatCurrency],
      ['Valor de conversões', m.conversionsValue, formatCurrency],
    ];
  const visible = items.filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0);
  if (!visible.length) return null;
  return <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
    {visible.map(([label, value, format]) => <div key={label} className="rounded-xl border border-border/40 bg-surface/40 px-4 py-3">
      <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{label}</span>
      <p className="text-lg font-bold text-text-primary mt-0.5">{format(Number(value))}</p>
    </div>)}
  </div>;
}

/* ───────────── Gráfico diário com seletor de métrica ───────────── */

function dailyOptions(platform) {
  const result = platform === 'meta' ? 'Conversas' : 'Conversões';
  return [
    { id: 'result', label: result, value: d => d.messages || d.conversions || 0, format: formatNumber },
    { id: 'spend', label: 'Investimento', value: d => d.spend || 0, format: formatCurrency },
    { id: 'cost', label: `Custo por ${platform === 'meta' ? 'conversa' : 'conversão'}`, format: formatCurrency,
      value: d => { const r = d.messages || d.conversions || 0; return r > 0 ? (d.spend || 0) / r : null; } },
    platform === 'meta'
      ? { id: 'impressions', label: 'Impressões', value: d => d.impressions || 0, format: formatNumber }
      : { id: 'clicks', label: 'Cliques', value: d => d.clicks || 0, format: formatNumber },
  ];
}

export function DailyChart({ platform, dailyMetrics }) {
  const options = useMemo(() => dailyOptions(platform), [platform]);
  const [metricId, setMetricId] = useState('result');
  const option = options.find(item => item.id === metricId) || options[0];
  const data = useMemo(() => (dailyMetrics || []).map(day => ({
    label: dayLabel(day.date), value: option.value(day),
  })), [dailyMetrics, option]);
  const valid = data.filter(item => item.value !== null);
  const best = valid.length ? valid.reduce((a, b) => (option.id === 'cost' ? b.value < a.value : b.value > a.value) ? b : a) : null;
  const average = valid.length ? valid.reduce((sum, item) => sum + item.value, 0) / valid.length : 0;

  return <div className={`${CARD} p-6`}>
    <SectionTitle right={<div className="flex flex-wrap gap-1.5" role="group" aria-label="Métrica do gráfico">
      {options.map(item => <button key={item.id} type="button" aria-pressed={item.id === option.id} onClick={() => setMetricId(item.id)}
        className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${item.id === option.id
          ? 'border-primary/60 bg-primary/20 text-primary-light' : 'border-border/50 text-text-secondary hover:text-text-primary'}`}>
        {item.label}
      </button>)}
    </div>}>{option.label} por dia</SectionTitle>
    {data.length ? <>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="dailyMetricGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#18C8C8" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#18C8C8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="label" stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} width={56}
            tickFormatter={v => option.format === formatCurrency ? `R$${formatNumber(Math.round(v))}` : formatNumber(v)} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v === null ? '—' : option.format(v), option.label]} />
          <Area type="monotone" dataKey="value" stroke="#18C8C8" strokeWidth={2.5} fill="url(#dailyMetricGradient)" connectNulls
            dot={{ r: 3, fill: '#13161F', stroke: '#18C8C8', strokeWidth: 2 }} activeDot={{ r: 5, fill: '#18C8C8' }} />
        </AreaChart>
      </ResponsiveContainer>
      {best && <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-secondary">
        <span>Média diária: <strong className="text-text-primary">{option.format(average)}</strong></span>
        <span>{option.id === 'cost' ? 'Dia mais eficiente' : 'Melhor dia'}: <strong className="text-text-primary">{best.label} · {option.format(best.value)}</strong></span>
      </div>}
    </> : <p className="text-text-secondary text-sm text-center py-12">Sem dados diários disponíveis.</p>}
  </div>;
}

/* ───────────── Ranking de campanhas ───────────── */

/** Campanhas com entrega, ordenadas por investimento; clique seleciona a campanha. */
export function CampaignRanking({ platform, campaigns, onSelect }) {
  const metric = (c, key) => Number((c.metrics && c.metrics[key] !== undefined ? c.metrics[key] : c[key]) || 0);
  const rows = useMemo(() => {
    const list = campaigns.map(c => {
      const spend = metric(c, 'spend');
      const result = platform === 'meta' ? metric(c, 'messages') : metric(c, 'conversions');
      return { id: c.id, name: c.name, status: c.status, spend, result, cost: result > 0 ? spend / result : null, ctr: metric(c, 'ctr') };
    }).sort((a, b) => b.spend - a.spend);
    const total = list.reduce((sum, row) => sum + row.spend, 0);
    return list.map(row => ({ ...row, share: total > 0 ? row.spend / total * 100 : 0 }));
  }, [campaigns, platform]);
  const costs = rows.map(row => row.cost).filter(cost => cost !== null);
  const bestCost = costs.length > 1 ? Math.min(...costs) : null;
  const resultLabel = platform === 'meta' ? 'Conversas' : 'Conversões';

  if (rows.length < 2) return null;
  return <div className={CARD}>
    <SectionTitle right={<span className="text-[11px] text-text-secondary">Clique numa campanha para detalhar</span>}>Campanhas no período</SectionTitle>
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-text-secondary">
            <th className="px-2 pb-2 font-semibold">Campanha</th>
            <th className="px-2 pb-2 font-semibold text-right">Investimento</th>
            <th className="px-2 pb-2 font-semibold w-[22%]">Participação</th>
            <th className="px-2 pb-2 font-semibold text-right">{resultLabel}</th>
            <th className="px-2 pb-2 font-semibold text-right">Custo / resultado</th>
            <th className="px-2 pb-2 font-semibold text-right">CTR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => <tr key={row.id} onClick={() => onSelect(row.id)}
            className="cursor-pointer border-t border-border/40 hover:bg-surface/60 transition-colors">
            <td className="px-2 py-2.5 text-text-primary max-w-[260px]">
              <span className="flex items-center gap-2">
                <span className="truncate">{row.name}</span>
                {row.cost !== null && row.cost === bestCost && <span title="Menor custo por resultado" className="inline-flex shrink-0 items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success"><Trophy size={10} /> Mais eficiente</span>}
              </span>
            </td>
            <td className="px-2 py-2.5 text-right text-text-primary tabular-nums">{formatCurrency(row.spend)}</td>
            <td className="px-2 py-2.5">
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-border/40 overflow-hidden"><div className="h-full rounded-full bg-primary-light" style={{ width: `${row.share}%` }} /></div>
                <span className="w-10 text-right text-[11px] text-text-secondary tabular-nums">{row.share.toFixed(0)}%</span>
              </div>
            </td>
            <td className="px-2 py-2.5 text-right text-text-primary tabular-nums">{formatNumber(row.result)}</td>
            <td className="px-2 py-2.5 text-right text-text-primary tabular-nums">{row.cost === null ? '—' : formatCurrency(row.cost)}</td>
            <td className="px-2 py-2.5 text-right text-text-secondary tabular-nums">{percent(row.ctr)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

/* ───────────── Instagram vinculado ───────────── */

function IgStat({ label, value, hint }) {
  return <div className="rounded-xl border border-border/40 bg-surface/60 p-3.5">
    <span className="text-[10px] text-text-secondary block font-medium uppercase tracking-wider mb-1">{label}</span>
    <span className="text-xl font-bold text-text-primary">{value}</span>
    {hint && <span className="block text-[10px] text-text-secondary mt-1">{hint}</span>}
  </div>;
}

/**
 * Perfil do Instagram ligado à conta (Configurações) cruzado com o investimento em anúncios:
 * seguidores ganhos, custo por seguidor e a curva diária de seguidores x resultado dos anúncios.
 */
export function InstagramPanel({ igId, range, spend, dailyMetrics, platform }) {
  const query = useQuery({
    queryKey: ['instagram-overview', igId, range.start, range.end],
    queryFn: () => fetchInstagramOverview({ igId, start: range.start, end: range.end }),
    enabled: Boolean(igId),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const data = query.data;
  const gained = data?.followers?.follows?.current ?? (data?.followers?.net?.current > 0 ? data.followers.net.current : null);
  const metrics = data?.metrics || {};
  const resultKey = platform === 'meta' ? 'messages' : 'conversions';

  const combined = useMemo(() => {
    const ads = new Map((dailyMetrics || []).map(day => [String(day.date).slice(0, 10), day[resultKey] || 0]));
    const followers = new Map((data?.series?.followers || []).map(point => [point.date, point.value]));
    const dates = [...new Set([...ads.keys(), ...followers.keys()])].sort();
    return dates.map(date => ({ label: dayLabel(date), seguidores: followers.get(date) ?? null, anuncios: ads.get(date) ?? 0 }));
  }, [dailyMetrics, data, resultKey]);

  const topPosts = useMemo(() => [...(data?.posts || [])]
    .filter(post => post.reach > 0)
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 3), [data]);

  if (!igId) {
    return <div className={`${CARD} flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left`}>
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] flex items-center justify-center shrink-0"><Instagram size={20} className="text-white" /></div>
      <p className="text-sm text-text-secondary">Vincule o Instagram desta conta em <strong className="text-text-primary">Configurações</strong> para ver seguidores, visitas ao perfil e posts ao lado dos anúncios.</p>
    </div>;
  }

  return <div className={CARD}>
    <SectionTitle right={data?.profile?.username && <span className="text-xs text-text-secondary">@{data.profile.username}</span>}>
      <Instagram size={15} className="text-[#DD2A7B]" /> Instagram
    </SectionTitle>

    {query.isLoading ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-text-secondary"><Loader2 size={16} className="animate-spin" /> Carregando Instagram...</p>
      : query.isError ? <p className="py-6 text-sm text-warning">Não foi possível ler o Instagram: {query.error.message}</p>
        : <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <IgStat label="Seguidores" value={data.profile.followers != null ? formatNumber(data.profile.followers) : '—'} />
            <IgStat label="Novos seguidores" value={gained != null ? `+${formatNumber(gained)}` : '—'} hint="no período" />
            <IgStat label="Custo por seguidor" value={gained > 0 && spend > 0 ? formatCurrency(spend / gained) : '—'} hint="investimento ÷ novos seguidores" />
            <IgStat label="Visitas ao perfil" value={metrics.profileViews?.current != null ? formatNumber(metrics.profileViews.current) : '—'} />
            <IgStat label="Taxa de engajamento" value={(() => { const rate = engagementRate(metrics.interactions?.current, metrics.reach?.current); return rate == null ? '—' : percent(rate); })()} hint="interações ÷ alcance do perfil" />
          </div>

          {combined.some(day => day.seguidores != null) && <div>
            <p className="text-xs text-text-secondary mb-2">Novos seguidores por dia × {platform === 'meta' ? 'conversas' : 'conversões'} dos anúncios</p>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={combined} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="label" stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis yAxisId="ig" stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis yAxisId="ads" orientation="right" stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar yAxisId="ig" dataKey="seguidores" name="Novos seguidores" fill="#DD2A7B" fillOpacity={0.75} radius={[4, 4, 0, 0]} barSize={14} />
                <Line yAxisId="ads" type="monotone" dataKey="anuncios" name={platform === 'meta' ? 'Conversas' : 'Conversões'} stroke="#18C8C8" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            {data.series.followersNote && <p className="text-[11px] text-text-secondary mt-1">{data.series.followersNote}</p>}
          </div>}

          {topPosts.length > 0 && <div>
            <p className="text-xs text-text-secondary mb-2">Posts com maior alcance no período</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {topPosts.map(post => <a key={post.id} href={post.permalink || undefined} target="_blank" rel="noreferrer"
                className="group flex gap-3 rounded-xl border border-border/40 bg-surface/60 p-3 hover:border-primary/30 transition-colors">
                {post.thumbnail ? <img src={post.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />
                  : <div className="h-16 w-16 shrink-0 rounded-lg bg-border/30" />}
                <div className="min-w-0 text-xs">
                  <p className="line-clamp-2 text-text-primary">{post.caption || 'Sem legenda'}</p>
                  <p className="mt-1 text-text-secondary">{formatNumber(post.reach)} alcance · {formatNumber(postInteractions(post) || 0)} interações</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary-light opacity-0 group-hover:opacity-100">Abrir <ExternalLink size={10} /></span>
                </div>
              </a>)}
            </div>
          </div>}
        </div>}
  </div>;
}
