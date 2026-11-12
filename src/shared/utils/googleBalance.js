import { getNextPaymentDate, getDaysUntil, parseDateInput } from './nextPayment.js';

/**
 * A API do Google Ads não expõe o saldo pré-pago (Pix/boleto). O usuário informa o saldo
 * visto no Google numa data, e o painel desconta o gasto real feito depois daquele dia.
 */
export const GOOGLE_MANUAL_BALANCES_KEY = 'google_account_manual_balances';
export const GOOGLE_NEXT_PAYMENT_OVERRIDES_KEY = 'google_account_next_payment_overrides';

function readMap(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(key, next) {
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* modo privado: fica só nesta sessão */ }
  // Mesmo evento de cloudBackup: as telas abertas e a sincronização com a nuvem reagem a ele.
  window.dispatchEvent(new CustomEvent('local-storage-map-updated', { detail: { key, value: next } }));
}

export function readGoogleManualBalances() {
  return readMap(GOOGLE_MANUAL_BALANCES_KEY);
}

/** `entry`: { amount, date: 'YYYY-MM-DD' } ou null para remover. */
export function saveGoogleManualBalance(accountId, entry) {
  const next = { ...readGoogleManualBalances() };
  if (entry && Number.isFinite(Number(entry.amount)) && entry.date) {
    next[accountId] = { amount: Math.round(Number(entry.amount) * 100) / 100, date: entry.date };
  } else {
    delete next[accountId];
  }
  writeMap(GOOGLE_MANUAL_BALANCES_KEY, next);
}

export function readGoogleNextPaymentOverrides() {
  return readMap(GOOGLE_NEXT_PAYMENT_OVERRIDES_KEY);
}

export function saveGoogleNextPaymentOverride(accountId, dateStr) {
  const next = { ...readGoogleNextPaymentOverrides() };
  if (dateStr) next[accountId] = dateStr;
  else delete next[accountId];
  writeMap(GOOGLE_NEXT_PAYMENT_OVERRIDES_KEY, next);
}

/**
 * Junta o retorno da API com o saldo informado. O orçamento de conta aprovado (API) tem
 * prioridade; sem ele, usa o saldo informado menos o gasto feito depois da data informada.
 */
export function applyManualGoogleBalance(data, manual) {
  if (!data) return data;
  if (data.balanceSource === 'account_budget' || !manual) return data;
  const spentAfter = data.balanceSince === manual.date ? Number(data.spentSinceBalance || 0) : null;
  if (spentAfter === null) return data; // consulta ainda não refeita para a data atual
  const currentBalance = Math.max(0, Number(manual.amount) - spentAfter);
  const avg = Number(data.avgDailySpend7d || 0);
  return {
    ...data,
    currentBalance,
    creditLimit: Number(manual.amount),
    estimatedDaysRemaining: avg > 0 ? currentBalance / avg : 0,
    hasReliableBalance: true,
    balanceSource: 'manual',
    informedBalance: Number(manual.amount),
    informedDate: manual.date,
    spentSinceBalance: spentAfter,
  };
}

/** Saldo dividido pelos dias até o próximo pagamento (mínimo 1 dia). */
export function splitBalanceUntil(balance, days) {
  if (!(balance > 0) || days === null || days === undefined) return null;
  const divisor = Math.max(days, 1);
  return { days, divisor, daily: balance / divisor, overdue: days < 0 };
}

export const GOOGLE_PAYMENT_METHODS_KEY = 'google_account_payment_methods';
export const GOOGLE_LAST_PAYMENTS_KEY = 'google_account_last_payments';
export const GOOGLE_BILLING_FREQUENCIES_KEY = 'google_account_billing_frequencies';

/**
 * Próximo pagamento e saldo por dia de uma conta Google (mesma regra da aba Meta Ads):
 * só Pix/boleto têm data; a data manual tem prioridade sobre último pagamento + frequência.
 */
export function resolveGooglePayment({ accountId, paymentMethods, lastPayments, frequencies, overrides, balance }) {
  const method = paymentMethods?.[accountId] || 'credit_card';
  const prepaid = method === 'pix' || method === 'boleto';
  if (!prepaid) return { method, prepaid };
  const computedDate = getNextPaymentDate(lastPayments?.[accountId] || '', frequencies?.[accountId] || 'monthly');
  const overrideDate = parseDateInput(overrides?.[accountId] || '');
  const effective = overrideDate || computedDate;
  const days = getDaysUntil(effective);
  const hasBalance = balance && balance.hasReliableBalance !== false && balance.currentBalance > 0;
  return {
    method, prepaid, computedDate, overrideDate, effective, days,
    split: hasBalance && effective ? splitBalanceUntil(balance.currentBalance, days) : null,
  };
}
