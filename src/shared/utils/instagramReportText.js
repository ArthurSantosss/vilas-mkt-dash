import { formatNumber } from './format.js';
import { variation, engagementRate, postInteractions, postEngagementRate, summarizeByFormat, FORMAT_LABELS, postFormat } from './instagramMetrics.js';

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const fmtInt = (value) => (isNum(value) ? formatNumber(Math.round(value)) : '—');
const fmtPct = (value) => (isNum(value) ? `${value.toFixed(2).replace('.', ',')}%` : '—');
const fmtDayMonth = (ymd) => {
  const [, m, d] = String(ymd || '').split('-');
  return d && m ? `${d}/${m}` : '??/??';
};

function buildAgencySignature(name) {
  const cleaned = String(name || '').trim().replace(/[^\p{L}\p{N}]+/gu, '');
  return cleaned ? ` #${cleaned.toUpperCase()}` : '';
}

/** " (+12,5% vs. período anterior)" — vazio quando não há base de comparação. */
function deltaSuffix(current, previous) {
  const pct = variation(current, previous);
  if (pct === null) return '';
  if (Math.abs(pct) < 0.05) return ' (estável)';
  return ` (${pct > 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%)`;
}

function metricLine(label, current, previous, formatter = fmtInt) {
  if (!isNum(current)) return null;
  return `➡️ ${label}: ${formatter(current)}${deltaSuffix(current, previous)}`;
}

function signed(value) {
  if (!isNum(value)) return '—';
  return `${value > 0 ? '+' : ''}${fmtInt(value)}`;
}

