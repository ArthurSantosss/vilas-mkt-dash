// Sumário executivo do relatório.
// Primeiro tenta a IA (/api/report-summary); se ela estiver indisponível,
// monta um resumo determinístico com os mesmos números. O PDF sai dos dois
// jeitos — a IA melhora a redação, não é pré-requisito.

import { money, count, percent, decimal, signedPercent } from './pdf/formatters';

// ── Payload enviado ao modelo: apenas números já apurados ──

export function buildSummaryPayload(report) {
  const { meta, totals, previous, deltas, campaigns, audience, placements, daily } = report;

  const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
  const roundDelta = (value) => (Number.isFinite(value) ? Number(value.toFixed(1)) : null);

  return {
    cliente: meta.clientName,
    periodo: meta.period.label,
    dias_no_periodo: meta.period.days,
    periodo_anterior: meta.hasPrevious ? meta.period.previousLabel : null,
    objetivo: meta.objectiveLabel,
    metrica_de_resultado: meta.resultLabel,
    atual: {
      investimento: round(totals.spend),
      resultados: totals.results,
      custo_por_resultado: round(totals.costPerResult),
      impressoes: totals.impressions,
      alcance: totals.reach,
      cliques_no_link: totals.clicks,
      ctr_percentual: round(totals.ctr),
      cpm: round(totals.cpm),
      frequencia: round(totals.frequency),
    },
    anterior: meta.hasPrevious
      ? {
          investimento: round(previous.spend),
          resultados: previous.results,
          custo_por_resultado: round(previous.costPerResult),
          ctr_percentual: round(previous.ctr),
          cpm: round(previous.cpm),
          frequencia: round(previous.frequency),
        }
      : null,
    variacao_percentual: meta.hasPrevious
      ? {
          investimento: roundDelta(deltas.spend),
          resultados: roundDelta(deltas.results),
          custo_por_resultado: roundDelta(deltas.costPerResult),
          ctr: roundDelta(deltas.ctr),
          cpm: roundDelta(deltas.cpm),
          alcance: roundDelta(deltas.reach),
        }
      : null,
    campanhas: campaigns.slice(0, 6).map((campaign) => ({
      nome: campaign.name,
      investimento: round(campaign.spend),
      resultados: campaign.results,
      custo_por_resultado: round(campaign.costPerResult),
      ctr_percentual: round(campaign.ctr),
      participacao_do_investimento: round(campaign.share * 100, 1),
    })),
    dias_com_entrega: daily.length,
    publico_por_idade: audience.age.slice(0, 4).map((item) => ({
      faixa: item.label,
      resultados: item.results,
      investimento: round(item.spend),
    })),
    publico_por_genero: audience.gender.map((item) => ({
      genero: item.label,
      resultados: item.results,
      investimento: round(item.spend),
    })),
    principais_regioes: audience.region.slice(0, 3).map((item) => ({
      regiao: item.label,
      resultados: item.results,
    })),
    posicionamentos: placements.placement.slice(0, 4).map((item) => ({
      posicionamento: item.label,
      resultados: item.results,
      custo_por_resultado: round(item.costPerResult),
    })),
  };
}

// ── Fallback determinístico ──

function describeTrend(report) {
  const { totals, deltas, meta } = report;

  if (!meta.hasPrevious) {
    return `A conta investiu ${money(totals.spend)} no período e registrou ${count(totals.results)} ${meta.resultLabel.toLowerCase()}, a um custo médio de ${money(totals.costPerResult)} por resultado.`;
  }

  const parts = [
    `A conta investiu ${money(totals.spend)} no período (${signedPercent(deltas.spend || 0)} em relação ao período anterior) e registrou ${count(totals.results)} ${meta.resultLabel.toLowerCase()}`,
  ];

  if (Number.isFinite(deltas.results)) {
    parts.push(`, ${signedPercent(deltas.results)} na comparação`);
  }

  parts.push('.');

  if (totals.costPerResult > 0 && Number.isFinite(deltas.costPerResult)) {
    const direction = deltas.costPerResult <= 0 ? 'recuou' : 'subiu';
    parts.push(
      ` O custo por resultado ${direction} para ${money(totals.costPerResult)} (${signedPercent(deltas.costPerResult)}).`
    );
  }

  return parts.join('');
}

function describeDelivery(report) {
  const { totals, meta } = report;
  const sentences = [
    `A entrega alcançou ${count(totals.reach)} pessoas e gerou ${count(totals.impressions)} impressões, com CPM de ${money(totals.cpm)} e frequência média de ${decimal(totals.frequency, 1)} exibições por pessoa.`,
  ];

  if (totals.clicks > 0) {
    sentences.push(
      `Foram ${count(totals.clicks)} cliques no link, o que representa um CTR de ${percent(totals.ctr)} sobre as impressões.`
    );
  }

  if (totals.frequency >= 3 && totals.ctr > 0) {
    sentences.push(
      'A frequência nesse patamar indica que o público vem sendo impactado várias vezes pelos mesmos anúncios, o que reforça a importância de renovar criativos nas próximas semanas.'
    );
  }

  if (meta.period.days > 0) {
    sentences.push(`O investimento médio ficou em ${money(totals.spend / meta.period.days)} por dia.`);
  }

  return sentences.join(' ');
}

