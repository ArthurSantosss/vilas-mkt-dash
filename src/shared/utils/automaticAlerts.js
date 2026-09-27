import { isCreditCardPaymentMethod, getAccountPaymentMethod } from './paymentMethod.js';
import { normalizeAutoAlertThresholds } from '../constants/autoAlerts.js';

export function generateAutomaticAlerts({ accounts = [], balances = [], accountAgencies = {}, paymentMethodsMap = {}, thresholds: rawThresholds, now = new Date() }) {
  const thresholds = normalizeAutoAlertThresholds(rawThresholds);
  const balanceMap = new Map(balances.map(balance => [balance.accountId, balance]));
  const alerts = [];

  accounts.forEach(account => {
    const balance = balanceMap.get(account.id);
    const paymentMethod = getAccountPaymentMethod(paymentMethodsMap, account.id, account.accountId) || '';
    const isCard = isCreditCardPaymentMethod(paymentMethod);
    const agency = accountAgencies[account.id] || null;
    const accountName = account.clientName || account.name || account.accountId || account.id;

    // ── 1. Erro no pagamento (cartão com conta desativada) ──
    if (isCard && account.status && account.status !== 'active') {
      alerts.push({
        id: `payment-card-${account.id}`,
        type: 'payment_error',
        severity: 'danger',
        accountId: account.id,
        accountName,
        agency,
        message: 'Possível falha na cobrança do cartão — conta desativada',
        detail: `Status: ${account.status}`,
      });
    }

    // ── 2. Saldo esgotado em conta Pix/Boleto ──
    if (!isCard && balance && balance.hasReliableBalance !== false && balance.currentBalance <= 0) {
      const methodLabel = paymentMethod === 'pix' ? 'Pix' : paymentMethod === 'boleto' ? 'Boleto' : 'Pré-pago';
      alerts.push({
        id: `payment-zero-${account.id}`,
        type: 'payment_error',
        severity: 'danger',
        accountId: account.id,
        accountName,
        agency,
        message: `${methodLabel} — Saldo esgotado (R$ 0,00)`,
        detail: 'Campanhas serão pausadas automaticamente',
      });
    }

    // ── 3. Saldo baixo (apenas contas pré-pagas) ──
    if (!isCard && balance && balance.hasReliableBalance !== false && balance.currentBalance > 0) {
      const bal = balance.currentBalance;
      const days = balance.estimatedDaysRemaining > 0 ? balance.estimatedDaysRemaining.toFixed(0) : null;

      if (bal < thresholds.balance_critical) {
        alerts.push({
          id: `balance-critical-${account.id}`,
          type: 'balance_low',
          severity: 'danger',
          accountId: account.id,
          accountName,
          agency,
          message: `Saldo crítico: R$ ${bal.toFixed(2)}`,
          detail: days ? `~${days} dias restantes • Limite: R$ ${thresholds.balance_critical.toFixed(2)}` : `Limite: R$ ${thresholds.balance_critical.toFixed(2)}`,
          value: bal,
        });
      } else if (bal < thresholds.balance_warning) {
        alerts.push({
          id: `balance-warning-${account.id}`,
          type: 'balance_low',
          severity: 'warning',
          accountId: account.id,
          accountName,
          agency,
          message: `Saldo em atenção: R$ ${bal.toFixed(2)}`,
          detail: days ? `~${days} dias restantes • Limite: R$ ${thresholds.balance_warning.toFixed(2)}` : `Limite: R$ ${thresholds.balance_warning.toFixed(2)}`,
          value: bal,
        });
      }
    }

    // ── 4. Custo por lead alto (baseado no dia de hoje) ──
    const daily = account.dailyMetrics || [];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const todayData = daily.find(day => day.date === today);
    const todaySpend = todayData?.spend || 0;
    const todayMessages = todayData?.messages || 0;
    const todayCostPerLead = todayMessages > 0 ? todaySpend / todayMessages : 0;

    if (todayCostPerLead > 0 && todayCostPerLead >= thresholds.high_cost_lead) {
      const isCritical = todayCostPerLead >= thresholds.high_cost_lead * 1.5;
      alerts.push({
        id: `highcost-${account.id}`,
        type: 'high_cost',
        severity: isCritical ? 'danger' : 'warning',
        accountId: account.id,
        accountName,
        agency,
        message: `Custo por lead hoje: R$ ${todayCostPerLead.toFixed(2)}`,
        detail: `Gasto: R$ ${todaySpend.toFixed(2)} • ${todayMessages} msg • Limite: R$ ${thresholds.high_cost_lead.toFixed(2)}`,
        value: todayCostPerLead,
      });
    }

    // ── 5. Gastando sem gerar mensagens (baseado no dia de hoje) ──
    if (todaySpend > 0 && todayMessages === 0) {
      alerts.push({
        id: `nomsg-${account.id}`,
        type: 'no_messages',
        severity: 'danger',
        accountId: account.id,
        accountName,
        agency,
        message: `Gastou R$ ${todaySpend.toFixed(2)} hoje sem gerar mensagens`,
        detail: 'Verifique configuração de campanha e pixel',
        value: todaySpend,
      });
    }
  });

  // Sort: danger first, then warning
  const priority = { danger: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => priority[a.severity] - priority[b.severity]);

  return alerts;
}
