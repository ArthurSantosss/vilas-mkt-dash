import { analyzeCampaign as analyzeLocalCampaign } from './campaignAnalysis';

const severityOrder = { critico: 0, atencao: 1, positivo: 2 };

function formatCurrency(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function percentChange(current, previous) {
  if (!previous || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function normalizePriority(priority) {
  if (priority === 'média') return 'media';
  return priority || 'media';
}

function buildEntityLabel(accountName, campaignName) {
  if (campaignName) return `A campanha ${campaignName}`;
  return `A conta ${accountName || 'selecionada'}`;
}

function buildSummary({ accountName, campaignName, metrics, previousMetrics, diagnostics }) {
  const entityLabel = buildEntityLabel(accountName, campaignName);
  const spend = metrics?.spend || 0;
  const messages = metrics?.messages || 0;
  const costPerMessage = metrics?.costPerMessage || 0;
  const costChange = percentChange(costPerMessage, previousMetrics?.costPerMessage || 0);
  const messageChange = percentChange(messages, previousMetrics?.messages || 0);
  const topSeverity = diagnostics[0]?.severidade;

  let summary = `${entityLabel} investiu ${formatCurrency(spend)} e gerou ${messages} conversas`;
  if (costPerMessage > 0) {
    summary += `, com custo medio de ${formatCurrency(costPerMessage)} por conversa.`;
  } else {
    summary += '.';
  }

  if (costChange !== null) {
    const direction = costChange > 0 ? 'subiu' : 'caiu';
    summary += ` No comparativo com o periodo anterior, o custo por conversa ${direction} ${Math.abs(costChange).toFixed(0)}%.`;
  } else if (messageChange !== null) {
    const direction = messageChange > 0 ? 'subiu' : 'caiu';
    summary += ` O volume de conversas ${direction} ${Math.abs(messageChange).toFixed(0)}% versus o periodo anterior.`;
  }

  if (topSeverity === 'critico') {
    summary += ' O principal foco agora e corrigir os gargalos de eficiencia que apareceram no periodo.';
  } else if (topSeverity === 'positivo') {
    summary += ' Os sinais principais sao positivos, mas ainda vale acompanhar consistencia e escala.';
  }

  return summary;
}

function normalizeDailyMetrics(dailyMetrics = []) {
  return dailyMetrics.map((item) => ({
    date: item.date || item.date_start || item.dateLabel || '',
    spend: Number(item.spend || 0),
    impressions: Number(item.impressions || 0),
    reach: Number(item.reach || 0),
    ctr: Number(item.ctr || 0),
    frequency: Number(item.frequency || 0),
    messages: Number(item.messages ?? item.conversas ?? 0),
  }));
}

function buildBreakdownInsight(title, segments = []) {
  if (!segments.length) return null;

  const valid = segments
    .filter((segment) => (segment.messages || 0) > 0 || (segment.impressions || 0) > 0)
    .map((segment) => ({
      ...segment,
      costPerMessage: Number(segment.costPerMessage || 0),
      messages: Number(segment.messages || 0),
      impressions: Number(segment.impressions || 0),
    }));

  if (!valid.length) return null;

  const ranked = [...valid].sort((a, b) => {
    if ((b.messages || 0) !== (a.messages || 0)) return (b.messages || 0) - (a.messages || 0);
    return (b.impressions || 0) - (a.impressions || 0);
  });

  const top = ranked[0];
  const totalMessages = ranked.reduce((sum, item) => sum + (item.messages || 0), 0);
  const share = totalMessages > 0 ? (top.messages / totalMessages) * 100 : 0;

  if (share >= 55 && top.messages > 0) {
    return `${title}: ${top.label || top.name} concentra ${share.toFixed(0)}% das conversas do periodo.`;
  }

  if (top.impressions > 0 && totalMessages === 0) {
    return `${title}: ${top.label || top.name} lidera em volume de entrega dentro do periodo analisado.`;
  }

  const cheapest = ranked
    .filter((item) => item.costPerMessage > 0)
    .sort((a, b) => a.costPerMessage - b.costPerMessage)[0];

  if (cheapest && cheapest !== top) {
    return `${title}: ${cheapest.label || cheapest.name} tem o melhor custo por conversa (${formatCurrency(cheapest.costPerMessage)}).`;
  }

  return null;
}

function buildTrendInsight(dailyMetrics = []) {
  const valid = dailyMetrics.filter((item) => item.messages > 0 || item.spend > 0);
  if (valid.length < 4) return null;

  const pivot = Math.floor(valid.length / 2);
  const firstHalf = valid.slice(0, pivot);
  const secondHalf = valid.slice(pivot);
  const firstMessages = firstHalf.reduce((sum, item) => sum + item.messages, 0);
  const secondMessages = secondHalf.reduce((sum, item) => sum + item.messages, 0);
  const firstSpend = firstHalf.reduce((sum, item) => sum + item.spend, 0);
  const secondSpend = secondHalf.reduce((sum, item) => sum + item.spend, 0);

  if (firstMessages <= 0 || secondMessages <= 0) return null;

  const firstCost = firstSpend / firstMessages;
  const secondCost = secondSpend / secondMessages;
  const delta = percentChange(secondCost, firstCost);

  if (delta === null || Math.abs(delta) < 15) return null;

  if (delta > 0) {
    return `Tendencia diaria: a segunda metade do periodo ficou ${Math.abs(delta).toFixed(0)}% mais cara por conversa do que a primeira.`;
  }

  return `Tendencia diaria: a segunda metade do periodo ficou ${Math.abs(delta).toFixed(0)}% mais eficiente por conversa do que a primeira.`;
}

function ensureMinimumDiagnostics(diagnostics, metrics, accountName, campaignName) {
  const items = [...diagnostics];

  if (items.length < 2 && (metrics?.messages || 0) > 0) {
    items.push({
      titulo: 'Volume de conversas no periodo',
      severidade: metrics.costPerMessage > 0 ? 'positivo' : 'atencao',
      analise: `${buildEntityLabel(accountName, campaignName)} gerou ${metrics.messages} conversas com investimento de ${formatCurrency(metrics.spend || 0)}.`,
      impacto: metrics.costPerMessage > 0
        ? `Custo atual por conversa: ${formatCurrency(metrics.costPerMessage)}.`
        : 'Vale acompanhar a qualidade das conversas antes de escalar.',
    });
  }

  if (items.length < 2) {
    items.push({
      titulo: 'Leitura geral do periodo',
      severidade: 'atencao',
      analise: 'Os dados disponiveis sao suficientes para uma leitura inicial, mas ainda faltam sinais fortes para cravar um unico gargalo.',
      impacto: 'O ideal e acompanhar mais alguns dias para validar tendencia e consistencia.',
    });
  }

  return items.sort((a, b) => severityOrder[a.severidade] - severityOrder[b.severidade]).slice(0, 6);
}

function mapLocalDiagnostics(localDiagnostics = []) {
  return localDiagnostics.map((diagnostic) => ({
    titulo: diagnostic.title,
    severidade: diagnostic.severity === 'critical'
      ? 'critico'
      : diagnostic.severity === 'good'
        ? 'positivo'
        : 'atencao',
    analise: diagnostic.cause
      ? `${diagnostic.description} ${diagnostic.cause}`
      : diagnostic.description,
    impacto: diagnostic.comparison || diagnostic.value || '',
  }));
}

function mapLocalSuggestions(localSuggestions = []) {
  return localSuggestions.slice(0, 5).map((suggestion) => ({
    acao: suggestion.action,
    motivo: suggestion.reason,
    prioridade: normalizePriority(suggestion.priority),
    dificuldade: suggestion.priority === 'alta' ? 'medio' : 'facil',
  }));
}

function buildGenericDiagnostics({ accountName, campaignName, metrics, previousMetrics, breakdowns, videoData }) {
  const diagnostics = [];
  const entityLabel = buildEntityLabel(accountName, campaignName);
  const costChange = percentChange(metrics?.costPerMessage || 0, previousMetrics?.costPerMessage || 0);
  const messageChange = percentChange(metrics?.messages || 0, previousMetrics?.messages || 0);
  const frequency = Number(metrics?.frequency || 0);
  const ctr = Number(metrics?.ctr || 0);

  if (costChange !== null && Math.abs(costChange) >= 12) {
    diagnostics.push({
      titulo: costChange > 0 ? 'Custo por conversa pressionado' : 'Custo por conversa mais eficiente',
      severidade: costChange > 30 ? 'critico' : costChange > 0 ? 'atencao' : 'positivo',
      analise: `${entityLabel} mudou o custo por conversa em ${Math.abs(costChange).toFixed(0)}% contra o periodo anterior.`,
      impacto: `Saiu de ${formatCurrency(previousMetrics.costPerMessage)} para ${formatCurrency(metrics.costPerMessage)} por conversa.`,
    });
  }

  if (messageChange !== null && Math.abs(messageChange) >= 15) {
    diagnostics.push({
      titulo: messageChange > 0 ? 'Volume de conversas em alta' : 'Volume de conversas em queda',
      severidade: messageChange < -30 ? 'critico' : messageChange < 0 ? 'atencao' : 'positivo',
      analise: `O volume de conversas variou ${Math.abs(messageChange).toFixed(0)}% frente ao periodo anterior.`,
      impacto: `Saiu de ${previousMetrics.messages || 0} para ${metrics.messages || 0} conversas no periodo.`,
    });
  }

  if (frequency >= 3) {
    diagnostics.push({
      titulo: 'Frequencia elevada na entrega',
      severidade: frequency >= 4 ? 'critico' : 'atencao',
      analise: `A frequencia atual esta em ${frequency.toFixed(1)}, sinal de repeticao forte para o mesmo publico.`,
      impacto: 'Esse padrao costuma encarecer o leilao e reduzir a taxa de resposta ao criativo.',
    });
  }

  if (ctr > 0 && ctr < 1) {
    diagnostics.push({
      titulo: 'CTR abaixo do ideal',
      severidade: ctr < 0.7 ? 'critico' : 'atencao',
      analise: `O CTR atual esta em ${formatPct(ctr)}, sinal de atracao abaixo do esperado no anuncio.`,
      impacto: 'CTR fraco tende a pressionar CPM e custo por conversa ao longo dos proximos dias.',
    });
  }

  const platformSegments = breakdowns?.platform || [];
  const cheapestPlatform = [...platformSegments]
    .filter((segment) => (segment.messages || 0) > 0 && (segment.costPerMessage || 0) > 0)
    .sort((a, b) => a.costPerMessage - b.costPerMessage)[0];
  const expensivePlatform = [...platformSegments]
    .filter((segment) => (segment.messages || 0) > 0 && (segment.costPerMessage || 0) > 0)
    .sort((a, b) => b.costPerMessage - a.costPerMessage)[0];

  if (cheapestPlatform && expensivePlatform && cheapestPlatform !== expensivePlatform) {
    const ratio = expensivePlatform.costPerMessage / cheapestPlatform.costPerMessage;
    if (ratio >= 1.5) {
      diagnostics.push({
        titulo: 'Diferenca relevante entre plataformas',
        severidade: ratio >= 2.2 ? 'critico' : 'atencao',
        analise: `${cheapestPlatform.label} esta mais eficiente que ${expensivePlatform.label} na captura de conversas.`,
        impacto: `${cheapestPlatform.label}: ${formatCurrency(cheapestPlatform.costPerMessage)} por conversa vs ${formatCurrency(expensivePlatform.costPerMessage)} em ${expensivePlatform.label}.`,
      });
    }
  }

  if (videoData?.plays > 0) {
    const hookRate = Number(videoData.hookRate || 0);
    const holdRate = Number(videoData.holdRate || 0);

    if (hookRate > 0 && holdRate > 0 && (hookRate < 25 || holdRate < 15)) {
      diagnostics.push({
        titulo: 'Retencao de video pedindo ajuste',
        severidade: hookRate < 18 || holdRate < 10 ? 'critico' : 'atencao',
        analise: `Hook rate em ${formatPct(hookRate)} e hold rate em ${formatPct(holdRate)} mostram perda de atencao cedo demais no video.`,
        impacto: 'Quando a retencao cai cedo, o algoritmo perde sinal de qualidade e o custo tende a subir.',
      });
    }
  }

  return diagnostics;
}

function buildGenericActions(diagnostics = []) {
  const actions = [];

  diagnostics.forEach((diagnostic) => {
    if (diagnostic.titulo.includes('Custo por conversa')) {
      actions.push({
        acao: 'Revisar segmentacao e redistribuir verba para os conjuntos mais eficientes',
        motivo: 'O custo por conversa saiu do ponto ideal e precisa de ajuste de alocacao para voltar a ganhar eficiencia.',
        prioridade: diagnostic.severidade === 'critico' ? 'alta' : 'media',
        dificuldade: 'medio',
      });
    }

    if (diagnostic.titulo.includes('Frequencia')) {
      actions.push({
        acao: 'Subir novas variacoes de criativo e abrir publico complementar',
        motivo: 'Frequencia alta costuma indicar saturacao; renovar anuncio e publico ajuda a aliviar o leilao.',
        prioridade: 'alta',
        dificuldade: 'medio',
      });
    }

    if (diagnostic.titulo.includes('CTR')) {
      actions.push({
        acao: 'Testar nova promessa, gancho e CTA no criativo',
        motivo: 'CTR baixo sugere que a oferta nao esta chamando clique suficiente para sustentar a entrega.',
        prioridade: 'alta',
        dificuldade: 'facil',
      });
    }

    if (diagnostic.titulo.includes('plataformas')) {
      actions.push({
        acao: 'Ajustar posicionamentos priorizando a plataforma com melhor custo por conversa',
        motivo: 'A leitura por plataforma mostra que parte da verba pode estar indo para inventario menos eficiente.',
        prioridade: 'media',
        dificuldade: 'facil',
      });
    }

    if (diagnostic.titulo.includes('video')) {
      actions.push({
        acao: 'Trocar a abertura do video e encurtar os primeiros segundos',
        motivo: 'Melhorar retencao inicial ajuda a aumentar sinal de qualidade e reduzir desperdicio de impressao.',
        prioridade: 'media',
        dificuldade: 'medio',
      });
    }
  });

  if (!actions.length) {
    actions.push({
      acao: 'Manter monitoramento diario e registrar mudancas de criativo, verba e publico',
      motivo: 'Sem um gargalo unico dominante, o melhor proximo passo e acompanhar consistencia e reagir rapido a novas variacoes.',
      prioridade: 'media',
      dificuldade: 'facil',
    });
  }

  const seen = new Set();
  return actions.filter((action) => {
    if (seen.has(action.acao)) return false;
    seen.add(action.acao);
    return true;
  }).slice(0, 5);
}

export function buildDetailedViewFallbackAnalysis({
  accountName,
  campaignName,
  metrics,
  previousMetrics,
  breakdowns,
  videoData,
  dailyMetrics,
  siblingCampaigns,
  campaignId,
  campaign,
}) {
  const normalizedDailyMetrics = normalizeDailyMetrics(dailyMetrics);

  let diagnostics;
  let actions;

  if (campaignName) {
    const localResult = analyzeLocalCampaign({
      campaignName,
      metrics,
      dailyMetrics: normalizedDailyMetrics,
      siblingCampaigns,
      campaignId,
      videoData,
      campaign,
      periodLabel: '',
    });

    diagnostics = mapLocalDiagnostics(localResult.diagnostics);
    actions = mapLocalSuggestions(localResult.suggestions);
  } else {
    diagnostics = buildGenericDiagnostics({
      accountName,
      campaignName,
      metrics,
      previousMetrics,
      breakdowns,
      videoData,
    });
    actions = buildGenericActions(diagnostics);
  }

  diagnostics = ensureMinimumDiagnostics(diagnostics, metrics, accountName, campaignName);

  const insights = [
    buildBreakdownInsight('Plataformas', breakdowns?.platform),
    buildBreakdownInsight('Faixa etaria', breakdowns?.age),
    buildBreakdownInsight('Genero', breakdowns?.gender),
    buildBreakdownInsight('Regioes', breakdowns?.region),
    buildTrendInsight(normalizedDailyMetrics),
  ].filter(Boolean).slice(0, 4);

  if (!insights.length) {
    insights.push('Os dados atuais mostram o retrato do periodo, mas ainda sem um padrao oculto forte alem das metricas principais.');
  }

  return {
    resumo: buildSummary({
      accountName,
      campaignName,
      metrics,
      previousMetrics,
      diagnostics,
    }),
    diagnosticos: diagnostics,
    acoes: actions,
    insights,
  };
}
