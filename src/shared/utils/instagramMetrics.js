// Cálculos da aba Instagram. Taxas são recalculadas dos totais, nunca médias de médias.

const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Variação percentual contra o período anterior; null quando não há base de comparação. */
export function variation(current, previous) {
  const cur = toNumber(current);
  const prev = toNumber(previous);
  if (cur === null || prev === null) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** Interações ÷ alcance, em %. */
export function engagementRate(interactions, reach) {
  const i = toNumber(interactions);
  const r = toNumber(reach);
  if (i === null || r === null || r <= 0) return null;
  return (i / r) * 100;
}

export function postInteractions(post) {
  const parts = [post?.likes, post?.comments, post?.saves, post?.shares].map(toNumber);
  if (parts.every(part => part === null)) return null;
  return parts.reduce((sum, part) => sum + (part || 0), 0);
}

export function postEngagementRate(post) {
  return engagementRate(postInteractions(post), post?.reach);
}

export const FORMAT_LABELS = {
  reels: 'Reels',
  carousel: 'Carrossel',
  image: 'Imagem',
  video: 'Vídeo',
};

export function postFormat(post) {
  if (post?.productType === 'REELS') return 'reels';
  if (post?.mediaType === 'CAROUSEL_ALBUM') return 'carousel';
  if (post?.mediaType === 'VIDEO') return 'video';
  return 'image';
}

/** Desempenho médio por formato, do mais eficiente (engajamento) para o menos. */
export function summarizeByFormat(posts) {
  const groups = new Map();
  for (const post of posts || []) {
    const format = postFormat(post);
    const group = groups.get(format) || { format, label: FORMAT_LABELS[format], count: 0, reach: 0, reachCount: 0, interactions: 0, interactionsOnReach: 0 };
    group.count += 1;
    const reach = toNumber(post.reach);
    const interactions = postInteractions(post);
    if (reach !== null) {
      group.reach += reach;
      group.reachCount += 1;
      if (interactions !== null) group.interactionsOnReach += interactions;
    }
    if (interactions !== null) group.interactions += interactions;
    groups.set(format, group);
  }
  return [...groups.values()]
    .map(group => ({
      format: group.format,
      label: group.label,
      count: group.count,
      avgReach: group.reachCount ? group.reach / group.reachCount : null,
      avgInteractions: group.count ? group.interactions / group.count : null,
      engagementRate: engagementRate(group.interactionsOnReach, group.reach),
    }))
    .sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1) || b.count - a.count);
}

export const POST_SORTS = {
  recent: { label: 'Mais recentes', value: post => new Date(post.timestamp).getTime() },
  reach: { label: 'Maior alcance', value: post => toNumber(post.reach) ?? -1 },
  engagement: { label: 'Maior engajamento', value: post => postEngagementRate(post) ?? -1 },
  interactions: { label: 'Mais interações', value: post => postInteractions(post) ?? -1 },
};

export function sortPosts(posts, key = 'recent') {
  const sorter = POST_SORTS[key] || POST_SORTS.recent;
  return [...(posts || [])].sort((a, b) => sorter.value(b) - sorter.value(a));
}

export const GENDER_LABELS = { F: 'Mulheres', M: 'Homens', U: 'Não informado' };

/** Cada item com sua parcela (%) do total do grupo. */
export function withShare(items) {
  const total = (items || []).reduce((sum, item) => sum + (toNumber(item.value) || 0), 0);
  return (items || []).map(item => ({ ...item, share: total > 0 ? ((toNumber(item.value) || 0) / total) * 100 : 0 }));
}

/* ───────────────────────── Agências ───────────────────────── */

export const NO_AGENCY = '__none__';

/** Chave da conta do Instagram no mapa de agências (prefixo evita colisão com IDs de anúncio). */
export const instagramAgencyKey = (igId) => `ig_${igId}`;

/** `agency`: 'all', NO_AGENCY ou o nome da agência. */
export function filterAccountsByAgency(accounts, accountAgencies, agency) {
  if (!agency || agency === 'all') return accounts || [];
  return (accounts || []).filter(account => {
    const assigned = accountAgencies?.[instagramAgencyKey(account.id)] || '';
    return agency === NO_AGENCY ? !assigned : assigned === agency;
  });
}
