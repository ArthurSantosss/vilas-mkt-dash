// Cálculos do Relatório de Tráfego Pago. Regras:
// - derivadas (CTR, CPC, CPM, custo por resultado) sempre a partir dos totais;
// - comparação contra o período anterior de mesmo tamanho;
// - taxas variam em pontos percentuais; contagens e custos, em %.

export const TZ = 'America/Sao_Paulo';

/* ───────────── Datas (strings AAAA-MM-DD, sem fuso) ───────────── */

export function addDays(ymd, days) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start, end) {
  return Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86_400_000);
}

export function previousRange({ start, end }) {
  const length = daysBetween(start, end) + 1;
  const prevEnd = addDays(start, -1);
  return { start: addDays(prevEnd, -(length - 1)), end: prevEnd };
}

export function todayIn(timeZone = TZ, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function monthStart(ymd) {
  return `${ymd.slice(0, 7)}-01`;
}

export const PRESETS = [
  { id: 'today', label: 'Hoje' },
  { id: 'last7', label: 'Últimos 7 dias' },
  { id: 'last30', label: 'Últimos 30 dias' },
  { id: 'lastMonth', label: 'Mês passado' },
  { id: 'thisMonth', label: 'Este mês' },
];

export function presetRange(id, today) {
  switch (id) {
    case 'today': return { start: today, end: today };
    case 'last7': return { start: addDays(today, -7), end: addDays(today, -1) };
    case 'last30': return { start: addDays(today, -30), end: addDays(today, -1) };
    case 'lastMonth': {
      const end = addDays(monthStart(today), -1);
      return { start: monthStart(end), end };
    }
    case 'thisMonth': return { start: monthStart(today), end: today };
    default: return null;
  }
}

export function matchPreset(range, today) {
  return PRESETS.find(p => {
    const r = presetRange(p.id, today);
    return r && r.start === range.start && r.end === range.end;
  })?.id || null;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const fmtDayMonth = (ymd) => `${ymd.slice(8, 10)}/${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
export const fmtDDMM = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
export const fmtDDMMYY = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(2, 4)}`;

export function fmtUpdatedAt(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  const ymd = todayIn(TZ, date);
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(date);
  return `${fmtDayMonth(ymd)}, ${time}`;
}

/* ───────────────────────── Números ───────────────────────── */

export const DASH = '—';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtMoney = (v) => (isNum(v) ? moneyFmt.format(v).replace(/\u00a0/g, ' ') : DASH);
export const fmtInt = (v) => (isNum(v) ? intFmt.format(Math.round(v)) : DASH);
/** Conversões do Google podem ser fracionadas (atribuição baseada em dados). */
export const fmtCount = (v) => (isNum(v) ? (Number.isInteger(v) ? intFmt.format(v) : decFmt.format(v)) : DASH);
/** Recebe fração (0.081) e devolve "8,1%". */
export const fmtRate = (v) => (isNum(v) ? `${pctFmt.format(v * 100)}%` : DASH);
const freqFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtFrequency = (v) => (isNum(v) ? freqFmt.format(v) : DASH);
export const fmtSeconds = (ms) => (isNum(ms) ? `${decFmt.format(ms / 1000)} s` : DASH);

export function truncateText(text, size = 70) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Post sem legenda';
  return clean.length > size ? `${clean.slice(0, size - 1)}…` : clean;
}

export function audienceColor(index) {
  return index === 0 ? '#13D3B9' : index === 1 ? '#6A44FF' : '#5A607F';
}

export const ratio = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? a / b : null);

/* ──────────────────────── Agregação ──────────────────────── */

export function emptyTotals() {
  return { spend: 0, impressions: 0, clicks: 0, conversions: {} };
}

export function addInto(target, source) {
  target.spend += source.spend || 0;
  target.impressions += source.impressions || 0;
  target.clicks += source.clicks || 0;
  for (const [key, value] of Object.entries(source.conversions || {})) {
    target.conversions[key] = (target.conversions[key] || 0) + value;
  }
  return target;
}

export function sumTotals(list) {
  return list.reduce((acc, item) => addInto(acc, item), emptyTotals());
}

/** Campanha Meta: soma dos anúncios (gasto, impressões, cliques e eventos se somam). */
export function metaCampaignTotals(campaign) {
  return sumTotals(campaign.ads || []);
}

export function derive(totals) {
  if (!totals) return null;
  return {
    ...totals,
    ctr: ratio(totals.clicks, totals.impressions),
    cpc: ratio(totals.spend, totals.clicks),
    cpm: totals.impressions ? (totals.spend / totals.impressions) * 1000 : null,
  };
}

export function conversionCount(totals, eventKey) {
  if (!totals || !eventKey) return null;
  return totals.conversions?.[eventKey] || 0;
}

