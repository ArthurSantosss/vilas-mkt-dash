// Dados orgânicos do Instagram para a aba Instagram do painel. Usa os mesmos tokens
// Meta já cadastrados (BMs, perfil salvo, env), que precisam de instagram_basic e
// instagram_manage_insights. Cada métrica é lida sozinha: a recusa de uma (conta com
// menos de 100 seguidores, métrica retirada da API) não derruba as outras.

import { metaGet, metaGetAll, listTokenCandidates } from './_meta-graph.js';
import {
  addDays, daysBetween, unix, settle,
  resolveInstagramToken, fetchFollowerGains, fetchAccountMetric, fetchPosts,
} from './_traffic-report-data.js';

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const optionalNum = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const IG_ACCOUNT_FIELDS = 'id,username,name,followers_count,follows_count,media_count,profile_picture_url';
const IG_PROFILE_FIELDS = 'username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url';

/* ───────────────────────── Lista de contas ───────────────────────── */

/** Todas as contas do Instagram ligadas às páginas que algum token Meta enxerga. */
export async function listInstagramAccounts() {
  const candidates = await listTokenCandidates();
  if (!candidates.length) throw new Error('Nenhum token Meta configurado no servidor.');

  const warnings = [];
  const pagesByToken = await Promise.all(candidates.map(async (token) => {
    try {
      return await metaGetAll('/me/accounts', { fields: `name,instagram_business_account{${IG_ACCOUNT_FIELDS}}`, limit: 100 }, token, 5);
    } catch (error) {
      warnings.push(error.message);
      return [];
    }
  }));

  const seen = new Map();
  for (const pages of pagesByToken) {
    for (const page of pages) {
      const ig = page.instagram_business_account;
      if (!ig?.id || seen.has(String(ig.id))) continue;
      seen.set(String(ig.id), {
        id: String(ig.id),
        username: ig.username || null,
        name: ig.name || page.name || null,
        pageName: page.name || null,
        followers: optionalNum(ig.followers_count),
        follows: optionalNum(ig.follows_count),
        mediaCount: optionalNum(ig.media_count),
        picture: ig.profile_picture_url || null,
      });
    }
  }

  const accounts = [...seen.values()].sort((a, b) => String(a.name || a.username).localeCompare(String(b.name || b.username), 'pt-BR'));
  // Aviso só interessa quando nenhum token conseguiu listar nada.
  return { accounts, warnings: accounts.length ? [] : [...new Set(warnings)] };
}

/* ───────────────────────── Métricas da conta ───────────────────────── */

/** `unique`: pessoas únicas; acima de 30 dias a API só entrega em blocos, então a soma é aproximada. */
export const ACCOUNT_METRICS = [
  { key: 'reach', metric: 'reach', label: 'alcance', unique: true },
  { key: 'views', metric: 'views', label: 'visualizações' },
  { key: 'accountsEngaged', metric: 'accounts_engaged', label: 'contas engajadas', unique: true },
  { key: 'interactions', metric: 'total_interactions', label: 'interações' },
  { key: 'likes', metric: 'likes', label: 'curtidas' },
  { key: 'comments', metric: 'comments', label: 'comentários' },
  { key: 'saves', metric: 'saves', label: 'salvamentos' },
  { key: 'shares', metric: 'shares', label: 'compartilhamentos' },
  { key: 'replies', metric: 'replies', label: 'respostas aos stories' },
  { key: 'profileViews', metric: 'profile_views', label: 'visitas ao perfil' },
  { key: 'linkTaps', metric: 'profile_links_taps', label: 'toques nos links do perfil' },
];

async function fetchAccountMetrics(igUserId, ranges, token) {
  const out = {};
  await Promise.all(ACCOUNT_METRICS.map(async ({ key, metric, label }) => {
    const [current, previous] = await Promise.all([
      settle(fetchAccountMetric(igUserId, metric, ranges.current, token)),
      settle(fetchAccountMetric(igUserId, metric, ranges.previous, token)),
    ]);
    out[key] = {
      current: current.value,
      previous: previous.value,
      note: current.error ? `O Instagram não liberou ${label} pela API: ${current.error}` : null,
    };
  }));
  return out;
}

/** Novos seguidores e quem deixou de seguir (follows_and_unfollows por follow_type). */
export function parseFollowBreakdown(item) {
  const results = item?.total_value?.breakdowns?.[0]?.results || [];
  let follows = 0;
  let unfollows = 0;
  for (const result of results) {
    const type = String(result.dimension_values?.[0] || '').toUpperCase();
    if (type === 'FOLLOWER') follows += num(result.value);
    else if (type === 'NON_FOLLOWER') unfollows += num(result.value);
  }
  return { follows, unfollows };
}

