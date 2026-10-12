import { isCreditCardPaymentMethod, getAccountPaymentMethod } from './paymentMethod.js';
import { normalizeAutoAlertThresholds } from '../constants/autoAlerts.js';

export function localAlertDate(now = new Date(), timeZone = 'America/Bahia') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function shiftAlertDate(date, offset) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function alertPeriods(now, platform = 'meta', thresholds, timeZone = 'America/Bahia') {
  const config = normalizeAutoAlertThresholds(thresholds);
  const today = localAlertDate(now, timeZone);
  const until = shiftAlertDate(today, -(platform === 'google' ? config.google_lag_days + 1 : 1));
  return { today, yesterday: shiftAlertDate(today, -1), until, since: shiftAlertDate(until, -6), previousSince: shiftAlertDate(until, -13), previousUntil: shiftAlertDate(until, -7) };
}

// Pick one consistent result type for the full comparison. Never add aliases.
export function normalizeMetaAlertDays(rows = []) {
  const messageTypes = ['onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d'];
  const leadTypes = ['lead', 'onsite_conversion.lead_grouped'];
  const value = (row, types) => {
    for (const type of types) {
      const action = row.actions?.find(item => item.action_type === type);
      if (action) return Number(action.value) || 0;
    }
    return 0;
  };
  const messaging = rows.some(row => value(row, messageTypes) > 0);
  return rows.map(row => ({ date: row.date_start, spend: Number(row.spend || 0), results: value(row, messaging ? messageTypes : leadTypes), resultLabel: messaging ? 'conversas' : 'leads', impressions: Number(row.impressions || 0) }));
}

export function aggregateAlertDays(days, since, until) {
  return (days || []).filter(day => day.date >= since && day.date <= until).reduce((sum, day) => ({
    spend: sum.spend + Number(day.spend || 0),
    results: sum.results + Number(day.results ?? day.conversions ?? day.messages ?? 0),
  }), { spend: 0, results: 0 });
}