function buildHighlights(report) {
  const { totals, campaigns, audience, placements, meta } = report;
  const highlights = [];

  const bestCampaign = campaigns.filter((item) => item.results > 0)
    .sort((left, right) => left.costPerResult - right.costPerResult)[0];
  if (bestCampaign) {
    highlights.push(
      `Melhor eficiência: a campanha ${bestCampaign.name} entregou ${count(bestCampaign.results)} resultados a ${money(bestCampaign.costPerResult)} cada.`
    );
  }

  const topVolume = campaigns[0];
  if (topVolume) {
    highlights.push(
      `A campanha ${topVolume.name} concentrou ${percent(topVolume.share * 100, 0)} do investimento do período.`
    );
  }

  const topAge = audience.age.filter((item) => item.results > 0)[0];
  if (topAge) {
    highlights.push(`A faixa de ${topAge.label} anos respondeu pelo maior volume de resultados do período.`);
  }

  const topPlacement = placements.placement.filter((item) => item.results > 0)[0];
  if (topPlacement) {
    highlights.push(`${topPlacement.label} foi o posicionamento com melhor retorno em ${meta.resultShort.toLowerCase()}.`);
  }

  if (highlights.length < 3 && totals.reach > 0) {
    highlights.push(`O alcance do período foi de ${count(totals.reach)} pessoas distintas.`);
  }

  return highlights.slice(0, 4);
}

function buildRecommendations(report) {
  const { totals, deltas, campaigns, meta } = report;
  const recommendations = [];

  if (totals.frequency >= 3) {
    recommendations.push('Renovar os criativos das campanhas com maior frequência para reduzir o desgaste junto ao público já impactado.');
  }

  if (Number.isFinite(deltas.costPerResult) && deltas.costPerResult > 10) {
    recommendations.push('Concentrar verba nos conjuntos com melhor custo por resultado e revisar os públicos que encareceram na comparação.');
  }

  const efficient = campaigns.filter((item) => item.results > 0)
    .sort((left, right) => left.costPerResult - right.costPerResult)[0];
  if (efficient) {
    recommendations.push(`Ampliar gradualmente o investimento em ${efficient.name}, hoje a operação mais eficiente da conta.`);
  }

  if (totals.ctr > 0 && totals.ctr < 1) {
    recommendations.push('Testar novas chamadas e formatos de anúncio para elevar a taxa de cliques, hoje abaixo de 1%.');
  }

  recommendations.push(`Manter o acompanhamento semanal dos indicadores de ${meta.resultShort.toLowerCase()} e ajustar a distribuição de verba conforme a resposta de cada campanha.`);

  return recommendations.slice(0, 4);
}

export function buildLocalSummary(report) {
  const { totals, meta } = report;

  const headline = totals.results > 0
    ? `${count(totals.results)} ${meta.resultLabel.toLowerCase()} com ${money(totals.spend)} investidos no período`
    : `${money(totals.spend)} investidos e ${count(totals.reach)} pessoas alcançadas no período`;

  return {
    headline,
    paragraphs: [describeTrend(report), describeDelivery(report)],
    highlights: buildHighlights(report),
    recommendations: buildRecommendations(report),
  };
}

// ── Orquestração ──

function isValidSummary(summary) {
  return Boolean(
    summary &&
    typeof summary.headline === 'string' &&
    Array.isArray(summary.paragraphs) && summary.paragraphs.length > 0 &&
    Array.isArray(summary.highlights) &&
    Array.isArray(summary.recommendations)
  );
}

export async function generateExecutiveSummary(report, { useAI = true } = {}) {
  const local = buildLocalSummary(report);
  if (!useAI) return { ...local, source: 'local' };

  try {
    const response = await fetch('/api/report-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ payload: buildSummaryPayload(report) }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!isValidSummary(data?.summary)) throw new Error('Sumário inválido.');

    return {
      headline: data.summary.headline,
      paragraphs: data.summary.paragraphs,
      // Se a IA vier sem destaques ou sem próximos passos, completamos com os locais.
      highlights: data.summary.highlights.length > 0 ? data.summary.highlights : local.highlights,
      recommendations: data.summary.recommendations.length > 0 ? data.summary.recommendations : local.recommendations,
      source: 'ai',
    };
  } catch (error) {
    console.warn('[report-pdf] sumário por IA indisponível, usando resumo local:', error.message);
    return { ...local, source: 'local' };
  }
}