function shortCaption(caption, max = 60) {
  const clean = String(caption || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'sem legenda';
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Leituras automáticas a partir das variações do período. */
function buildHighlights({ metrics, followers, rateCurrent, ratePrevious, bestFormat, topPost }) {
  const lines = [];
  const reachVar = variation(metrics.reach?.current, metrics.reach?.previous);
  if (reachVar !== null && Math.abs(reachVar) >= 5) {
    lines.push(reachVar > 0
      ? `O alcance cresceu ${reachVar.toFixed(1).replace('.', ',')}% em relação ao período anterior.`
      : `O alcance recuou ${Math.abs(reachVar).toFixed(1).replace('.', ',')}% em relação ao período anterior.`);
  }
  if (isNum(rateCurrent)) {
    const rateVar = variation(rateCurrent, ratePrevious);
    const trend = rateVar === null || Math.abs(rateVar) < 5 ? '' : rateVar > 0 ? ', acima do período anterior' : ', abaixo do período anterior';
    lines.push(`A taxa de engajamento ficou em ${fmtPct(rateCurrent)}${trend}.`);
  }
  if (isNum(followers?.net?.current)) {
    lines.push(followers.net.current >= 0
      ? `O perfil teve saldo positivo de ${fmtInt(followers.net.current)} seguidores no período.`
      : `O perfil teve saldo negativo de ${fmtInt(Math.abs(followers.net.current))} seguidores no período.`);
  }
  if (bestFormat && isNum(bestFormat.engagementRate)) {
    lines.push(`${bestFormat.label} foi o formato mais engajador (${fmtPct(bestFormat.engagementRate)} de engajamento médio).`);
  }
  if (topPost) {
    lines.push(`Destaque do período: ${FORMAT_LABELS[postFormat(topPost)].toLowerCase()} "${shortCaption(topPost.caption)}", com ${fmtInt(topPost.reach)} de alcance e ${fmtInt(postInteractions(topPost))} interações.`);
  }
  return lines;
}

function buildNextStep({ postsCount, bestFormat, rateCurrent, metrics }) {
  if (postsCount === 0) return 'Retomar a frequência de publicações para manter o perfil ativo no algoritmo.';
  const reachVar = variation(metrics.reach?.current, metrics.reach?.previous);
  if (bestFormat && postsCount >= 3) return `Priorizar ${bestFormat.label.toLowerCase()} no calendário, formato que mais engajou no período.`;
  if (reachVar !== null && reachVar < -10) return 'Revisar horários e frequência de postagem para recuperar o alcance.';
  if (isNum(rateCurrent) && rateCurrent < 1) return 'Reforçar chamadas para ação (comentar, salvar, compartilhar) para elevar o engajamento.';
  return 'Manter a consistência das publicações e acompanhar a evolução no próximo relatório.';
}

/**
 * Relatório em texto (padrão WhatsApp) do Instagram orgânico.
 * `data` é o retorno de fetchInstagramOverview; métricas que a API não liberou são omitidas.
 */
export function buildInstagramReportText(data, { start, end, accountName = '', agencyName = '' } = {}) {
  const metrics = data?.metrics || {};
  const followers = data?.followers || {};
  const posts = data?.posts || [];
  const profile = data?.profile || {};

  const rateCurrent = engagementRate(metrics.interactions?.current, metrics.reach?.current);
  const ratePrevious = engagementRate(metrics.interactions?.previous, metrics.reach?.previous);
  const formats = summarizeByFormat(posts);
  const bestFormat = formats.length > 1 ? formats[0] : null;
  const topPost = [...posts]
    .filter(post => isNum(postEngagementRate(post)))
    .sort((a, b) => (postInteractions(b) ?? 0) - (postInteractions(a) ?? 0))[0] || null;

  const name = profile.name || accountName;
  const handle = profile.username ? ` (@${profile.username})` : '';

  const block = (title, lines) => {
    const valid = lines.filter(Boolean);
    return valid.length ? `${title}\n${valid.join('\n')}` : null;
  };

  const audience = block('👥 Audiência', [
    isNum(profile.followers) ? `➡️ Seguidores totais: ${fmtInt(profile.followers)}` : null,
    metricLine('Novos seguidores', followers.follows?.current, followers.follows?.previous),
    metricLine('Deixaram de seguir', followers.unfollows?.current, followers.unfollows?.previous),
    isNum(followers.net?.current) ? `➡️ Saldo de seguidores: ${signed(followers.net.current)}` : null,
  ]);

  const reach = block('📣 Alcance', [
    metricLine('Contas alcançadas', metrics.reach?.current, metrics.reach?.previous),
    metricLine('Visualizações', metrics.views?.current, metrics.views?.previous),
    metricLine('Visitas ao perfil', metrics.profileViews?.current, metrics.profileViews?.previous),
    metricLine('Toques nos links do perfil', metrics.linkTaps?.current, metrics.linkTaps?.previous),
  ]);

  const engagement = block('💬 Engajamento', [
    metricLine('Interações totais', metrics.interactions?.current, metrics.interactions?.previous),
    metricLine('Taxa de engajamento', rateCurrent, ratePrevious, fmtPct),
    metricLine('Contas engajadas', metrics.accountsEngaged?.current, metrics.accountsEngaged?.previous),
    metricLine('Curtidas', metrics.likes?.current, metrics.likes?.previous),
    metricLine('Comentários', metrics.comments?.current, metrics.comments?.previous),
    metricLine('Salvamentos', metrics.saves?.current, metrics.saves?.previous),
    metricLine('Compartilhamentos', metrics.shares?.current, metrics.shares?.previous),
    metricLine('Respostas aos stories', metrics.replies?.current, metrics.replies?.previous),
  ]);

  const content = block('🎬 Conteúdo', [
    `➡️ Publicações no período: ${fmtInt(posts.length)}`,
    ...formats.map(f => `➡️ ${f.label}: ${f.count} ${f.count === 1 ? 'post' : 'posts'} · alcance médio ${fmtInt(f.avgReach)} · engajamento ${fmtPct(f.engagementRate)}`),
  ]);

  const highlights = buildHighlights({ metrics, followers, rateCurrent, ratePrevious, bestFormat, topPost });
  const reading = highlights.length ? `📈 Leitura do período:\n${highlights.map(line => `- ${line}`).join('\n')}` : null;
  const nextStep = `📍 Próximos passos:\n- ${buildNextStep({ postsCount: posts.length, bestFormat, rateCurrent, metrics })}`;

  const comparison = data?.previousRange
    ? `🔁 Comparativo: ${fmtDayMonth(data.previousRange.start)} a ${fmtDayMonth(data.previousRange.end)}\n`
    : '';

  return [
    'Excelente dia pessoal!',
    'Segue relatório de desempenho do Instagram 👇',
    '⭐ Relatório de Desempenho — Instagram ⭐',
    `📅 Período Analisado: ${fmtDayMonth(start)} a ${fmtDayMonth(end)}\n${comparison}${name ? `📌 Perfil: ${name}${handle}` : ''}`.trim(),
    audience,
    reach,
    engagement,
    content,
    reading,
    nextStep,
    `Fico à disposição para qualquer dúvida!\nObrigado e tenha uma excelente semana!${buildAgencySignature(agencyName)} 🚀`,
  ].filter(Boolean).join('\n\n');
}
