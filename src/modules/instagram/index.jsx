import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Instagram, RefreshCw, Loader2, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus,
  Eye, Users, Heart, MessageCircle, Bookmark, Share2, UserPlus, UserMinus, MousePointerClick,
  ExternalLink, Film, Images, Image as ImageIcon, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { useAnalysisPeriod } from '../../contexts/AnalysisPeriodContext';
import { useAgency } from '../../contexts/AgencyContext';
import PeriodSelector from '../../shared/components/PeriodSelector';
import { resolvePeriodRange, formatPeriodLabel } from '../../shared/utils/dateUtils';
import { formatNumber, formatDateTime } from '../../shared/utils/format';
import { FILTER_FIELD, FILTER_LABEL, FILTER_CONTROL } from '../../shared/constants/filterStyles';
import { fetchInstagramAccounts, fetchInstagramOverview } from '../../services/instagramApi';
import {
  variation, engagementRate, postInteractions, postEngagementRate, postFormat,
  summarizeByFormat, sortPosts, POST_SORTS, FORMAT_LABELS, GENDER_LABELS, withShare,
  filterAccountsByAgency, NO_AGENCY,
} from '../../shared/utils/instagramMetrics';

const SELECTED_KEY = 'vilas_instagram_selected_account';
const AGENCY_KEY = 'vilas_instagram_selected_agency';
const ACCENT = '#18C8C8';
const GRID_COLOR = 'rgba(31, 35, 53, 0.6)';
const AXIS_TICK = { fill: '#7D8590', fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif' };
const POSTS_PREVIEW = 12;

const fmt = (value) => (typeof value === 'number' && Number.isFinite(value) ? formatNumber(Math.round(value)) : '—');
const fmtPct = (value) => (typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2).replace('.', ',')}%` : '—');
const fmtDayMonth = (ymd) => { const [, m, d] = ymd.split('-'); return `${d}/${m}`; };

function readStored(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

function writeStored(key, value) {
  try { localStorage.setItem(key, value); } catch { /* sem storage: só não lembra */ }
}

/* ───────────────────────── Peças ───────────────────────── */

function Delta({ current, previous, inverse = false }) {
  const pct = variation(current, previous);
  if (pct === null) {
    return <span className="text-[11px] text-text-secondary">sem comparação</span>;
  }
  const flat = Math.abs(pct) < 0.05;
  const good = inverse ? pct < 0 : pct > 0;
  const tone = flat ? 'text-text-secondary' : good ? 'text-success' : 'text-danger';
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${tone}`}>
      <Icon size={12} />
      {flat ? '0%' : `${pct > 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%`}
      <span className="font-normal text-text-secondary ml-1">vs. anterior</span>
    </span>
  );
}

function Kpi({ icon, label, value, current, previous, inverse, note, hint }) {
  const Icon = icon;
  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-4 flex flex-col gap-2 min-w-0" title={note || hint || undefined}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-text-secondary">
        <Icon size={14} className="text-primary-light shrink-0" />
        <span className="truncate">{label}</span>
        {note && <AlertTriangle size={12} className="text-warning shrink-0 ml-auto" />}
      </div>
      <span className="text-2xl font-bold text-text-primary tracking-tight">{value}</span>
      {previous !== undefined && <Delta current={current} previous={previous} inverse={inverse} />}
    </div>
  );
}