/* ─────────────────────── Comparação ─────────────────────── */

// Direção boa: 1 = subir é bom, -1 = cair é bom, 0 = neutro.
export const DIRECTION = {
  spend: 0,
  impressions: 1,
  clicks: 1,
  ctr: 1,
  cpc: -1,
  cpm: -1,
  conversions: 1,
  costPer: -1,
  followers: 1,
  costPerFollower: -1,
  impressionShare: 1,
  budgetLost: -1,
  rankLost: -1,
  topRate: 1,
  absTopRate: 1,
  reach: 1,
  views: 1,
  interactions: 1,
  saves: 1,
  shares: 1,
  engagementRate: 1,
  interactionsPerView: 1,
  passRate: 1,
  frequency: 0,
  landingPageViews: 1,
  profileViews: 1,
  bioLinkClicks: 1,
  conversations: 1,
  costPerConversation: -1,
};

/**
 * kind: 'pct' (variação relativa) ou 'pp' (pontos percentuais, para taxas em fração).
 * Devolve { state, value } com state em up | down | equal | new | none.
 */
export function compare(current, previous, kind = 'pct') {
  if (!isNum(current)) return { state: 'none', value: null };
  if (!isNum(previous)) return { state: 'none', value: null };
  if (kind === 'pp') {
    const value = (current - previous) * 100;
    if (Math.abs(value) < 0.05) return { state: 'equal', value: 0 };
    return { state: value > 0 ? 'up' : 'down', value };
  }
  if (previous === 0) return current > 0 ? { state: 'new', value: null } : { state: 'none', value: null };
  const value = ((current - previous) / previous) * 100;
  if (Math.abs(value) < 0.05) return { state: 'equal', value: 0 };
  return { state: value > 0 ? 'up' : 'down', value };
}

export function toneFor(metric, comparison) {
  const direction = DIRECTION[metric] ?? 0;
  if (!comparison || direction === 0) return 'neutral';
  if (comparison.state === 'up') return direction > 0 ? 'good' : 'bad';
  if (comparison.state === 'down') return direction < 0 ? 'good' : 'bad';
  return 'neutral';
}

export function deltaText(comparison, kind = 'pct') {
  if (!comparison) return 'sem comparação';
  switch (comparison.state) {
    case 'new': return 'novo';
    case 'none': return 'sem comparação';
    case 'equal': return kind === 'pp' ? '0,0 p.p.' : '0,0%';
    default: {
      const arrow = comparison.state === 'up' ? '▲' : '▼';
      return `${arrow} ${pctFmt.format(Math.abs(comparison.value))}${kind === 'pp' ? ' p.p.' : '%'}`;
    }
  }
}

/* ───────────────────────── Modelo ───────────────────────── */

/** Separa campanhas Meta em anúncios x posts turbinados e devolve totais por canal. */
export function channelTotals(snapshot) {
  const metaAds = sumTotals((snapshot.meta || []).filter(c => !c.boosted).map(metaCampaignTotals));
  const metaBoosted = sumTotals((snapshot.meta || []).filter(c => c.boosted).map(metaCampaignTotals));
  const meta = addInto(addInto(emptyTotals(), metaAds), metaBoosted);
  const google = sumTotals(snapshot.google || []);
  const all = addInto(addInto(emptyTotals(), meta), google);
  return { all, meta, metaAds, metaBoosted, google };
}

/**
 * Funil: cada etapa conta o evento configurado em cada plataforma, separado.
 * channel: 'all' | 'meta' | 'google'. metaOk/googleOk = a plataforma respondeu.
 */
export function funnelSteps(steps, totals, channel, { metaOk = true, googleOk = true } = {}) {
  const platforms = channel === 'all' ? ['meta', 'google'] : [channel];
  return (steps || []).filter(step => step.label && (step.meta || step.google)).map(step => {
    const byPlatform = {};
    let total = 0;
    let hasValue = false;
    for (const platform of platforms) {
      const eventKey = step[platform];
      if (!eventKey) continue;
      const ok = platform === 'meta' ? metaOk : googleOk;
      const value = ok ? conversionCount(totals[platform], eventKey) : null;
      byPlatform[platform] = { event: eventKey, label: step[`${platform}Label`] || eventKey, value };
      if (value !== null) { total += value; hasValue = true; }
    }
    return { label: step.label, byPlatform, total: hasValue ? total : null };
  });
}

export function spendFor(totals, channel) {
  if (channel === 'meta') return totals.meta.spend;
  if (channel === 'google') return totals.google.spend;
  return totals.all.spend;
}

