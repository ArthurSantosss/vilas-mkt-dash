// "Leitura da semana" dos relatórios em texto. Regra de negócio: esta seção só destaca
// conquistas. Queda, piora ou resultado fraco nunca vira frase — a métrica simplesmente
// não é comentada. Se nada se destacar, sai uma frase neutra-positiva de entrega.

import { formatCurrency, formatNumber } from './format.js';

const MIN_CHANGE = 5; // % mínimo para uma variação virar destaque.

/** Rótulos do resultado principal por plataforma e modelo. */
export const RESULT_LABELS = {
  meta: {
    messages: { plural: 'conversas', singular: 'conversa', title: 'Conversas' },
    clicks: { plural: 'cliques no link', singular: 'clique', title: 'Cliques no link' },
    engagements: { plural: 'engajamentos', singular: 'engajamento', title: 'Engajamentos' },
  },
  google: {
    conversions: { plural: 'conversões', singular: 'conversão', title: 'Conversões' },
    clicks: { plural: 'cliques', singular: 'clique', title: 'Cliques' },
  },
};

const CTR_REFERENCE = { meta: 1, google: 2 };

function change(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

const pct = value => `${Math.abs(value).toFixed(0)}%`;
const ratio = value => `${Number(value || 0).toFixed(2).replace('.', ',')}%`;
const dayLabel = date => date.slice(5).split('-').reverse().join('/');

/**
 * @param {object} input
 * @param {'meta'|'google'} input.platform
 * @param {string} input.objective
 * @param {object} input.current  { spend, result, costPerResult, clicks, ctr, cpm, reach, impressions, frequency }
 * @param {object|null} input.previous  mesmo formato, período anterior do mesmo tamanho
 * @param {Array<{date: string, value: number}>} [input.daily]  resultado principal por dia
 * @param {object|null} [input.instagram]  resumo de collectInstagramSummary
 * @param {string} [input.currency]
 * @returns {string[]} até 5 frases, todas positivas
 */
export function buildPositiveReading({ platform, objective, current: c, previous: p, daily = [], instagram = null, currency }) {
  const label = RESULT_LABELS[platform]?.[objective] || RESULT_LABELS.meta.messages;
  const money = value => formatCurrency(value || 0, currency);
  const lines = [];

  const resultChange = change(c.result, p?.result);
  if (resultChange !== null && resultChange >= MIN_CHANGE) {
    lines.push(`Os ${label.plural} cresceram ${pct(resultChange)} em relação ao período anterior (de ${formatNumber(p.result)} para ${formatNumber(c.result)}).`);
  } else if (c.result > 0) {
    lines.push(`A conta gerou ${formatNumber(c.result)} ${label.plural}, com custo médio de ${money(c.costPerResult)} por ${label.singular}.`);
  }

  const costChange = change(c.costPerResult, p?.costPerResult);
  if (c.result > 0 && costChange !== null && costChange <= -MIN_CHANGE) {
    lines.push(`O custo por ${label.singular} caiu ${pct(costChange)} (de ${money(p.costPerResult)} para ${money(c.costPerResult)}): mais resultado para cada real investido.`);
  }

  const best = daily.filter(day => day.value > 0).sort((a, b) => b.value - a.value)[0];
  if (best && daily.length >= 3) {
    lines.push(`O melhor dia foi ${dayLabel(best.date)}, com ${formatNumber(best.value)} ${best.value === 1 ? label.singular : label.plural}.`);
  }

  const ctrChange = change(c.ctr, p?.ctr);
  if (ctrChange !== null && ctrChange >= MIN_CHANGE) {
    lines.push(`A taxa de cliques (CTR) subiu ${pct(ctrChange)}, chegando a ${ratio(c.ctr)}: os anúncios estão despertando mais interesse.`);
  } else if (c.ctr >= CTR_REFERENCE[platform]) {
    lines.push(`O CTR de ${ratio(c.ctr)} está acima da referência de mercado (${CTR_REFERENCE[platform]}%), sinal de anúncios relevantes para o público.`);
  }

  if (platform === 'meta') {
    const reachChange = change(c.reach, p?.reach);
    const cpmChange = change(c.cpm, p?.cpm);
    if (reachChange !== null && reachChange >= MIN_CHANGE) {
      lines.push(`O alcance cresceu ${pct(reachChange)}, levando a marca a ${formatNumber(c.reach)} pessoas.`);
    } else if (cpmChange !== null && cpmChange <= -MIN_CHANGE) {
      lines.push(`O CPM caiu ${pct(cpmChange)}, para ${money(c.cpm)}: a verba está comprando mais visibilidade.`);
    } else if (c.frequency >= 1 && c.frequency <= 2.5 && c.reach > 0) {
      lines.push(`A frequência média de ${c.frequency.toFixed(1).replace('.', ',')} mostra que o público vê os anúncios na medida certa, sem saturação.`);
    }
  } else {
    const clicksChange = change(c.clicks, p?.clicks);
    if (objective !== 'clicks' && clicksChange !== null && clicksChange >= MIN_CHANGE) {
      lines.push(`Os cliques cresceram ${pct(clicksChange)}, somando ${formatNumber(c.clicks)} visitas vindas dos anúncios.`);
    }
  }

  if (instagram) {
    const handle = instagram.username ? `@${instagram.username}` : 'O perfil';
    const gainChange = change(instagram.gained, instagram.gainedPrevious);
    if (instagram.gained > 0) {
      lines.push(gainChange !== null && gainChange >= MIN_CHANGE
        ? `${handle} ganhou ${formatNumber(instagram.gained)} novos seguidores, ${pct(gainChange)} a mais que no período anterior.`
        : `${handle} ganhou ${formatNumber(instagram.gained)} novos seguidores no período.`);
    }
    const visitsChange = change(instagram.profileViews?.current, instagram.profileViews?.previous);
    if (visitsChange !== null && visitsChange >= MIN_CHANGE) {
      lines.push(`As visitas ao perfil do Instagram cresceram ${pct(visitsChange)}, chegando a ${formatNumber(instagram.profileViews.current)}.`);
    }
  }

  if (!lines.length) {
    lines.push(platform === 'meta'
      ? `A conta manteve entrega constante, com ${formatNumber(c.impressions)} impressões e ${formatNumber(c.reach)} pessoas alcançadas.`
      : `A conta manteve os anúncios ativos, somando ${formatNumber(c.impressions)} impressões no período.`);
  }
  return lines.slice(0, 5);
}

/** Próximo passo construtivo, de acordo com o momento da conta. */
export function buildNextStep({ platform, objective, current: c, previous: p }) {
  const label = RESULT_LABELS[platform]?.[objective] || RESULT_LABELS.meta.messages;
  const resultChange = change(c.result, p?.result);
  const costChange = change(c.costPerResult, p?.costPerResult);
  if (c.result > 0 && resultChange !== null && resultChange >= 10 && (costChange === null || costChange <= 0)) {
    return 'Vamos preservar o que está funcionando e escalar o investimento com cautela nos anúncios de melhor desempenho.';
  }
  if (platform === 'meta' && c.frequency > 2.8) {
    return 'Vamos renovar os criativos e abrir novas variações de público para manter a comunicação sempre fresca.';
  }
  if (c.result === 0) {
    return `Vamos ajustar criativos, público e distribuição de verba para acelerar a geração de ${label.plural}.`;
  }
  if (platform === 'google') {
    return objective === 'clicks'
      ? 'Seguimos refinando palavras-chave e anúncios para atrair visitas cada vez mais qualificadas.'
      : 'Seguimos otimizando lances e palavras-chave para ampliar as conversões com eficiência.';
  }
  return 'Seguimos acompanhando a conta de perto e testando novos criativos para ganhar ainda mais eficiência.';
}
