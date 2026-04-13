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
      `Houve investimento de ${formatCurrency(spend)}, mas ate o momento a campanha nao gerou leads no periodo analisado.`
    );
  } else {
    analysisParts.push('A campanha teve entrega muito baixa no periodo e ainda nao trouxe sinal suficiente para uma leitura mais conclusiva.');
  }

  if (costChange !== null && leads > 0 && prevLeads > 0) {
    if (costChange <= -15) {
      analysisParts.push(
        `Em relacao ao periodo anterior, o custo por lead melhorou ${formatPct(Math.abs(costChange))}, o que indica ganho de eficiencia ate aqui.`
      );
      nextStep = 'Nos proximos dias vamos manter o que esta funcionando e observar se existe espaco para escalar com seguranca.';
    } else if (costChange >= 15) {
      analysisParts.push(
        `Em relacao ao periodo anterior, o custo por lead subiu ${formatPct(costChange)}, o que pede mais atencao na leitura de publico, criativo e distribuicao da verba.`
      );
      suggestion = 'Vale revisar a distribuicao entre campanhas e reforcar os conjuntos que estao conseguindo leads com custo mais controlado.';
      nextStep = 'Vamos acompanhar os proximos dias e ajustar os pontos com maior impacto para buscar uma retomada de eficiencia.';
    }
  }

  if (leadChange !== null && prevLeads > 0) {
    if (leadChange >= 20) {
      analysisParts.push(`O volume de leads cresceu ${formatPct(leadChange)} na comparacao com o periodo anterior.`);
    } else if (leadChange <= -20) {
      analysisParts.push(`O volume de leads caiu ${formatPct(Math.abs(leadChange))} em relacao ao periodo anterior, mesmo com a campanha ativa.`);
      suggestion = suggestion || 'Pode ser interessante revisar os anuncios com menor resposta e abrir novas variacoes de abordagem.';
    }
  }

  if (frequency >= 3) {
    analysisParts.push(
      `A frequencia esta em ${frequency.toFixed(1).replace('.', ',')}, o que pode indicar desgaste da audiencia e perda gradual de eficiencia.`
    );
    suggestion = suggestion || 'Renovar criativos e ampliar audiencia pode ajudar a reduzir a sensacao de saturacao.';
  }

  if (ctr > 0 && ctr < 1) {
    analysisParts.push(
      `O CTR esta em ${formatPct(ctr)}, sinal de que ainda existe espaco para melhorar a atracao do anuncio logo na primeira impressao.`
    );
    suggestion = suggestion || 'Testar novas copys, promessas e aberturas pode aumentar o interesse e melhorar a taxa de clique.';
  }

  if (cpm > 0 && leads === 0) {
    analysisParts.push(
      `O CPM esta em ${formatCurrency(cpm)}, o que mostra que a entrega esta acontecendo, mas a conversao em lead ainda nao acompanhou esse investimento.`
    );
  }

  if (seasonalityHint && (leads === 0 || (costChange !== null && costChange >= 15) || cpm > 40)) {
    analysisParts.push(`Esse comportamento tambem pode ter influencia do periodo, porque ${seasonalityHint}`);
  }

  if (!nextStep) {
    nextStep = leads > 0
      ? 'Vamos seguir monitorando a campanha e refinando os ajustes com maior potencial de reduzir o custo por lead.'
      : 'Nos proximos dias vamos acompanhar a entrega e ajustar os ativos com menor tracao para destravar a geracao de leads.';
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
    if (spendChange !== null) comparisons.push(`investimento ${spendChange >= 0 ? 'subiu' : 'caiu'} ${formatPct(Math.abs(spendChange))}`);
    if (leadChange !== null) comparisons.push(`leads ${leadChange >= 0 ? 'subiram' : 'cairam'} ${formatPct(Math.abs(leadChange))}`);
    if (costChange !== null && totalLeads > 0 && prevLeads > 0) comparisons.push(`custo medio por lead ${costChange >= 0 ? 'subiu' : 'caiu'} ${formatPct(Math.abs(costChange))}`);
    if (comparisons.length > 0) {
      lines.push(`Comparacao com periodo anterior: ${comparisons.join(', ')}.`);
    }
  }

  if (campaigns.length > 1) {
    const bestLeadCampaign = [...campaigns].sort((a, b) => toNumber(b.messages) - toNumber(a.messages))[0];
    const efficientCampaigns = campaigns.filter((campaign) => toNumber(campaign.messages) > 0);
    const bestCostCampaign = [...efficientCampaigns].sort((a, b) => toNumber(a.costPerMessage) - toNumber(b.costPerMessage))[0];
    const zeroLeadCampaigns = campaigns.filter((campaign) => toNumber(campaign.spend) > 0 && toNumber(campaign.messages) === 0);

    if (bestLeadCampaign && toNumber(bestLeadCampaign.messages) > 0) {
      lines.push(`Maior volume de leads: ${cleanCampaignName(bestLeadCampaign.name)} com ${formatCount(bestLeadCampaign.messages)} leads.`);
    }

    if (bestCostCampaign) {
      lines.push(`Melhor custo por lead: ${cleanCampaignName(bestCostCampaign.name)} com ${formatCurrency(bestCostCampaign.costPerMessage)}.`);
    }

    if (zeroLeadCampaigns.length > 0) {
      lines.push(`Campanhas com gasto sem leads: ${zeroLeadCampaigns.map((campaign) => cleanCampaignName(campaign.name)).join(', ')}.`);
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
    return `📊 Relatório Semanal 📊

📅 Período analisado: ${data.periodLabel || 'Periodo nao informado'}

📈 Análise: Nao houve campanhas com dados suficientes para gerar uma leitura mais completa neste periodo.

📌 Próximos passos: Vamos acompanhar a entrega dos proximos dias para gerar uma analise mais consistente.

🚀 Seguimos monitorando a conta de perto para identificar os ajustes mais relevantes assim que houver dados suficientes.`;
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

  return sections.join('\n\n');
}
