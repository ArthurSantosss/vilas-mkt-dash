/**
 * Motor de análise de campanhas — v2 (relativa e adaptativa).
 *
 * A análise é baseada em:
 *   1. Comparação temporal (campanha contra ela mesma — período atual vs anterior)
 *   2. Benchmark interno (campanha vs irmãs da mesma conta)
 *   3. Detecção de padrões e anomalias (tendências diárias)
 *
 * Severidade é derivada da INTENSIDADE da variação, nunca de thresholds fixos.
 *
 * Estrutura preparada para futura substituição por chamada à API do Claude.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(a, b) {
  if (!b || b === 0) return 0;
  return (a / b) * 100;
}

function variation(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function severityFromVariation(variationPct, isHigherWorse = true) {
  // Determines severity based on how intense the variation is.
  // isHigherWorse=true means rising is bad (e.g. CPM, frequency, cost)
  // isHigherWorse=false means rising is good (e.g. CTR, messages)
  const v = isHigherWorse ? variationPct : -variationPct;
  if (v > 50) return 'critical';
  if (v > 20) return 'warning';
  if (v < -20) return 'good'; // significant improvement
  return null; // stable, not worth reporting as standalone
}

function formatR$(v) { return `R$ ${v.toFixed(2)}`; }
function formatPct(v) { return `${v.toFixed(1)}%`; }
function formatVar(v) { return v > 0 ? `+${v.toFixed(0)}%` : `${v.toFixed(0)}%`; }
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

// Extract messages from Meta actions array
function getMessagesFromDaily(d) {
  if (!d.messages && d.actions) {
    const types = [
      'onsite_conversion.messaging_conversation_started_7d',
      'messaging_conversation_started_7d',
      'onsite_conversion.messaging_first_reply',
      'messaging_first_reply',
    ];
    for (const t of types) {
      const found = d.actions.find(a => a.action_type === t);
      if (found) return parseInt(found.value, 10);
    }
    const any = d.actions.find(a => a.action_type?.includes('messaging'));
    return any ? parseInt(any.value, 10) : 0;
  }
  return d.messages || 0;
}

// Compute per-day derived metrics
function enrichDaily(raw) {
  return raw.map(d => {
    const spend = parseFloat(d.spend || 0);
    const imp = parseInt(d.impressions || 0, 10);
    const msgs = typeof d.messages === 'number' ? d.messages : getMessagesFromDaily(d);
    return {
      date: d.date_start || d.date,
      spend,
      impressions: imp,
      cpm: imp > 0 ? (spend / imp) * 1000 : 0,
      ctr: parseFloat(d.ctr || 0),
      reach: parseInt(d.reach || 0, 10),
      frequency: parseFloat(d.frequency || 0),
      messages: msgs,
      costPerMessage: msgs > 0 ? spend / msgs : 0,
    };
  });
}

// Aggregate an array of daily metrics into totals/averages
function aggregateDaily(days) {
  if (!days || days.length === 0) return null;
  const totalSpend = days.reduce((s, d) => s + d.spend, 0);
  const totalImp = days.reduce((s, d) => s + d.impressions, 0);
  const totalReach = days.reduce((s, d) => s + d.reach, 0);
  const totalMsgs = days.reduce((s, d) => s + d.messages, 0);
  return {
    spend: totalSpend,
    impressions: totalImp,
    cpm: totalImp > 0 ? (totalSpend / totalImp) * 1000 : 0,
    ctr: avg(days.map(d => d.ctr).filter(v => v > 0)),
    reach: totalReach,
    frequency: avg(days.map(d => d.frequency).filter(v => v > 0)),
    messages: totalMsgs,
    costPerMessage: totalMsgs > 0 ? totalSpend / totalMsgs : 0,
  };
}

// Find best and worst day for a metric
function findExtremes(days, metricKey) {
  if (!days || days.length < 2) return { best: null, worst: null };
  const valid = days.filter(d => d[metricKey] > 0);
  if (valid.length === 0) return { best: null, worst: null };
  const sorted = [...valid].sort((a, b) => a[metricKey] - b[metricKey]);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

// Detect consecutive days of increase
function consecutiveIncreases(days, metricKey) {
  let maxStreak = 0;
  let streak = 0;
  for (let i = 1; i < days.length; i++) {
    if (days[i][metricKey] > days[i - 1][metricKey] && days[i][metricKey] > 0 && days[i - 1][metricKey] > 0) {
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }
  return maxStreak;
}

// Detect day-over-day spikes (>30% variation)
function detectSpikes(days, metricKey) {
  const spikes = [];
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1][metricKey];
    const curr = days[i][metricKey];
    if (prev > 0 && curr > 0) {
      const change = ((curr - prev) / prev) * 100;
      if (Math.abs(change) > 30) {
        spikes.push({ date: days[i].date, change, value: curr, prevValue: prev });
      }
    }
  }
  return spikes;
}

// Simple linear trend direction over the days
function trendDirection(days, metricKey) {
  const values = days.map(d => d[metricKey]).filter(v => v > 0);
  if (values.length < 3) return 'insufficient';
  const firstHalf = avg(values.slice(0, Math.floor(values.length / 2)));
  const secondHalf = avg(values.slice(Math.floor(values.length / 2)));
  if (firstHalf === 0) return 'insufficient';
  const change = ((secondHalf - firstHalf) / firstHalf) * 100;
  if (change > 10) return 'rising';
  if (change < -10) return 'falling';
  return 'stable';
}

// ─── DIAGNOSTIC BUILDERS ─────────────────────────────────────────────────────

function buildDiag(id, severity, title, metric, value, comparison, description, cause) {
  return { id, severity, title, metric, value, comparison, description, cause };
}

// ─── 1. TEMPORAL COMPARISON ──────────────────────────────────────────────────

function temporalDiagnostics(currentMetrics, prevMetrics, currentDaily, prevDaily) {
  const diagnostics = [];
  if (!prevMetrics) return diagnostics;

  const comparisons = [
    { key: 'cpm', label: 'CPM', fmt: formatR$, higherWorse: true, metric: 'CPM' },
    { key: 'ctr', label: 'CTR', fmt: formatPct, higherWorse: false, metric: 'CTR' },
    { key: 'frequency', label: 'Frequência', fmt: (v) => v.toFixed(1), higherWorse: true, metric: 'Frequência' },
    // Regra de negocio: custo por conversa menor = melhor.
    { key: 'costPerMessage', label: 'Custo por Conversa', fmt: formatR$, higherWorse: true, metric: 'Custo/Conversa' },
    { key: 'messages', label: 'Conversas', fmt: (v) => v.toString(), higherWorse: false, metric: 'Conversas' },
    { key: 'spend', label: 'Gasto', fmt: formatR$, higherWorse: null, metric: 'Gasto' },
  ];

  for (const comp of comparisons) {
    const curr = currentMetrics[comp.key] || 0;
    const prev = prevMetrics[comp.key] || 0;
    if (curr === 0 && prev === 0) continue;

    const v = variation(curr, prev);
    if (v === null) continue;

    // Skip spend (informational only, not inherently good/bad)
    if (comp.higherWorse === null) continue;

    const sev = severityFromVariation(v, comp.higherWorse);
    if (!sev) continue; // stable — not interesting

    // Find best moment in all available daily data
    const allDays = [...(prevDaily || []), ...(currentDaily || [])];
    const bestMetricKey = comp.key;
    const { best } = comp.higherWorse
      ? findExtremes(allDays, bestMetricKey) // for "higher is worse", best = lowest
      : { best: [...allDays].filter(d => d[bestMetricKey] > 0).sort((a, b) => b[bestMetricKey] - a[bestMetricKey])[0] };

    const bestRef = best ? ` Melhor momento: ${comp.fmt(best[bestMetricKey])} em ${formatDate(best.date)}.` : '';

    const direction = v > 0 ? 'subiu' : 'caiu';
    const absV = Math.abs(v);

    let title, description, cause;
    if (sev === 'good') {
      title = `${comp.label} melhorou ${absV.toFixed(0)}%`;
      description = `${comp.label} atual: ${comp.fmt(curr)} — ${direction} ${absV.toFixed(0)}% em relação ao período anterior (${comp.fmt(prev)}).${bestRef}`;
      cause = 'Melhoria em relação ao período anterior.';
    } else {
      title = `${comp.label} piorou ${absV.toFixed(0)}%`;
      description = `${comp.label} atual: ${comp.fmt(curr)} — ${direction} ${absV.toFixed(0)}% vs. período anterior (${comp.fmt(prev)}).${bestRef}`;
      cause = comp.higherWorse
        ? `${comp.label} subindo pode indicar saturação de público, aumento de concorrência ou fadiga de criativo.`
        : `${comp.label} caindo pode indicar perda de relevância do anúncio ou esgotamento do público.`;
    }

    diagnostics.push(buildDiag(
      `temporal-${comp.key}`,
      sev,
      title,
      comp.metric,
      comp.fmt(curr),
      `Período anterior: ${comp.fmt(prev)}`,
      description,
      cause,
    ));
  }

  return diagnostics;
}

// ─── 2. BENCHMARK INTERNO (vs. irmãs) ───────────────────────────────────────

function benchmarkDiagnostics(currentMetrics, siblingCampaigns, campaignId) {
  const diagnostics = [];
  const siblings = siblingCampaigns.filter(c => c.id !== campaignId);
  if (siblings.length === 0) return diagnostics;

  const siblingMetrics = siblings.map(c => c.metrics || {});

  const comparisons = [
    { key: 'cpm', label: 'CPM', fmt: formatR$, higherWorse: true, metric: 'CPM vs. Conta' },
    { key: 'ctr', label: 'CTR', fmt: formatPct, higherWorse: false, metric: 'CTR vs. Conta' },
    { key: 'costPerMessage', label: 'Custo por Conversa', fmt: formatR$, higherWorse: true, metric: 'Custo/Conversa vs. Conta' },
    { key: 'frequency', label: 'Frequência', fmt: (v) => v.toFixed(1), higherWorse: true, metric: 'Frequência vs. Conta' },
  ];

  for (const comp of comparisons) {
    const curr = currentMetrics[comp.key] || 0;
    if (curr === 0) continue;

    const sibValues = siblingMetrics.map(m => m[comp.key] || 0).filter(v => v > 0);
    if (sibValues.length === 0) continue;

    const sibAvg = avg(sibValues);
    if (sibAvg === 0) continue;

    const v = variation(curr, sibAvg);
    if (v === null) continue;

    const sev = severityFromVariation(v, comp.higherWorse);
    if (!sev) continue;

    const direction = comp.higherWorse
      ? (curr > sibAvg ? 'acima' : 'abaixo')
      : (curr > sibAvg ? 'acima' : 'abaixo');

    const absDiff = Math.abs(v);

    let title, description, cause;
    if (sev === 'good') {
      title = `${comp.label} ${absDiff.toFixed(0)}% melhor que a média da conta`;
      description = `${comp.label}: ${comp.fmt(curr)} — ${absDiff.toFixed(0)}% ${direction} da média das outras ${siblings.length} campanhas da conta (${comp.fmt(sibAvg)}).`;
      cause = 'Essa campanha está performando acima das irmãs nessa métrica.';
    } else {
      title = `${comp.label} ${absDiff.toFixed(0)}% pior que a média da conta`;
      description = `${comp.label}: ${comp.fmt(curr)} enquanto a média das outras ${siblings.length} campanhas é ${comp.fmt(sibAvg)} (${absDiff.toFixed(0)}% ${direction}).`;
      cause = `Comparada às demais campanhas da mesma conta, essa está com ${comp.label} pior. Pode indicar problema de segmentação, criativo ou objetivo diferente.`;
    }

    diagnostics.push(buildDiag(
      `benchmark-${comp.key}`,
      sev,
      title,
      comp.metric,
      comp.fmt(curr),
      `Média da conta: ${comp.fmt(sibAvg)}`,
      description,
      cause,
    ));
  }

  return diagnostics;
}

// ─── 3. DETECÇÃO DE PADRÕES E ANOMALIAS ─────────────────────────────────────

function patternDiagnostics(currentMetrics, currentDaily, campaign, videoData) {
  const diagnostics = [];
  if (!currentDaily || currentDaily.length < 2) return diagnostics;

  // 3a. Day-over-day spikes (>30% variation)
  const spikeMetrics = [
    { key: 'cpm', label: 'CPM', fmt: formatR$, higherWorse: true },
    { key: 'costPerMessage', label: 'Custo por Conversa', fmt: formatR$, higherWorse: true },
    { key: 'spend', label: 'Gasto', fmt: formatR$, higherWorse: null },
  ];

  for (const sm of spikeMetrics) {
    const spikes = detectSpikes(currentDaily, sm.key);
    if (spikes.length > 0) {
      // Report the most recent significant spike
      const latest = spikes[spikes.length - 1];
      const dir = latest.change > 0 ? 'alta' : 'queda';
      const severity = Math.abs(latest.change) > 60 ? 'critical' : 'warning';

      if (sm.higherWorse === null && severity === 'warning') continue; // skip mild spend spikes

      diagnostics.push(buildDiag(
        `spike-${sm.key}`,
        severity,
        `${dir === 'alta' ? 'Pico' : 'Queda'} brusca de ${sm.label}`,
        `${sm.label} Anomalia`,
        `${formatVar(latest.change)} em ${formatDate(latest.date)}`,
        `Dia anterior: ${sm.fmt(latest.prevValue)} → ${sm.fmt(latest.value)}`,
        `${sm.label} teve ${dir} de ${Math.abs(latest.change).toFixed(0)}% em ${formatDate(latest.date)} (${sm.fmt(latest.prevValue)} → ${sm.fmt(latest.value)}).`,
        dir === 'alta' && sm.higherWorse
          ? `Picos súbitos podem indicar mudança no leilão, início de concorrência forte ou alteração no público.`
          : `Quedas bruscas podem indicar problema de entrega, alteração na campanha ou mudança de orçamento.`,
      ));
    }
  }

  // 3b. Frequency rising consistently
  const freqTrend = trendDirection(currentDaily, 'frequency');
  if (freqTrend === 'rising') {
    const firstFreq = currentDaily.find(d => d.frequency > 0)?.frequency || 0;
    const lastFreq = [...currentDaily].reverse().find(d => d.frequency > 0)?.frequency || 0;
    if (firstFreq > 0 && lastFreq > firstFreq) {
      const increase = variation(lastFreq, firstFreq);
      diagnostics.push(buildDiag(
        'pattern-freq-rising',
        increase > 40 ? 'critical' : 'warning',
        'Frequência subindo consistentemente',
        'Frequência Tendência',
        `${firstFreq.toFixed(1)} → ${lastFreq.toFixed(1)}`,
        `Início do período → Fim do período`,
        `A frequência subiu de ${firstFreq.toFixed(1)} para ${lastFreq.toFixed(1)} ao longo do período (${formatVar(increase)}). A tendência é consistente, não pontual.`,
        'Frequência subindo dia após dia indica que o público está saturando gradualmente. É hora de renovar criativos ou ampliar audiência, independente do valor absoluto.',
      ));
    }
  }

  // 3c. Budget underdelivery
  const dailyBudget = campaign?.dailyBudget || 0;
  if (dailyBudget > 0 && currentDaily.length >= 2) {
    const avgDailySpend = avg(currentDaily.map(d => d.spend).filter(v => v > 0));
    const utilization = pct(avgDailySpend, dailyBudget);
    if (utilization < 70 && utilization > 0) {
      diagnostics.push(buildDiag(
        'pattern-underdelivery',
        utilization < 40 ? 'critical' : 'warning',
        `Gastando apenas ${utilization.toFixed(0)}% do orçamento diário`,
        'Entrega vs. Orçamento',
        formatR$(avgDailySpend) + '/dia',
        `Orçamento diário: ${formatR$(dailyBudget)}`,
        `Gasto médio diário (${formatR$(avgDailySpend)}) representa apenas ${utilization.toFixed(0)}% do orçamento configurado (${formatR$(dailyBudget)}/dia).`,
        'Entrega abaixo do orçamento indica restrição de público (muito estreito), lance baixo ou problema de qualidade do anúncio.',
      ));
    }
  }

  // 3d. CTR falling while impressions rise
  const ctrTrend = trendDirection(currentDaily, 'ctr');
  const impTrend = trendDirection(currentDaily, 'impressions');
  if (ctrTrend === 'falling' && impTrend === 'rising') {
    const ctrValues = currentDaily.map(d => d.ctr).filter(v => v > 0);
    const impValues = currentDaily.map(d => d.impressions).filter(v => v > 0);
    const ctrDrop = variation(avg(ctrValues.slice(-3)), avg(ctrValues.slice(0, 3)));
    const impRise = variation(avg(impValues.slice(-3)), avg(impValues.slice(0, 3)));

    if (ctrDrop !== null && ctrDrop < -10 && impRise > 10) {
      diagnostics.push(buildDiag(
        'pattern-audience-exhaustion',
        Math.abs(ctrDrop) > 30 ? 'critical' : 'warning',
        'Público esgotando',
        'CTR vs. Impressões',
        `CTR ${formatVar(ctrDrop)}`,
        `Impressões ${formatVar(impRise)} no mesmo período`,
        `CTR caiu ${Math.abs(ctrDrop).toFixed(0)}% enquanto impressões subiram ${impRise.toFixed(0)}%. O público disponível já viu o anúncio e perdeu interesse.`,
        'Quando impressões sobem e CTR cai, o algoritmo está mostrando para mais gente mas com menos relevância. O público precisa ser renovado.',
      ));
    }
  }

  // 3e. Cost per message rising 3+ consecutive days
  const cpmConsecutive = consecutiveIncreases(currentDaily, 'costPerMessage');
  if (cpmConsecutive >= 3) {
    const recentCPM = currentDaily.filter(d => d.costPerMessage > 0);
    const first = recentCPM[0]?.costPerMessage || 0;
    const last = recentCPM[recentCPM.length - 1]?.costPerMessage || 0;
    if (first > 0 && last > first) {
      diagnostics.push(buildDiag(
        'pattern-cpm-consecutive-rise',
        cpmConsecutive >= 5 ? 'critical' : 'warning',
        `Custo por conversa subindo há ${cpmConsecutive}+ dias`,
        'Custo/Conversa Tendência',
        `${formatR$(first)} → ${formatR$(last)}`,
        `${cpmConsecutive}+ dias consecutivos de aumento`,
        `O custo por conversa vem subindo há ${cpmConsecutive}+ dias consecutivos (${formatR$(first)} → ${formatR$(last)}). É uma tendência negativa sustentada.`,
        'Custo subindo por vários dias seguidos indica deterioração gradual — pode ser fadiga do criativo, público saturando ou concorrência aumentando.',
      ));
    }
  }

  // 3f. Video metrics — Hook + Hold combined analysis
  if (videoData) {
    const plays = videoData.plays || 0;
    const p25 = videoData.p25 || 0;
    const p100 = videoData.p100 || 0;

    if (plays > 0) {
      const hookRate = pct(p25, plays);
      const holdRate = pct(p100, plays);

      // Report hook rate with context (use account average if available from siblings)
      if (hookRate > 0) {
        // Hook + Hold both low = creative problem
        if (hookRate < 25 && holdRate < 20) {
          diagnostics.push(buildDiag(
            'pattern-creative-problem',
            'critical',
            'Hook Rate e Hold Rate baixos — problema no criativo',
            'Retenção de Vídeo',
            `Hook: ${formatPct(hookRate)} / Hold: ${formatPct(holdRate)}`,
            `Ambas métricas de retenção fracas`,
            `Hook Rate (${formatPct(hookRate)}) e Hold Rate (${formatPct(holdRate)}) estão ambos baixos. Tanto o início quanto o conteúdo do vídeo falham em reter a audiência.`,
            'Quando ambas métricas estão ruins, o criativo inteiro precisa ser repensado — abordagem, formato, duração e narrativa.',
          ));
        }
        // Hook low but Hold OK = weak opening
        else if (hookRate < 25 && holdRate >= 20) {
          diagnostics.push(buildDiag(
            'pattern-weak-hook',
            'warning',
            'Abertura fraca, conteúdo bom',
            'Hook Rate',
            formatPct(hookRate),
            `Hold Rate: ${formatPct(holdRate)} (quem passa dos primeiros segundos fica)`,
            `Hook Rate baixo (${formatPct(hookRate)}) mas Hold Rate razoável (${formatPct(holdRate)}). Quem passa dos primeiros segundos assiste bem, mas poucos chegam lá.`,
            'O conteúdo do vídeo é bom, mas os primeiros 3 segundos não estão prendendo. Teste aberturas diferentes mantendo o restante.',
          ));
        }
        // Hook OK but Hold low = content doesn't hold
        else if (hookRate >= 25 && holdRate < 20) {
          diagnostics.push(buildDiag(
            'pattern-weak-hold',
            'warning',
            'Boa abertura, conteúdo perde atenção',
            'Hold Rate',
            formatPct(holdRate),
            `Hook Rate: ${formatPct(hookRate)} (abertura funciona)`,
            `Hook Rate ok (${formatPct(hookRate)}) mas Hold Rate baixo (${formatPct(holdRate)}). A abertura prende, mas o conteúdo não mantém o interesse.`,
            'A abertura funciona, mas o vídeo perde a audiência ao longo do tempo. Encurte, adicione cortes dinâmicos ou reformule a narrativa do meio pro final.',
          ));
        }
        // Both good
        else if (hookRate >= 25 && holdRate >= 20) {
          diagnostics.push(buildDiag(
            'pattern-video-good',
            'good',
            'Boa retenção de vídeo',
            'Retenção de Vídeo',
            `Hook: ${formatPct(hookRate)} / Hold: ${formatPct(holdRate)}`,
            `Ambas métricas de retenção positivas`,
            `Hook Rate (${formatPct(hookRate)}) e Hold Rate (${formatPct(holdRate)}) indicam que o vídeo está prendendo e retendo a audiência.`,
            'O criativo de vídeo está funcionando bem para a campanha atual.',
          ));
        }
      }
    }
  }

  return diagnostics;
}

// ─── SUGGESTION GENERATOR (vinculada ao diagnóstico) ─────────────────────────

function generateSuggestions(diagnostics) {
  const suggestions = [];

  for (const diag of diagnostics) {
    if (diag.severity === 'good') continue;

    const sug = suggestionForDiagnostic(diag);
    if (sug) {
      suggestions.push({
        ...sug,
        diagId: diag.id, // reference to originating diagnostic
      });
    }
  }

  // Dedupe by id, keep first (highest severity since diagnostics are sorted)
  const seen = new Set();
  return suggestions.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function suggestionForDiagnostic(diag) {
  const id = diag.id;
  const sev = diag.severity;
  const highPrio = sev === 'critical' ? 'alta' : 'média';

  // Temporal comparisons
  if (id === 'temporal-cpm') return {
    id: 'sug-cpm', priority: highPrio,
    action: 'Otimizar segmentação e testar novos públicos',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'temporal-ctr') return {
    id: 'sug-ctr', priority: highPrio,
    action: 'Revisar copy, CTA e criativo visual',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'temporal-frequency') return {
    id: 'sug-freq', priority: highPrio,
    action: 'Renovar criativos e ampliar público',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'temporal-costPerMessage') return {
    id: 'sug-cpmsg', priority: highPrio,
    action: 'Auditar funil: público → criativo → destino',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'temporal-messages') return {
    id: 'sug-msgs', priority: highPrio,
    action: 'Investigar queda no volume de conversas',
    reason: `${diag.title}. ${diag.cause}`,
  };

  // Benchmarks
  if (id === 'benchmark-cpm') return {
    id: 'sug-bench-cpm', priority: highPrio,
    action: 'Comparar público e criativos com as campanhas de melhor CPM da conta',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'benchmark-ctr') return {
    id: 'sug-bench-ctr', priority: highPrio,
    action: 'Analisar criativos das campanhas com melhor CTR na conta',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'benchmark-costPerMessage') return {
    id: 'sug-bench-cpmsg', priority: highPrio,
    action: 'Replicar estratégia das campanhas com menor custo por conversa',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'benchmark-frequency') return {
    id: 'sug-bench-freq', priority: highPrio,
    action: 'Expandir público para reduzir frequência abaixo das irmãs',
    reason: `${diag.title}. ${diag.cause}`,
  };

  // Patterns
  if (id.startsWith('spike-')) return {
    id: `sug-${id}`, priority: sev === 'critical' ? 'alta' : 'média',
    action: 'Investigar anomalia e verificar se houve alteração na campanha ou leilão',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'pattern-freq-rising') return {
    id: 'sug-freq-trend', priority: highPrio,
    action: 'Preparar novos criativos e considerar ampliar público',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'pattern-underdelivery') return {
    id: 'sug-underdelivery', priority: highPrio,
    action: 'Ampliar público, aumentar lance ou revisar qualidade do anúncio',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'pattern-audience-exhaustion') return {
    id: 'sug-audience', priority: 'alta',
    action: 'Renovar segmentação e excluir públicos saturados',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'pattern-cpm-consecutive-rise') return {
    id: 'sug-cpm-streak', priority: 'alta',
    action: 'Ação urgente: testar novos criativos e públicos para reverter tendência',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'pattern-creative-problem') return {
    id: 'sug-creative', priority: 'alta',
    action: 'Refazer o criativo de vídeo — abertura, conteúdo e formato',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'pattern-weak-hook') return {
    id: 'sug-hook', priority: 'média',
    action: 'Testar 2-3 variações de abertura do vídeo (primeiros 3 segundos)',
    reason: `${diag.title}. ${diag.cause}`,
  };
  if (id === 'pattern-weak-hold') return {
    id: 'sug-hold', priority: 'média',
    action: 'Encurtar o vídeo ou adicionar elementos dinâmicos no meio e final',
    reason: `${diag.title}. ${diag.cause}`,
  };

  return null;
}

// ─── CLIENT TEXT GENERATOR ───────────────────────────────────────────────────

function generateClientText(campaignName, currentMetrics, prevMetrics, diagnostics, periodLabel) {
  const spend = currentMetrics.spend || 0;
  const impressions = currentMetrics.impressions || 0;
  const reach = currentMetrics.reach || 0;
  const messages = currentMetrics.messages || 0;
  const costPerMsg = currentMetrics.costPerMessage || 0;

  const goods = diagnostics.filter(d => d.severity === 'good');
  const issues = diagnostics.filter(d => d.severity !== 'good');

  let text = `📊 *Relatório da campanha "${campaignName}"*\n`;
  text += `📅 Período: ${periodLabel}\n\n`;

  // Main numbers
  text += `💰 *Investimento:* ${formatR$(spend)}`;
  if (prevMetrics && prevMetrics.spend > 0) {
    const spendVar = variation(spend, prevMetrics.spend);
    if (spendVar !== null) text += ` (${formatVar(spendVar)} vs. período anterior)`;
  }
  text += '\n';

  if (reach > 0) text += `👥 *Pessoas alcançadas:* ${reach.toLocaleString('pt-BR')}\n`;
  if (impressions > 0) text += `👁 *Impressões:* ${impressions.toLocaleString('pt-BR')}\n`;
  if (messages > 0) {
    text += `💬 *Conversas iniciadas:* ${messages}`;
    if (prevMetrics && prevMetrics.messages > 0) {
      const msgVar = variation(messages, prevMetrics.messages);
      if (msgVar !== null) text += ` (${formatVar(msgVar)} vs. anterior)`;
    }
    text += '\n';
  }
  if (costPerMsg > 0) {
    text += `📩 *Custo por conversa:* ${formatR$(costPerMsg)}`;
    if (prevMetrics && prevMetrics.costPerMessage > 0) {
      const cpmVar = variation(costPerMsg, prevMetrics.costPerMessage);
      if (cpmVar !== null) text += ` (${formatVar(cpmVar)} vs. anterior)`;
    }
    text += '\n';
  }
  text += '\n';

  // What's going well
  if (goods.length > 0) {
    text += `✅ *O que está indo bem:*\n`;
    for (const g of goods.slice(0, 3)) {
      text += `• ${g.title}\n`;
    }
    text += '\n';
  }

  // What's being adjusted (softer tone for client)
  if (issues.length > 0) {
    text += `🔧 *O que estamos otimizando:*\n`;
    for (const issue of issues.slice(0, 3)) {
      text += `• ${getSoftClientDescription(issue)}\n`;
    }
    text += '\n';
  }

  text += `📈 Estamos acompanhando a campanha de perto e fazendo os ajustes necessários para maximizar seus resultados. Qualquer dúvida, estou à disposição!`;

  return text;
}

function getSoftClientDescription(diag) {
  // Map pattern IDs to client-friendly language
  const id = diag.id;
  if (id.includes('cpm') || id.includes('CPM')) return 'Ajustando a segmentação para alcançar pessoas com mais eficiência';
  if (id.includes('freq') || id.includes('Freq')) return 'Renovando os criativos para manter o engajamento alto';
  if (id.includes('ctr') || id.includes('CTR') || id.includes('audience')) return 'Renovando o público para manter o interesse na campanha';
  if (id.includes('costPerMessage') || id.includes('cpmsg')) return 'Otimizando a jornada de conversão para reduzir o custo por mensagem';
  if (id.includes('creative') || id.includes('hook') || id.includes('hold') || id.includes('video')) return 'Aprimorando o conteúdo de vídeo para melhor retenção';
  if (id.includes('underdelivery') || id.includes('budget')) return 'Ajustando a configuração para garantir entrega completa do orçamento';
  if (id.includes('spike')) return 'Investigando e ajustando variações pontuais nas métricas';
  if (id.includes('messages') || id.includes('msgs')) return 'Trabalhando para aumentar o volume de conversas';
  return diag.title;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Analisa uma campanha com análise relativa e adaptativa.
 *
 * @param {Object} params
 * @param {string} params.campaignName
 * @param {Object} params.metrics – métricas agregadas do período atual
 * @param {Array}  params.dailyMetrics – dados diários do período atual
 * @param {Array}  params.prevDailyMetrics – dados diários do período anterior (para comparação temporal)
 * @param {Array}  params.siblingCampaigns – todas as campanhas ativas da mesma conta (para benchmark)
 * @param {string} params.campaignId – ID da campanha selecionada
 * @param {Object|null} params.videoData – { plays, p25, p50, p75, p100 }
 * @param {Object|null} params.campaign – { dailyBudget, objective }
 * @param {string} params.periodLabel
 *
 * @returns {{ diagnostics: Array, suggestions: Array, clientText: string }}
 */