export function generateAutomaticAlerts({ accounts = [], balances = [], accountAgencies = {}, paymentMethodsMap = {}, thresholds: rawThresholds, now = new Date() }) {
  const thresholds = normalizeAutoAlertThresholds(rawThresholds);
  const balanceMap = new Map(balances.map(balance => [balance.accountId, balance]));
  const alerts = [];
  for (const account of accounts) {
    const platform = ['google', 'google_ads'].includes(account.platform) ? 'google' : 'meta';
    const currency = account.currency || 'BRL';
    const money = amount => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount);
    const common = { accountId: account.id, accountName: account.clientName || account.name || account.id, agency: accountAgencies[account.id] || accountAgencies[account.accountId] || null, platform };
    const add = (type, severity, message, detail, value = 0, nextAction = 'Revise a conta na plataforma.') => alerts.push({ ...common, id: `${platform}-${type}-${account.id}`, type, severity, message, detail, value, nextAction });
    // Account status alone does not diagnose payment failure.
    if (['disabled', 'suspended', 'unsettled'].includes(account.status)) {
      add('account_status', 'warning', 'Conta indisponível para veiculação', `Status: ${account.status}. A causa precisa ser conferida.`, 0, 'Confira o diagnóstico da conta e eventuais pendências de acesso ou cobrança.');
    }
    const balance = balanceMap.get(account.id);
    const isCard = isCreditCardPaymentMethod(getAccountPaymentMethod(paymentMethodsMap, account.id, account.accountId));
    if (platform === 'meta' && !isCard && balance && balance.hasReliableBalance === true && !['spend_cap', 'unavailable', 'error'].includes(balance.balanceSource)) {
      const amount = balance.currentBalance;
      if (Number.isFinite(amount) && amount <= 0) add('payment_error', 'danger', 'Saldo disponível esgotado', 'A entrega pode ser interrompida por falta de saldo.', 0, 'Confira o saldo e solicite reposição.');
      else if (currency === 'BRL' && amount < thresholds.balance_warning) add('balance_low', amount < thresholds.balance_critical ? 'danger' : 'warning', `Saldo baixo: ${money(amount)}`, 'Saldo consultado agora; não é limite de gasto.', amount, 'Planeje a reposição antes de interromper a entrega.');
    }
    // Creative fatigue is collected separately (null = not queried / unavailable).
    const tiredAds = platform === 'meta' && Array.isArray(account.creativeFatigue) ? account.creativeFatigue : [];
    if (tiredAds.length > 0) {
      const critical = tiredAds.filter(ad => ad.severity === 'critical').length;
      const plural = tiredAds.length !== 1 ? 's' : '';
      add(
        'creative_fatigue',
        critical > 0 ? 'danger' : 'warning',
        `${tiredAds.length} criativo${plural} cansado${plural}${critical ? ` (${critical} para trocar já)` : ''}`,
        tiredAds.slice(0, 3).map(ad => `${ad.adName}: frequência ${ad.frequency.toFixed(1)}, CTR de link ${ad.ctrChange.toFixed(0)}%`).join(' | '),
        tiredAds.length,
        'Prepare criativos novos para substituir os listados; detalhes na aba Meta Ads ao selecionar a conta.',
      );
    }
    // A successful query over the complete range is required to infer zero results.
    if (!account.insightsComplete) continue;
    const period = alertPeriods(now, platform, thresholds, account.timeZone || 'America/Bahia');
    if (!account.coverage || account.coverage.since > period.previousSince || account.coverage.until < period.until) continue;
    const current = aggregateAlertDays(account.dailyMetrics, period.since, period.until);
    const previous = aggregateAlertDays(account.dailyMetrics, period.previousSince, period.previousUntil);
    const label = platform === 'google' ? 'conversões' : account.dailyMetrics?.[0]?.resultLabel || 'resultados';
    const currentCost = current.results > 0 ? current.spend / current.results : null;
    const previousCost = previous.results > 0 ? previous.spend / previous.results : null;
    const detail = `${period.since} a ${period.until}: ${money(current.spend)} • ${current.results.toLocaleString('pt-BR')} ${label}. Comparação: ${period.previousSince} a ${period.previousUntil}.${platform === 'google' ? ` Excluídos os ${thresholds.google_lag_days} dias completos mais recentes para reduzir efeito do atraso de conversões.` : ''}`;
    const minSpend = currency === 'BRL' ? thresholds.min_spend : (previousCost || Infinity) * thresholds.min_results;
    if (current.spend < minSpend) continue;
    if (current.results === 0 && previous.results >= thresholds.min_results && previousCost > 0 && current.spend >= previousCost * 2) {
      add('no_results', 'danger', `Investimento sem ${label} na janela analisada`, detail, current.spend, `Confira rastreamento e campanhas que consumiram verba. O período anterior teve ${previous.results} ${label}.`);
      continue;
    }
    if (current.results < thresholds.min_results) continue;
    const deterioration = previousCost > 0 && previous.results >= thresholds.min_results ? (currentCost / previousCost - 1) * 100 : null;
    const aboveTarget = currency === 'BRL' && currentCost >= thresholds.high_cost_lead;
    if (deterioration !== null && deterioration >= thresholds.worsening_percent) {
      add('cost_increase', deterioration >= thresholds.worsening_percent * 2 ? 'danger' : 'warning', `Custo por resultado subiu ${deterioration.toFixed(0)}%`, `${money(previousCost)} → ${money(currentCost)}. ${detail}`, currentCost, 'Localize as campanhas que concentram a piora e confira mudanças recentes antes de ajustar orçamento.');
    } else if (aboveTarget) {
      add('high_cost', currentCost >= thresholds.high_cost_lead * 1.5 ? 'danger' : 'warning', `Custo por resultado acima da meta: ${money(currentCost)}`, `Meta: ${money(thresholds.high_cost_lead)}. ${detail}`, currentCost, 'Revise a meta de custo e a distribuição do gasto entre campanhas.');
    }
    const spendRatio = previous.spend > 0 ? current.spend / previous.spend : 0;
    const drop = previous.results > 0 ? (1 - current.results / previous.results) * 100 : 0;
    if (previous.results >= thresholds.min_results && drop >= thresholds.worsening_percent && spendRatio >= 0.8 && spendRatio <= 1.2 && !(deterioration >= thresholds.worsening_percent)) {
      add('results_drop', 'warning', `Queda de ${drop.toFixed(0)}% em ${label} com gasto semelhante`, detail, drop, 'Revise entrega, rastreamento e campanhas com maior perda de volume.');
    }
  }
  const priority = { danger: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => priority[a.severity] - priority[b.severity] || a.accountName.localeCompare(b.accountName));
}
