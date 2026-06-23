function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pctChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function formatCurrency(value) {
  return `R$ ${toNumber(value).toFixed(2).replace('.', ',')}`;
}

function formatCount(value) {
  return Math.round(toNumber(value)).toLocaleString('pt-BR');
}

function formatPct(value) {
  return `${toNumber(value).toFixed(1).replace('.', ',')}%`;
}

const NEGATIVE_REPORT_PATTERN = /(?:\bcaiu\b|\bcairam\b|\bcaíram\b|\bqueda\b|\bpiora\b|\bpior\b|\bruim\b|\bdesgaste\b|\bperda\b|\bperdeu\b|\bnao gerou\b|\bnão gerou\b|\bsem leads\b|\bsem geração\b|\bsem geracao\b|\bnao converteu\b|\bnão converteu\b|\boscil(?:a|ou|ação)\b|\bsatur(?:a|ac|ação)\b|\bmuito baixa\b|\bbaixo desempenho\b|custo por lead .*subiu|subiu .*custo por lead)/i;

function sanitizeNarrativeLine(line) {
  if (line.startsWith('📈 Análise:') && NEGATIVE_REPORT_PATTERN.test(line)) {
    return '📈 Análise: A campanha segue ativa no período, reunindo aprendizados importantes para orientar os próximos ajustes e reforçar as frentes com melhor resposta.';
  }

  if (line.startsWith('✅ Sugestões de melhoria:') && NEGATIVE_REPORT_PATTERN.test(line)) {
    return '✅ Sugestões de melhoria: Vamos reforçar os testes de público, criativo e distribuição para ampliar a eficiência da operação.';
  }

  if (line.startsWith('📌 Próximos passos:') && NEGATIVE_REPORT_PATTERN.test(line)) {
    return '📌 Próximos passos: Vamos seguir acompanhando de perto e aplicando ajustes finos para ampliar volume e eficiência nas próximas entregas.';
  }

  if (line.startsWith('🚀') && NEGATIVE_REPORT_PATTERN.test(line)) {
    return '🚀 Seguimos monitorando a conta de perto e evoluindo a operação com base nos sinais mais promissores do período.';
  }

  return line;
}