function Section({ title, subtitle, right, children }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Note({ children }) {
  if (!children) return null;
  return (
    <p className="mt-3 flex items-start gap-1.5 text-[11px] text-text-secondary">
      <Info size={12} className="shrink-0 mt-0.5" /> <span>{children}</span>
    </p>
  );
}

function ChartTooltip({ active, payload, label, metricLabel }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-[#0F1219]/95 px-3 py-2 shadow-lg">
      <p className="text-[10px] text-text-secondary mb-1">{label}</p>
      <p className="text-[13px] font-semibold text-text-primary">{metricLabel}: {fmt(payload[0].value)}</p>
    </div>
  );
}

function DailyChart({ data, metricLabel, kind }) {
  if (!data?.length) return <p className="text-text-secondary text-sm text-center py-12">Sem dados diários para o período.</p>;
  const rows = data.map(point => ({ ...point, label: fmtDayMonth(point.date) }));
  const axis = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
      <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={16} />
      <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={48} tickFormatter={value => formatNumber(value)} />
    </>
  );
  return (
    <ResponsiveContainer width="100%" height={220}>
      {kind === 'bar' ? (
        <BarChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          {axis}
          <Tooltip content={<ChartTooltip metricLabel={metricLabel} />} cursor={{ fill: 'rgba(24, 200, 200, 0.06)' }} />
          <Bar dataKey="value" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      ) : (
        <AreaChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="igReachGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          {axis}
          <Tooltip content={<ChartTooltip metricLabel={metricLabel} />} cursor={{ stroke: ACCENT, strokeWidth: 1, strokeDasharray: '4 4' }} />
          <Area type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2} fill="url(#igReachGradient)" activeDot={{ r: 5, fill: ACCENT, stroke: '#0F1219', strokeWidth: 2 }} />
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}

function ShareBars({ items, labelFor = label => label }) {
  if (!items?.length) return <p className="text-xs text-text-secondary">Sem dados.</p>;
  return (
    <ul className="space-y-2">
      {withShare(items).map(item => (
        <li key={item.label}>
          <div className="flex items-center justify-between gap-2 text-xs mb-1">
            <span className="text-text-primary truncate">{labelFor(item.label)}</span>
            <span className="text-text-secondary shrink-0">{fmtPct(item.share)} · {fmt(item.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-bg overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(item.share, 1)}%`, background: ACCENT }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const FORMAT_ICONS = { reels: Film, carousel: Images, image: ImageIcon, video: Film };

function Thumb({ src, format }) {
  const [failed, setFailed] = useState(false);
  const Icon = FORMAT_ICONS[format] || ImageIcon;
  if (!src || failed) {
    return <div className="absolute inset-0 flex items-center justify-center bg-bg text-text-secondary"><Icon size={22} /></div>;
  }
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />;
}

function PostCard({ post, rank }) {
  const format = postFormat(post);
  const rate = postEngagementRate(post);
  const stats = [
    ['Alcance', post.reach],
    ['Visualiz.', post.views],
    ['Curtidas', post.likes],
    ['Coment.', post.comments],
    ['Salvos', post.saves],
    ['Compart.', post.shares],
  ];
  return (
    <article className="rounded-xl border border-border/60 bg-bg/40 overflow-hidden flex flex-col">
      <a href={post.permalink || undefined} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden bg-bg">
        <Thumb src={post.thumbnail} format={format} />
        <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">{FORMAT_LABELS[format]}</span>
        {rank && <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">#{rank}</span>}
      </a>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-center justify-between gap-2 text-[11px] text-text-secondary">
          <span>{formatDateTime(post.timestamp)}</span>
          {post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" className="hover:text-primary-light" aria-label="Abrir no Instagram"><ExternalLink size={12} /></a>}
        </div>
        <p className="text-xs text-text-primary line-clamp-2 min-h-[2rem]">{post.caption || <span className="text-text-secondary">Sem legenda</span>}</p>
        <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 mt-auto">
          {stats.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <span className="block text-[9px] uppercase tracking-wider text-text-secondary truncate">{label}</span>
              <span className="block text-xs font-semibold text-text-primary">{fmt(value)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/15 px-2 py-1 text-[11px]">
          <span className="text-text-secondary">Engajamento</span>
          <span className="font-bold text-primary-light">{fmtPct(rate)}</span>
        </div>
        {format === 'reels' && post.avgWatchTimeMs != null && (
          <p className="text-[10px] text-text-secondary">Tempo médio assistido: {(post.avgWatchTimeMs / 1000).toFixed(1).replace('.', ',')}s</p>
        )}
      </div>
    </article>
  );
}

/* ───────────────────────── Página ───────────────────────── */

export default function InstagramOverview() {
  const { selectedPeriod, setSelectedPeriod } = useAnalysisPeriod();
  const { startDate, endDate } = resolvePeriodRange(selectedPeriod);
  const [selectedId, setSelectedId] = useState(() => readStored(SELECTED_KEY));
  const [selectedAgency, setSelectedAgency] = useState(() => readStored(AGENCY_KEY) || 'all');
  const { agencies, accountAgencies } = useAgency();
  const [postSort, setPostSort] = useState('recent');
  // Guarda para qual conta/período o "ver todos" foi aberto; trocar qualquer um volta à prévia.
  const [expandedPostsKey, setExpandedPostsKey] = useState(null);
  const forceRefresh = useRef(false);

  const accountsQuery = useQuery({
    queryKey: ['instagram-accounts'],
    queryFn: () => fetchInstagramAccounts(),
    staleTime: 10 * 60_000,
  });
  const allAccounts = useMemo(() => accountsQuery.data?.accounts || [], [accountsQuery.data]);
  // Agência lembrada que deixou de existir volta para "Todas".
  const activeAgency = selectedAgency === NO_AGENCY || agencies.includes(selectedAgency) ? selectedAgency : 'all';
  const accounts = useMemo(
    () => filterAccountsByAgency(allAccounts, accountAgencies, activeAgency),
    [allAccounts, accountAgencies, activeAgency],
  );
  const activeId = accounts.some(account => account.id === selectedId) ? selectedId : accounts[0]?.id || '';
  const activeAccount = accounts.find(account => account.id === activeId);

  const overviewQuery = useQuery({
    queryKey: ['instagram-overview', activeId, startDate, endDate],
    queryFn: () => {
      const refresh = forceRefresh.current;
      forceRefresh.current = false;
      return fetchInstagramOverview({ igId: activeId, start: startDate, end: endDate, refresh });
    },
    enabled: Boolean(activeId),
    retry: 1,
  });
  const data = overviewQuery.data;

  const selectAccount = (id) => {
    setSelectedId(id);
    writeStored(SELECTED_KEY, id);
  };

  const selectAgency = (agency) => {
    setSelectedAgency(agency);
    writeStored(AGENCY_KEY, agency);
  };

  const refresh = () => {
    forceRefresh.current = true;
    overviewQuery.refetch();
  };

  const posts = useMemo(() => sortPosts(data?.posts, postSort), [data?.posts, postSort]);
  const topIds = useMemo(() => new Map(sortPosts(data?.posts, 'engagement').slice(0, 3)
    .filter(post => postEngagementRate(post) !== null).map((post, index) => [post.id, index + 1])), [data?.posts]);
  const formats = useMemo(() => summarizeByFormat(data?.posts), [data?.posts]);
  const postsKey = `${activeId}|${startDate}|${endDate}`;
  const showAllPosts = expandedPostsKey === postsKey;
  const visiblePosts = showAllPosts ? posts : posts.slice(0, POSTS_PREVIEW);

  const m = data?.metrics || {};
  const rateCurrent = engagementRate(m.interactions?.current, m.reach?.current);
  const ratePrevious = engagementRate(m.interactions?.previous, m.reach?.previous);
  const postTotals = useMemo(() => (data?.posts || []).reduce((acc, post) => ({
    reach: acc.reach + (post.reach || 0),
    interactions: acc.interactions + (postInteractions(post) || 0),
  }), { reach: 0, interactions: 0 }), [data?.posts]);

  const notes = data ? [
    data.profileNote,
    ...Object.values(m).map(metric => metric?.note),
    data.followers?.note,
    data.series?.reachNote,
    data.postsNote,
    data.storiesNote,
    data.demographics?.note,
  ].filter(Boolean) : [];

  const header = (
    <div className="flex items-center gap-3 mb-1">
      <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]">
        <Instagram size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <h1 className="text-lg sm:text-2xl font-bold text-text-primary tracking-tight">Instagram — Orgânico</h1>
        <p className="text-xs text-text-secondary">Perfil, alcance, seguidores e posts dos clientes, direto da API do Instagram.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="relative z-10 rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-4 sm:p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-[#DD2A7B]/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>
        <div className="relative">{header}</div>

        <div className="relative mt-7 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3 sm:gap-4">
          {agencies.length > 0 && (
            <div className={`${FILTER_FIELD} sm:max-w-[220px]`}>
              <label className={FILTER_LABEL} htmlFor="ig-agency">Agência</label>
              <select
                id="ig-agency"
                value={activeAgency}
                onChange={event => selectAgency(event.target.value)}
                className={FILTER_CONTROL}
              >
                <option value="all">Todas as agências</option>
                {agencies.map(agency => <option key={agency} value={agency}>{agency}</option>)}
                <option value={NO_AGENCY}>Sem agência</option>
              </select>
            </div>
          )}
          <div className={`${FILTER_FIELD} sm:max-w-[320px]`}>
            <label className={FILTER_LABEL} htmlFor="ig-account">Conta</label>
            <select
              id="ig-account"
              value={activeId}
              onChange={event => selectAccount(event.target.value)}
              disabled={!accounts.length}
              className={FILTER_CONTROL}
            >
              {!accounts.length && <option value="">{accountsQuery.isLoading ? 'Carregando contas...' : 'Nenhuma conta encontrada'}</option>}
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name || account.username}{account.username ? ` · @${account.username}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className={`${FILTER_FIELD} z-50`}>
            <label className={FILTER_LABEL}>Período</label>
            <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} className="w-full" align="left" />
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={!activeId || overviewQuery.isFetching}
            className="h-[42px] inline-flex items-center justify-center gap-2 px-4 rounded-xl border border-border/50 bg-surface/60 text-sm font-medium text-text-secondary hover:text-primary-light hover:border-primary/30 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={15} className={overviewQuery.isFetching ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {/* ═══ ESTADOS ═══ */}
      {accountsQuery.isLoading && (
        <div className="flex items-center justify-center gap-2 h-48 text-text-secondary text-sm"><Loader2 size={16} className="animate-spin" /> Procurando contas do Instagram...</div>
      )}
      {accountsQuery.error && (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-5 text-sm text-danger">Erro ao listar as contas: {accountsQuery.error.message}</div>
      )}
      {accountsQuery.isSuccess && allAccounts.length > 0 && !accounts.length && (
        <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center text-sm text-text-secondary space-y-2">
          <Instagram size={28} className="mx-auto" />
          <p>{activeAgency === NO_AGENCY ? 'Todos os perfis já têm agência.' : `Nenhum perfil vinculado à agência .`}</p>
          <p className="text-xs">Vincule os perfis em Configurações → Instagram.</p>
        </div>
      )}
      {accountsQuery.isSuccess && !allAccounts.length && (
        <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center text-sm text-text-secondary space-y-2">
          <Instagram size={28} className="mx-auto" />
          <p>Nenhuma conta profissional do Instagram ligada às páginas que os tokens Meta enxergam.</p>
          <p className="text-xs">O token precisa das permissões <code>instagram_basic</code>, <code>instagram_manage_insights</code> e <code>pages_show_list</code>, e o Instagram precisa estar vinculado a uma Página do Facebook.</p>
          {accountsQuery.data?.warnings?.map(warning => <p key={warning} className="text-xs text-warning">{warning}</p>)}
        </div>
      )}

      {activeId && overviewQuery.isLoading && (
        <div className="flex items-center justify-center gap-2 h-64 text-text-secondary text-sm"><Loader2 size={16} className="animate-spin" /> Lendo {activeAccount?.username ? `@${activeAccount.username}` : 'a conta'}...</div>
      )}
      {activeId && overviewQuery.error && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger text-center">
          <span>{overviewQuery.error.message}</span>
          <button type="button" onClick={refresh} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-primary">
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      )}

      {data && (
        <>
          {/* ═══ PERFIL ═══ */}
          <div className="rounded-2xl border border-border/60 bg-surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              {data.profile.picture
                ? <img src={data.profile.picture} alt="" referrerPolicy="no-referrer" className="w-16 h-16 rounded-full object-cover border-2 border-[#DD2A7B]/60 shrink-0" />
                : <div className="w-16 h-16 rounded-full bg-bg flex items-center justify-center shrink-0"><Instagram size={24} className="text-text-secondary" /></div>}
              <div className="min-w-0">
                <p className="font-semibold text-text-primary truncate">{data.profile.name || activeAccount?.name}</p>
                {data.profile.username && (
                  <a href={`https://instagram.com/${data.profile.username}`} target="_blank" rel="noreferrer" className="text-xs text-primary-light hover:underline">@{data.profile.username}</a>
                )}
                {data.profile.biography && <p className="text-xs text-text-secondary mt-1 line-clamp-2 whitespace-pre-line">{data.profile.biography}</p>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:gap-6 text-center shrink-0">
              {[['Seguidores', data.profile.followers], ['Seguindo', data.profile.follows], ['Posts', data.profile.mediaCount]].map(([label, value]) => (
                <div key={label}>
                  <span className="block text-lg font-bold text-text-primary">{fmt(value)}</span>
                  <span className="block text-[10px] uppercase tracking-wider text-text-secondary">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-text-secondary -mt-3">
            {formatPeriodLabel(selectedPeriod)} comparado a {fmtDayMonth(data.previousRange.start)}–{fmtDayMonth(data.previousRange.end)} · atualizado {formatDateTime(data.fetchedAt)}
          </p>

          {/* ═══ KPIs ═══ */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            <Kpi icon={Users} label="Alcance" value={fmt(m.reach?.current)} current={m.reach?.current} previous={m.reach?.previous} note={m.reach?.note} hint="Contas únicas que viram algum conteúdo." />
            <Kpi icon={Eye} label="Visualizações" value={fmt(m.views?.current)} current={m.views?.current} previous={m.views?.previous} note={m.views?.note} />
            <Kpi icon={Heart} label="Interações" value={fmt(m.interactions?.current)} current={m.interactions?.current} previous={m.interactions?.previous} note={m.interactions?.note} hint="Curtidas, comentários, salvamentos, compartilhamentos e respostas." />
            <Kpi icon={Heart} label="Taxa de engajamento" value={fmtPct(rateCurrent)} current={rateCurrent} previous={ratePrevious} hint="Interações ÷ alcance." />
            <Kpi icon={Users} label="Contas engajadas" value={fmt(m.accountsEngaged?.current)} current={m.accountsEngaged?.current} previous={m.accountsEngaged?.previous} note={m.accountsEngaged?.note} />
            <Kpi icon={UserPlus} label="Novos seguidores" value={fmt(data.followers.follows.current)} current={data.followers.follows.current} previous={data.followers.follows.previous} note={data.followers.note} />
            <Kpi icon={UserMinus} label="Deixaram de seguir" value={fmt(data.followers.unfollows.current)} current={data.followers.unfollows.current} previous={data.followers.unfollows.previous} inverse note={data.followers.note} />
            <Kpi
              icon={Users}
              label="Saldo de seguidores"
              value={typeof data.followers.net.current === 'number' ? `${data.followers.net.current > 0 ? '+' : ''}${fmt(data.followers.net.current)}` : '—'}
              current={data.followers.net.current}
              previous={data.followers.net.previous}
              note={data.followers.note}
            />
            <Kpi icon={Eye} label="Visitas ao perfil" value={fmt(m.profileViews?.current)} current={m.profileViews?.current} previous={m.profileViews?.previous} note={m.profileViews?.note} />
            <Kpi icon={MousePointerClick} label="Toques nos links" value={fmt(m.linkTaps?.current)} current={m.linkTaps?.current} previous={m.linkTaps?.previous} note={m.linkTaps?.note} hint="Link da bio, e-mail, telefone, endereço." />
            <Kpi icon={MessageCircle} label="Comentários" value={fmt(m.comments?.current)} current={m.comments?.current} previous={m.comments?.previous} note={m.comments?.note} />
            <Kpi icon={Bookmark} label="Salvamentos" value={fmt(m.saves?.current)} current={m.saves?.current} previous={m.saves?.previous} note={m.saves?.note} />
            <Kpi icon={Share2} label="Compartilhamentos" value={fmt(m.shares?.current)} current={m.shares?.current} previous={m.shares?.previous} note={m.shares?.note} />
            <Kpi icon={Heart} label="Curtidas" value={fmt(m.likes?.current)} current={m.likes?.current} previous={m.likes?.previous} note={m.likes?.note} />
            <Kpi icon={MessageCircle} label="Respostas aos stories" value={fmt(m.replies?.current)} current={m.replies?.current} previous={m.replies?.previous} note={m.replies?.note} />
            <Kpi icon={Images} label="Posts no período" value={fmt(data.posts.length)} hint={`Alcance somado dos posts: ${fmt(postTotals.reach)}`} />
          </div>
          {data.uniqueApproximate && (
            <Note>Período acima de 30 dias: a API entrega alcance e contas engajadas em blocos de 30 dias, então o total é a soma dos blocos (a mesma pessoa pode contar mais de uma vez).</Note>
          )}

          {/* ═══ GRÁFICOS ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Alcance por dia" subtitle="Contas únicas alcançadas em cada dia">
              <DailyChart data={data.series.reach} metricLabel="Alcance" kind="area" />
              <Note>{data.series.reachNote}</Note>
            </Section>
            <Section title="Novos seguidores por dia" subtitle="Seguidores ganhos em cada dia">
              <DailyChart data={data.series.followers} metricLabel="Novos seguidores" kind="bar" />
              <Note>{data.series.followersNote}</Note>
            </Section>
          </div>

          {/* ═══ FORMATOS ═══ */}
          {formats.length > 0 && (
            <Section title="Desempenho por formato" subtitle="Médias dos posts publicados no período, do formato mais engajador para o menos">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-text-secondary border-b border-border/60">
                      <th className="text-left font-medium py-2 px-1">Formato</th>
                      <th className="text-right font-medium py-2 px-1">Posts</th>
                      <th className="text-right font-medium py-2 px-1">Alcance médio</th>
                      <th className="text-right font-medium py-2 px-1">Interações médias</th>
                      <th className="text-right font-medium py-2 px-1">Engajamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formats.map(row => (
                      <tr key={row.format} className="border-b border-border/30 last:border-0">
                        <td className="py-2 px-1 text-text-primary">{row.label}</td>
                        <td className="py-2 px-1 text-right text-text-secondary">{row.count}</td>
                        <td className="py-2 px-1 text-right text-text-primary">{fmt(row.avgReach)}</td>
                        <td className="py-2 px-1 text-right text-text-primary">{fmt(row.avgInteractions)}</td>
                        <td className="py-2 px-1 text-right font-semibold text-primary-light">{fmtPct(row.engagementRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ═══ POSTS ═══ */}
          <Section
            title={`Posts do período (${data.posts.length})`}
            subtitle="Engajamento = (curtidas + comentários + salvos + compartilhamentos) ÷ alcance. #1–#3 marcam os mais engajadores."
            right={data.posts.length > 1 && (
              <select value={postSort} onChange={event => setPostSort(event.target.value)} className="h-9 rounded-lg border border-border/50 bg-bg px-3 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/40" aria-label="Ordenar posts">
                {Object.entries(POST_SORTS).map(([key, sorter]) => <option key={key} value={key}>{sorter.label}</option>)}
              </select>
            )}
          >
            {data.posts.length === 0 ? (
              <p className="text-sm text-text-secondary text-center py-8">Nenhum post publicado no período.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {visiblePosts.map(post => <PostCard key={post.id} post={post} rank={topIds.get(post.id)} />)}
                </div>
                {posts.length > POSTS_PREVIEW && (
                  <button type="button" onClick={() => setExpandedPostsKey(showAllPosts ? null : postsKey)} className="mt-4 mx-auto flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-primary-light">
                    {showAllPosts ? <><ChevronUp size={14} /> Mostrar menos</> : <><ChevronDown size={14} /> Ver todos os {posts.length} posts</>}
                  </button>
                )}
              </>
            )}
            <Note>{data.postsNote}</Note>
          </Section>

          {/* ═══ PÚBLICO + STORIES ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Section title="Gênero dos seguidores">
              <ShareBars items={data.demographics.gender} labelFor={label => GENDER_LABELS[label] || label} />
            </Section>
            <Section title="Faixa etária dos seguidores">
              <ShareBars items={data.demographics.age} labelFor={label => `${label} anos`} />
            </Section>
            <Section title="Principais cidades">
              <ShareBars items={data.demographics.city} />
            </Section>
          </div>
          <Note>{data.demographics.note}</Note>

          <Section title={`Stories ativos (${data.stories.length})`} subtitle="Stories publicados nas últimas 24 horas; a API não guarda stories expirados.">
            {data.stories.length === 0 ? (
              <p className="text-sm text-text-secondary text-center py-6">Nenhum story ativo agora.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {data.stories.map(story => (
                  <a key={story.id} href={story.permalink || undefined} target="_blank" rel="noreferrer" className="shrink-0 w-32 rounded-xl border border-border/60 bg-bg/40 overflow-hidden">
                    <div className="relative aspect-[9/16] overflow-hidden bg-bg"><Thumb src={story.thumbnail} format={story.mediaType === 'VIDEO' ? 'video' : 'image'} /></div>
                    <div className="p-2 text-[10px] text-text-secondary space-y-0.5">
                      <p>Alcance <span className="text-text-primary font-semibold">{fmt(story.reach)}</span></p>
                      <p>Respostas <span className="text-text-primary font-semibold">{fmt(story.replies)}</span></p>
                    </div>
                  </a>
                ))}
              </div>
            )}
            <Note>{data.storiesNote}</Note>
          </Section>

          {notes.length > 0 && (
            <details className="rounded-2xl border border-warning/20 bg-warning/5 p-4 text-xs text-text-secondary">
              <summary className="cursor-pointer text-warning font-medium flex items-center gap-1.5">
                <AlertTriangle size={13} /> {notes.length} métrica{notes.length > 1 ? 's' : ''} que o Instagram não liberou
              </summary>
              <ul className="mt-2 space-y-1 list-disc pl-5">
                {[...new Set(notes)].map(note => <li key={note}>{note}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