async function fetchFollowsUnfollows(igUserId, range, token) {
  const totals = { follows: 0, unfollows: 0 };
  let start = range.start;
  while (start <= range.end) {
    const chunkEnd = addDays(start, 29) < range.end ? addDays(start, 29) : range.end;
    const data = await metaGet(`/${igUserId}/insights`, {
      metric: 'follows_and_unfollows',
      metric_type: 'total_value',
      breakdown: 'follow_type',
      period: 'day',
      since: unix(start),
      until: unix(chunkEnd, true),
    }, token);
    const item = (data.data || []).find(entry => entry.name === 'follows_and_unfollows');
    if (!item) throw new Error('o Instagram não devolveu follows_and_unfollows');
    const parsed = parseFollowBreakdown(item);
    totals.follows += parsed.follows;
    totals.unfollows += parsed.unfollows;
    start = addDays(chunkEnd, 1);
  }
  return totals;
}

/**
 * Entradas e saídas de seguidores. Se a API recusar follows_and_unfollows (contas com
 * menos de 100 seguidores), cai para o saldo diário de follower_count (só últimos 30 dias).
 */
async function fetchFollowerMovement(igUserId, ranges, token, today) {
  const [current, previous] = await Promise.all([
    settle(fetchFollowsUnfollows(igUserId, ranges.current, token)),
    settle(fetchFollowsUnfollows(igUserId, ranges.previous, token)),
  ]);
  if (!current.error) {
    return {
      follows: { current: current.value.follows, previous: previous.value?.follows ?? null },
      unfollows: { current: current.value.unfollows, previous: previous.value?.unfollows ?? null },
      net: {
        current: current.value.follows - current.value.unfollows,
        previous: previous.value ? previous.value.follows - previous.value.unfollows : null,
      },
      note: null,
    };
  }

  const [gainCurrent, gainPrevious] = await Promise.all([
    settle(fetchFollowerGains(igUserId, ranges.current, token, today)),
    settle(fetchFollowerGains(igUserId, ranges.previous, token, today)),
  ]);
  return {
    follows: { current: null, previous: null },
    unfollows: { current: null, previous: null },
    net: { current: gainCurrent.value?.value ?? null, previous: gainPrevious.value?.value ?? null },
    note: `Entradas e saídas separadas indisponíveis (${current.error}). ${gainCurrent.value?.note || gainCurrent.error || 'Saldo calculado pelos novos seguidores por dia.'}`,
  };
}

/* ───────────────────────── Séries diárias ───────────────────────── */

/** end_time do Instagram marca o fim do dia; o valor pertence ao dia anterior. */
export function valuesToDailySeries(values) {
  return (values || [])
    .filter(item => typeof item?.end_time === 'string')
    .map(item => ({ date: addDays(item.end_time.slice(0, 10), -1), value: num(item.value) }));
}