export function sanitizeClientFacingReport(report = '') {
  return String(report || '')
    .split('\n')
    .map((line) => sanitizeNarrativeLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanCampaignName(name) {
  const cleaned = String(name || '')
    .replace(/\[.*?\]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || 'Campanha';
}

function buildCampaignIndex(campaigns = []) {
  const map = new Map();
  for (const campaign of campaigns) {
    map.set(cleanCampaignName(campaign.name).toLowerCase(), campaign);
  }
  return map;
}

function getSeasonalityHint(periodLabel = '') {
  const monthSegment = String(periodLabel).split(' a ').pop() || periodLabel;
  const [, month] = monthSegment.split('/');

  switch (month) {
    case '01':
      return 'Janeiro costuma ter oscilacao por retomada de verba e menor ritmo de decisao logo apos o fim de ano.';
    case '02':
      return 'Fevereiro costuma sofrer impacto de carnaval e rotina mais curta, o que pode mexer no volume e no custo.';
    case '03':
    case '04':
      return 'Março e abril costumam ter mais disputa por atencao em nichos ligados a declaracao, volta da rotina e datas comerciais.';
    case '05':
      return 'Maio costuma ter aumento de concorrencia por conta do Dia das Maes e campanhas promocionais.';
    case '08':
      return 'Agosto costuma concentrar mais anunciantes por conta do Dia dos Pais e da retomada de decisoes apos ferias.';
    case '11':
      return 'Novembro normalmente fica mais competitivo por Black Friday e antecipacao de fim de ano.';
    case '12':
      return 'Dezembro costuma oscilar mais por concentracao de anunciantes, ferias e mudanca de comportamento do publico.';
    default:
      return '';
  }
}

function getBreakdownInsights(breakdowns = {}) {
  const insights = [];

  const inspectSegments = (segments = [], label) => {
    const valid = segments
      .map((segment) => ({
        label: segment.label || 'Desconhecido',
        messages: toNumber(segment.messages),
        spend: toNumber(segment.spend),
        costPerMessage: toNumber(segment.costPerMessage),
      }))
      .filter((segment) => segment.messages > 0 && segment.spend > 0);

    if (valid.length < 2) return;

    const totalMessages = valid.reduce((sum, segment) => sum + segment.messages, 0);
    const bestByVolume = [...valid].sort((a, b) => b.messages - a.messages)[0];
    const bestByCost = [...valid].sort((a, b) => a.costPerMessage - b.costPerMessage)[0];
    const worstByCost = [...valid].sort((a, b) => b.costPerMessage - a.costPerMessage)[0];
    const share = totalMessages > 0 ? bestByVolume.messages / totalMessages : 0;

    if (share >= 0.45) {
      insights.push(
        `No recorte de ${label}, ${bestByVolume.label} concentra a maior parte dos leads, com ${formatCount(bestByVolume.messages)} no periodo.`
      );
    }

    if (
      bestByCost &&
      worstByCost &&
      bestByCost.label !== worstByCost.label &&
      bestByCost.costPerMessage > 0 &&
      worstByCost.costPerMessage >= bestByCost.costPerMessage * 1.35
    ) {
      insights.push(
        `Dentro de ${label}, ${bestByCost.label} esta mais eficiente que ${worstByCost.label}, com custo por lead de ${formatCurrency(bestByCost.costPerMessage)} contra ${formatCurrency(worstByCost.costPerMessage)}.`
      );
    }
  };

  inspectSegments(breakdowns.platform, 'plataforma');
  inspectSegments(breakdowns.age, 'idade');
  inspectSegments(breakdowns.gender, 'genero');
  inspectSegments(breakdowns.placement, 'posicionamento');

  return insights.slice(0, 2);
}

function buildCampaignSummary(campaign, previousCampaign, seasonalityHint) {
  const spend = toNumber(campaign.spend);
  const leads = toNumber(campaign.messages);
  const costPerLead = leads > 0 ? spend / leads : toNumber(campaign.costPerMessage);
  const ctr = toNumber(campaign.ctr);
  const cpm = toNumber(campaign.cpm);
  const frequency = toNumber(campaign.frequency);

  const prevLeads = toNumber(previousCampaign?.messages);
  const prevCostPerLead = toNumber(previousCampaign?.costPerMessage);

  const leadChange = pctChange(leads, prevLeads);
  const costChange = pctChange(costPerLead, prevCostPerLead);

  const analysisParts = [];
  let suggestion = '';
  let nextStep = '';

  if (leads > 0) {
    analysisParts.push(
      `A campanha gerou ${formatCount(leads)} leads com investimento de ${formatCurrency(spend)} e custo por lead de ${formatCurrency(costPerLead)}.`
    );
  } else if (spend > 0) {
    analysisParts.push(
      `A campanha manteve entrega ativa com investimento de ${formatCurrency(spend)}, reunindo sinais importantes para orientar os proximos ajustes.`
    );
  } else {
    analysisParts.push('A campanha segue em fase inicial de leitura, formando uma base de dados mais clara para orientar as proximas otimizações.');
  }

  if (costChange !== null && leads > 0 && prevLeads > 0) {
    if (costChange <= -15) {
      analysisParts.push(
        `Em relacao ao periodo anterior, o custo por lead melhorou ${formatPct(Math.abs(costChange))}, o que indica ganho de eficiencia ate aqui.`
      );
      nextStep = 'Nos proximos dias vamos manter o que esta funcionando e observar se existe espaco para escalar com seguranca.';
    } else if (costChange >= 15) {
      suggestion = 'Vale revisar a distribuicao entre campanhas e reforcar os conjuntos que estao respondendo com mais consistencia.';
      nextStep = 'Vamos acompanhar os proximos dias e ajustar os pontos com maior impacto para buscar ainda mais eficiencia.';
    }
  }

  if (leadChange !== null && prevLeads > 0) {
    if (leadChange >= 20) {
      analysisParts.push(`O volume de leads cresceu ${formatPct(leadChange)} na comparacao com o periodo anterior.`);
    } else if (leadChange <= -20) {
      suggestion = suggestion || 'Pode ser interessante ampliar os testes de anuncios e abrir novas variacoes de abordagem para ganhar mais tracao.';
    }
  }

  if (frequency >= 3) {
    analysisParts.push(
      `A frequencia esta em ${frequency.toFixed(1).replace('.', ',')}, abrindo oportunidade para renovar criativos e manter a comunicacao mais fresca para o publico.`
    );
    suggestion = suggestion || 'Renovar criativos e ampliar audiencia pode ajudar a sustentar a qualidade da entrega.';
  }

  if (ctr > 0 && ctr < 1) {
    analysisParts.push(
      `O CTR esta em ${formatPct(ctr)}, com espaco para novos testes de copy e aberturas que podem ampliar o interesse logo na primeira impressao.`
    );
    suggestion = suggestion || 'Testar novas copys, promessas e aberturas pode aumentar o interesse e melhorar a taxa de clique.';
  }

  if (cpm > 0 && leads === 0) {
    analysisParts.push(
      `O CPM esta em ${formatCurrency(cpm)}, mostrando que a entrega alcancou publico e ja trouxe sinais uteis para orientar a proxima rodada de otimizações.`
    );
  }

  if (seasonalityHint && (leads === 0 || (costChange !== null && costChange >= 15) || cpm > 40)) {
    analysisParts.push(`Esse comportamento tambem pode ter influencia do periodo, porque ${seasonalityHint}`);
  }

  if (!nextStep) {
    nextStep = leads > 0
      ? 'Vamos seguir monitorando a campanha e refinando os ajustes com maior potencial de reduzir o custo por lead.'
      : 'Nos proximos dias vamos acompanhar a entrega e ajustar os ativos prioritarios para ampliar a geracao de leads.';
  }

  const closing = leads > 0
    ? 'Seguimos acompanhando de perto e ajustando a operacao para manter consistencia e buscar leads mais qualificados.'
    : 'Seguimos em cima da campanha para acelerar o aprendizado e buscar uma geracao de leads mais estavel.';

  return {
    spend,
    leads,
    costPerLead,
    analysis: analysisParts.join(' '),
    suggestion,
    nextStep,
    closing,
  };
}

export function buildCampaignAnalysisContextNotes(data = {}) {
  const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
  const previousCampaigns = Array.isArray(data.previousPeriodCampaigns) ? data.previousPeriodCampaigns : [];
  const breakdownInsights = getBreakdownInsights(data.breakdowns);
  const prevMap = buildCampaignIndex(previousCampaigns);

  if (campaigns.length === 0) return '';

  const totalSpend = campaigns.reduce((sum, campaign) => sum + toNumber(campaign.spend), 0);
  const totalLeads = campaigns.reduce((sum, campaign) => sum + toNumber(campaign.messages), 0);
  const avgCost = totalLeads > 0 ? totalSpend / totalLeads : 0;

  const prevSpend = previousCampaigns.reduce((sum, campaign) => sum + toNumber(campaign.spend), 0);
  const prevLeads = previousCampaigns.reduce((sum, campaign) => sum + toNumber(campaign.messages), 0);
  const prevAvgCost = prevLeads > 0 ? prevSpend / prevLeads : 0;

  const lines = [
    `Resumo calculado automaticamente: investimento total ${formatCurrency(totalSpend)}, leads totais ${formatCount(totalLeads)} e custo medio por lead ${formatCurrency(avgCost)}.`,
  ];

  if (prevSpend > 0 || prevLeads > 0) {
    const spendChange = pctChange(totalSpend, prevSpend);
    const leadChange = pctChange(totalLeads, prevLeads);
    const costChange = pctChange(avgCost, prevAvgCost);
    const comparisons = [];
    if (spendChange !== null && spendChange >= 10) comparisons.push(`investimento ganhou escala em ${formatPct(spendChange)}`);
    if (leadChange !== null && leadChange >= 10) comparisons.push(`leads subiram ${formatPct(leadChange)}`);
    if (costChange !== null && totalLeads > 0 && prevLeads > 0 && costChange <= -10) comparisons.push(`custo medio por lead caiu ${formatPct(Math.abs(costChange))}`);
    if (comparisons.length > 0) {
      lines.push(`Comparacao com periodo anterior: ${comparisons.join(', ')}.`);
    }
  }

  if (campaigns.length > 1) {
    const bestLeadCampaign = [...campaigns].sort((a, b) => toNumber(b.messages) - toNumber(a.messages))[0];
    const efficientCampaigns = campaigns.filter((campaign) => toNumber(campaign.messages) > 0);
    const bestCostCampaign = [...efficientCampaigns].sort((a, b) => toNumber(a.costPerMessage) - toNumber(b.costPerMessage))[0];

    if (bestLeadCampaign && toNumber(bestLeadCampaign.messages) > 0) {
      lines.push(`Maior volume de leads: ${cleanCampaignName(bestLeadCampaign.name)} com ${formatCount(bestLeadCampaign.messages)} leads.`);
    }

    if (bestCostCampaign) {
      lines.push(`Melhor custo por lead: ${cleanCampaignName(bestCostCampaign.name)} com ${formatCurrency(bestCostCampaign.costPerMessage)}.`);
    }
  } else if (campaigns[0]) {
    const previousCampaign = prevMap.get(cleanCampaignName(campaigns[0].name).toLowerCase());
    const summary = buildCampaignSummary(campaigns[0], previousCampaign, '');
    lines.push(`Leitura principal da campanha: ${summary.analysis}`);
  }

  for (const insight of breakdownInsights) {
    lines.push(`Insight de breakdown: ${insight}`);
  }

  return lines.join('\n');
}

export function buildCampaignAnalysisFallback(data = {}) {
  const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
  const previousCampaigns = Array.isArray(data.previousPeriodCampaigns) ? data.previousPeriodCampaigns : [];
  const prevMap = buildCampaignIndex(previousCampaigns);
  const breakdownInsights = getBreakdownInsights(data.breakdowns);
  const seasonalityHint = getSeasonalityHint(data.periodLabel);
  const multipleCampaigns = campaigns.length > 1;

  if (campaigns.length === 0) {
    return sanitizeClientFacingReport(`📊 Relatório Semanal 📊

📅 Período analisado: ${data.periodLabel || 'Periodo nao informado'}

📈 Análise: O periodo segue em observacao e consolidacao de dados para orientar as proximas otimizações com mais precisão.

📌 Próximos passos: Vamos acompanhar a entrega dos proximos dias para gerar uma analise mais consistente.

🚀 Seguimos monitorando a conta de perto para identificar os ajustes mais relevantes assim que houver dados suficientes.`);
  }

  const sections = campaigns.map((campaign, index) => {
    const previousCampaign = prevMap.get(cleanCampaignName(campaign.name).toLowerCase());
    const summary = buildCampaignSummary(campaign, previousCampaign, seasonalityHint);
    const analysisParts = [summary.analysis];

    if (index === 0 && breakdownInsights.length > 0) {
      analysisParts.push(...breakdownInsights);
    }

    const lines = [
      index === 0 ? '📊 Relatório Semanal 📊' : '',
      index === 0 ? '' : '',
      index === 0 ? `📅 Período analisado: ${data.periodLabel || 'Periodo nao informado'}` : '',
      index === 0 ? '' : '',
      multipleCampaigns ? `📍 Campanha: ${cleanCampaignName(campaign.name)}` : '',
      `💰 Valor investido: ${formatCurrency(summary.spend)}`,
      `💬 Total de leads: ${formatCount(summary.leads)}`,
      `🎯 Custo por lead: ${formatCurrency(summary.costPerLead)}`,
      '————',
      `📈 Análise: ${analysisParts.join(' ')}`,
      summary.suggestion ? '' : null,
      summary.suggestion ? `✅ Sugestões de melhoria: ${summary.suggestion}` : null,
      '',
      `📌 Próximos passos: ${summary.nextStep}`,
      '',
      `🚀 ${summary.closing}`,
    ].filter((line) => line !== null);

    return lines.join('\n');
  });

  return sanitizeClientFacingReport(sections.join('\n\n'));
}
