// Geração de análise textual a partir das métricas (heurística, sem IA).
// Usado pelo Relatório Texto (GDM). Produz resumo executivo, pontos de
// análise (comparativos vs período anterior + alertas) e próximos passos.

import { formatCurrency, formatNumber } from './format';

export function pctChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function formatPercentValue(value, digits = 2) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

export function formatFrequency(value) {
  return Number(value || 0).toFixed(1).replace('.', ',');
}

export function buildDeltaInsight({
  label,
  current,
  previous,
  formatter,
  increasedText,
  decreasedText,
  higherIsBetter = true,
  threshold = 5,
}) {
  const change = pctChange(current, previous);
  if (change === null || Math.abs(change) < threshold) return null;

  const increased = change > 0;
  const improved = higherIsBetter ? increased : !increased;
  const movement = increased ? increasedText : decreasedText;
  const text = `${label} ${movement} ${Math.abs(change).toFixed(0)}% em relação ao período anterior (de ${formatter(previous)} para ${formatter(current)}).`;

  return { improved, text };
}

/**
 * Monta o pacote de insights a partir das métricas do período (d) e,
 * opcionalmente, do período anterior (prev).
 *
 * Campos esperados em d/prev:
 *   spend, conversations, costPerConversation, engagements,
 *   costPerEngagement, ctr, cpm, reach, frequency, clicks, impressions
 *
 * Retorna { executiveSummary, analysisLines, nextStep, flags }.
 */
export function buildInsightPack(d, prev = null) {
  const analysisLines = [];
  const flags = {
    noConversations: d.spend > 0 && d.conversations === 0,
    highFrequency: d.frequency >= 2.8,
    lowCtr: d.ctr > 0 && d.ctr < 1,
    strongMomentum: false,
    costWorsened: false,
  };

  const comparisons = [
    buildDeltaInsight({
      label: 'Conversas', current: d.conversations, previous: prev?.conversations,
      formatter: formatNumber, increasedText: 'subiram', decreasedText: 'caíram',
      higherIsBetter: true, threshold: 8,
    }),
    buildDeltaInsight({
      label: 'Custo por conversa', current: d.costPerConversation, previous: prev?.costPerConversation,
      formatter: formatCurrency, increasedText: 'subiu', decreasedText: 'caiu',
      higherIsBetter: false, threshold: 8,
    }),
    buildDeltaInsight({
      label: 'Engajamentos', current: d.engagements, previous: prev?.engagements,
      formatter: formatNumber, increasedText: 'subiram', decreasedText: 'caíram',
      higherIsBetter: true, threshold: 8,
    }),
    buildDeltaInsight({
      label: 'CTR', current: d.ctr, previous: prev?.ctr,
      formatter: (value) => formatPercentValue(value), increasedText: 'subiu', decreasedText: 'caiu',
      higherIsBetter: true, threshold: 6,
    }),
    buildDeltaInsight({
      label: 'CPM', current: d.cpm, previous: prev?.cpm,
      formatter: formatCurrency, increasedText: 'subiu', decreasedText: 'caiu',
      higherIsBetter: false, threshold: 8,
    }),
    buildDeltaInsight({
      label: 'Alcance', current: d.reach, previous: prev?.reach,
      formatter: formatNumber, increasedText: 'subiu', decreasedText: 'caiu',
      higherIsBetter: true, threshold: 8,
    }),
  ].filter(Boolean);

  comparisons.forEach((comparison) => analysisLines.push(comparison.text));

  if (flags.noConversations) {
    analysisLines.push(`Houve investimento de ${formatCurrency(d.spend)} no período sem geração de novas conversas.`);
  }
  if (flags.highFrequency) {
    analysisLines.push(`A frequência está em ${formatFrequency(d.frequency)}, o que pode indicar desgaste da audiência e pedir renovação de criativos.`);
  }
  if (flags.lowCtr) {
    analysisLines.push(`O CTR está em ${formatPercentValue(d.ctr)}, então ainda existe espaço para melhorar a atratividade dos anúncios.`);
  }

  const leadChange = pctChange(d.conversations, prev?.conversations);
  const costChange = pctChange(d.costPerConversation, prev?.costPerConversation);
  flags.strongMomentum = leadChange !== null && costChange !== null && leadChange >= 10 && costChange <= -10;
  flags.costWorsened = costChange !== null && costChange >= 10;

  let executiveSummary = `A conta manteve entrega ativa no período, com ${formatNumber(d.conversations)} conversas geradas a partir de ${formatCurrency(d.spend)} em investimento.`;

  if (flags.noConversations) {
    executiveSummary = `Houve investimento no período, mas a conta ainda não converteu em novas conversas, então o foco agora é destravar resposta com mais tração.`;
  } else if (flags.strongMomentum) {
    executiveSummary = 'O período fechou com avanço de volume e eficiência, sinal de que a operação ganhou tração na geração de conversas.';
  } else if (leadChange !== null && costChange !== null && leadChange <= -10 && costChange >= 10) {
    executiveSummary = 'O período pede mais atenção, porque houve perda de volume e piora de eficiência em relação à janela anterior.';
  } else if (costChange !== null && costChange <= -10) {
    executiveSummary = 'A eficiência melhorou no período, com redução relevante no custo por conversa.';
  } else if (leadChange !== null && leadChange >= 10) {
    executiveSummary = 'O volume de conversas cresceu no período, mostrando uma resposta melhor das campanhas.';
  }

  let nextStep = 'Seguimos monitorando a conta de perto e fazendo ajustes finos para buscar mais consistência nas próximas entregas.';

  if (flags.noConversations) {
    nextStep = 'Vamos revisar criativos, público e distribuição de verba para destravar as primeiras conversas com mais velocidade.';
  } else if (flags.highFrequency) {
    nextStep = 'O próximo passo é renovar criativos e abrir novas variações de público para reduzir sinais de saturação.';
  } else if (flags.lowCtr) {
    nextStep = 'O próximo passo é testar novas copys, ganchos e abordagens criativas para elevar a taxa de clique.';
  } else if (flags.strongMomentum) {
    nextStep = 'Vamos preservar os aprendizados da semana e escalar com cautela o que já está respondendo melhor.';
  } else if (flags.costWorsened) {
    nextStep = 'Vamos revisar a distribuição de verba, criativos e públicos para buscar uma retomada de eficiência nas próximas entregas.';
  }

  return { executiveSummary, analysisLines, nextStep, flags };
}

/**
 * Helper para montar o objeto `d` esperado por buildInsightPack a partir
 * de um conjunto de métricas já agregadas (spend, leads, engagements, etc.).
 */
export function toInsightInput(m) {
  const conversations = m.leads ?? m.conversations ?? 0;
  const engagements = m.engagements ?? 0;
  const ctr = m.ctr != null ? m.ctr : (m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0);
  return {
    spend: m.spend ?? 0,
    conversations,
    costPerConversation: conversations > 0 ? (m.spend ?? 0) / conversations : 0,
    engagements,
    costPerEngagement: engagements > 0 ? (m.spend ?? 0) / engagements : 0,
    ctr,
    cpm: m.cpm ?? 0,
    reach: m.reach ?? 0,
    frequency: m.frequency ?? 0,
    clicks: m.clicks ?? 0,
    impressions: m.impressions ?? 0,
  };
}