async function fetchDailyMetric(igUserId, metric, range, token) {
  const points = [];
  let start = range.start;
  while (start <= range.end) {
    const chunkEnd = addDays(start, 29) < range.end ? addDays(start, 29) : range.end;
    const data = await metaGet(`/${igUserId}/insights`, {
      metric,
      period: 'day',
      since: unix(start),
      until: unix(addDays(chunkEnd, 1)),
    }, token);
    points.push(...valuesToDailySeries(data.data?.[0]?.values));
    start = addDays(chunkEnd, 1);
  }
  const byDate = new Map(points.filter(p => p.date >= range.start && p.date <= range.end).map(p => [p.date, p.value]));
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

async function fetchSeries(igUserId, range, token, today) {
  const oldestFollowers = addDays(today, -30);
  const yesterday = addDays(today, -1);
  const followerRange = {
    start: range.start < oldestFollowers ? oldestFollowers : range.start,
    end: range.end > yesterday ? yesterday : range.end,
  };
  const [reach, followers] = await Promise.all([
    settle(fetchDailyMetric(igUserId, 'reach', range, token)),
    followerRange.start <= followerRange.end
      ? settle(fetchDailyMetric(igUserId, 'follower_count', followerRange, token))
      : Promise.resolve({ value: [], error: null }),
  ]);
  const followerNotes = [];
  if (followers.error) followerNotes.push(`O Instagram recusou seguidores por dia: ${followers.error}`);
  else if (range.start < oldestFollowers) followerNotes.push('A API só libera seguidores por dia dos últimos 30 dias.');
  if (!followers.error && range.end >= today) followerNotes.push('Os seguidores de hoje entram amanhã.');
  return {
    reach: reach.value || [],
    reachNote: reach.error ? `O Instagram recusou o alcance por dia: ${reach.error}` : null,
    followers: followers.value || [],
    followersNote: followerNotes.join(' ') || null,
  };
}

/* ───────────────────────── Público ───────────────────────── */

async function fetchDemographic(igUserId, breakdown, token) {
  const params = { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown };
  let data;
  try {
    data = await metaGet(`/${igUserId}/insights`, params, token);
  } catch (error) {
    if (!/timeframe/i.test(String(error.message || ''))) throw error;
    data = await metaGet(`/${igUserId}/insights`, { ...params, timeframe: 'this_month' }, token);
  }
  const results = data.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
  return results
    .map(result => ({ label: String(result.dimension_values?.[0] ?? ''), value: num(result.value) }))
    .filter(item => item.label && item.value > 0)
    .sort((a, b) => b.value - a.value);
}

async function fetchDemographics(igUserId, token) {
  const [age, gender, city] = await Promise.all(['age', 'gender', 'city'].map(b => settle(fetchDemographic(igUserId, b, token))));
  const error = age.error || gender.error || city.error;
  return {
    age: (age.value || []).sort((a, b) => a.label.localeCompare(b.label)),
    gender: gender.value || [],
    city: (city.value || []).slice(0, 8),
    note: error ? `O Instagram não liberou parte do público (exige 100+ seguidores): ${error}` : null,
  };
}

/* ───────────────────────── Stories ativos ───────────────────────── */

const STORY_METRICS = ['reach', 'views', 'replies', 'shares', 'total_interactions', 'navigation'];

/** Lê as métricas aceitas para a mídia, descartando as que a API recusar. */
async function readMediaMetrics(mediaId, metrics, token) {
  let pending = [...metrics];
  for (let attempt = 0; attempt < metrics.length && pending.length; attempt += 1) {
    try {
      const data = await metaGet(`/${mediaId}/insights`, { metric: pending.join(',') }, token);
      return Object.fromEntries((data.data || []).map(item => [item.name, optionalNum(item.values?.[0]?.value ?? item.total_value?.value)]));
    } catch (error) {
      const rejected = pending.find(metric => String(error.message || '').includes(metric));
      if (!rejected) return {};
      pending = pending.filter(metric => metric !== rejected);
    }
  }
  return {};
}

async function fetchStories(igUserId, token) {
  const data = await metaGet(`/${igUserId}/stories`, { fields: 'id,media_type,permalink,timestamp,media_url,thumbnail_url' }, token);
  const items = data.data || [];
  const insights = await Promise.all(items.map(item => readMediaMetrics(item.id, STORY_METRICS, token)));
  return items.map((item, index) => ({
    id: item.id,
    permalink: item.permalink || null,
    timestamp: item.timestamp,
    mediaType: item.media_type || null,
    thumbnail: item.thumbnail_url || (item.media_type === 'VIDEO' ? null : item.media_url) || null,
    reach: insights[index].reach ?? null,
    views: insights[index].views ?? null,
    replies: insights[index].replies ?? null,
    shares: insights[index].shares ?? null,
    interactions: insights[index].total_interactions ?? null,
    navigation: insights[index].navigation ?? null,
  }));
}

/* ───────────────────────── Visão completa ───────────────────────── */

export async function collectInstagramOverview(igUserId, ranges, today) {
  const { token } = await resolveInstagramToken(igUserId, []);
  const [profile, metrics, followers, series, posts, stories, demographics] = await Promise.all([
    settle(metaGet(`/${igUserId}`, { fields: IG_PROFILE_FIELDS }, token)),
    fetchAccountMetrics(igUserId, ranges, token),
    fetchFollowerMovement(igUserId, ranges, token, today),
    fetchSeries(igUserId, ranges.current, token, today),
    settle(fetchPosts(igUserId, ranges.current, token)),
    settle(fetchStories(igUserId, token)),
    fetchDemographics(igUserId, token),
  ]);
  const p = profile.value || {};
  return {
    profile: {
      id: igUserId,
      username: p.username || null,
      name: p.name || null,
      biography: p.biography || null,
      website: p.website || null,
      followers: optionalNum(p.followers_count),
      follows: optionalNum(p.follows_count),
      mediaCount: optionalNum(p.media_count),
      picture: p.profile_picture_url || null,
    },
    profileNote: profile.error ? `O Instagram recusou a leitura do perfil: ${profile.error}` : null,
    metrics,
    uniqueApproximate: daysBetween(ranges.current.start, ranges.current.end) + 1 > 30,
    followers,
    series,
    posts: posts.value || [],
    postsNote: posts.error ? `O Instagram recusou a leitura dos posts: ${posts.error}` : null,
    stories: stories.value || [],
    storiesNote: stories.error ? `O Instagram recusou a leitura dos stories: ${stories.error}` : null,
    demographics,
  };
}