export function analyzeCampaign({
  campaignName, metrics, dailyMetrics, prevDailyMetrics,
  siblingCampaigns, campaignId, videoData, campaign, periodLabel,
}) {
  const currentDaily = enrichDaily(dailyMetrics || []);
  const prevDaily = enrichDaily(prevDailyMetrics || []);

  const currentAgg = currentDaily.length > 0 ? aggregateDaily(currentDaily) : metrics;
  const prevAgg = prevDaily.length > 0 ? aggregateDaily(prevDaily) : null;

  // Use provided metrics as base, overlay with aggregated if richer
  const finalMetrics = { ...metrics };
  if (currentAgg) {
    // Prefer aggregated values for metrics that might be zero in the provided metrics
    for (const key of Object.keys(currentAgg)) {
      if ((finalMetrics[key] === 0 || finalMetrics[key] === undefined) && currentAgg[key] > 0) {
        finalMetrics[key] = currentAgg[key];
      }
    }
  }

  const diagnostics = [];

  // 1. Temporal comparison
  diagnostics.push(...temporalDiagnostics(finalMetrics, prevAgg, currentDaily, prevDaily));

  // 2. Benchmark vs siblings
  diagnostics.push(...benchmarkDiagnostics(finalMetrics, siblingCampaigns || [], campaignId));

  // 3. Patterns and anomalies
  diagnostics.push(...patternDiagnostics(finalMetrics, currentDaily, campaign, videoData));

  // Sort: critical → warning → good
  const order = { critical: 0, warning: 1, good: 2 };
  diagnostics.sort((a, b) => order[a.severity] - order[b.severity]);

  const suggestions = generateSuggestions(diagnostics);
  const clientText = generateClientText(campaignName, finalMetrics, prevAgg, diagnostics, periodLabel);

  return { diagnostics, suggestions, clientText };
}