/** Modelo usado por todas as abas, a partir da resposta de /api/traffic-report. */
/** Só as campanhas ligadas ao funil (público) informado, das duas plataformas. */
export function snapshotForAudience(snapshot, audienceId) {
  const keys = new Set(snapshot.google.filter(c => c.audience === audienceId).map(c => c.key));
  return {
    meta: snapshot.meta.filter(c => c.audience === audienceId),
    google: snapshot.google.filter(c => keys.has(c.key)),
    auction: snapshot.auction.filter(row => keys.has(row.key)),
  };
}

/**
 * Recorte por funil: cada público usa só as próprias campanhas (gasto e conversões não se
 * misturam). Sem públicos configurados (funil único "geral"), vale a conta inteira.
 */
function buildAudienceViews(audiences, cur, prev) {
  if (!audiences.length) {
    return { geral: { cur, prev, totals: channelTotals(cur), prevTotals: channelTotals(prev) } };
  }
  return Object.fromEntries(audiences.map(audience => {
    const audCur = snapshotForAudience(cur, audience.id);
    const audPrev = snapshotForAudience(prev, audience.id);
    return [audience.id, { cur: audCur, prev: audPrev, totals: channelTotals(audCur), prevTotals: channelTotals(audPrev) }];
  }));
}

/** Campanhas com gasto no período que não estão em nenhum funil. */
function unassignedCampaigns(audiences, cur) {
  if (!audiences.length) return { count: 0, spend: 0 };
  const ids = new Set(audiences.map(a => a.id));
  const list = [
    ...cur.meta.filter(c => !c.boosted && !ids.has(c.audience)).map(metaCampaignTotals),
    ...cur.google.filter(c => !ids.has(c.audience)),
  ].filter(t => t.spend > 0);
  return { count: list.length, spend: list.reduce((sum, t) => sum + t.spend, 0) };
}

export const PLATFORMS = [
  { id: 'all', label: 'Todas' },
  { id: 'meta', label: 'Meta' },
  { id: 'google', label: 'Google' },
];

export const readPlatform = (value) => (PLATFORMS.some(p => p.id === value) ? value : 'all');

/** Período que inclui hoje: as plataformas ainda estão consolidando os números. */
export const rangeTouchesToday = (range, today) => range.end >= today;

/**
 * platform: 'all' | 'meta' | 'google'. Com uma plataforma escolhida, a outra sai do
 * modelo inteiro (totais, árvore de campanhas, funis e abas).
 */
export function buildTrafficModel(core, ig = null, igLoading = false, platform = 'all') {
  const availableMeta = core.meta?.accounts || [];
  const availableGoogle = core.google?.accounts || [];
  const wanted = readPlatform(platform);
  // Plataforma sem conta no relatório não tem o que mostrar: volta para todas.
  const selected = (wanted === 'meta' && !availableMeta.length) || (wanted === 'google' && !availableGoogle.length) ? 'all' : wanted;
  const metaAccounts = selected === 'google' ? [] : availableMeta;
  const googleAccounts = selected === 'meta' ? [] : availableGoogle;
  const hasMeta = metaAccounts.length > 0;
  const hasGoogle = googleAccounts.length > 0;
  const metaOk = hasMeta && metaAccounts.every(a => a.ok);
  const googleOk = hasGoogle && googleAccounts.every(a => a.ok);
  const pick = (list, has) => (has ? list || [] : []);
  const cur = { meta: pick(core.meta?.current, hasMeta), google: pick(core.google?.current?.campaigns, hasGoogle), auction: pick(core.google?.current?.auction, hasGoogle) };
  const prev = { meta: pick(core.meta?.previous, hasMeta), google: pick(core.google?.previous?.campaigns, hasGoogle), auction: pick(core.google?.previous?.auction, hasGoogle) };
  return {
    platform: selected,
    canFilterPlatform: availableMeta.length > 0 && availableGoogle.length > 0,
    platformAccounts: { meta: availableMeta.length > 0, google: availableGoogle.length > 0 },
    hasMeta, hasGoogle, metaOk, googleOk,
    allOk: (!hasMeta || metaOk) && (!hasGoogle || googleOk) && (hasMeta || hasGoogle),
    hasInstagram: Boolean(core.hasInstagram) && selected !== 'google',
    audiences: core.audiences || [],
    funnels: core.funnels || {},
    byAudience: buildAudienceViews(core.audiences || [], cur, prev),
    metaReach: hasMeta ? core.meta?.reach || { current: {}, previous: {} } : null,
    unassigned: unassignedCampaigns(core.audiences || [], cur),
    cur, prev,
    totals: channelTotals(cur),
    prevTotals: channelTotals(prev),
    ig, igLoading,
    failures: [
      ...metaAccounts.filter(a => !a.ok).map(a => `Meta (${a.id}): ${a.error}`),
      ...googleAccounts.filter(a => !a.ok).map(a => `Google Ads (${a.id}): ${a.error}`),
    ],
  };
}
