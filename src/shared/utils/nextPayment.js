export const billingFrequencyOptions = [
  { value: 'weekly', label: 'Semanal', days: 7 },
  { value: 'biweekly', label: 'Quinzenal', days: 15 },
  { value: 'monthly', label: 'Mensal', days: 30 },
];

export function getNextPaymentDate(lastPaymentStr, frequency) {
  if (!lastPaymentStr) return null;
  const freqObj = billingFrequencyOptions.find(f => f.value === frequency);
  if (!freqObj) return null;

  const last = new Date(lastPaymentStr + 'T00:00:00');
  if (isNaN(last.getTime())) return null;

  const next = new Date(last);
  if (frequency === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else {
    next.setDate(next.getDate() + freqObj.days);
  }
  return next;
}

export function getDaysUntil(dateObj) {
  if (!dateObj) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((dateObj - today) / 86400000);
}

export function formatDateBR(dateObj) {
  if (!dateObj) return '—';
  return dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function readSavedLastPayments() {
  try {
    return JSON.parse(localStorage.getItem('account_last_payments') || '{}');
  } catch {
    return {};
  }
}

export function readSavedBillingFrequencies() {
  try {
    return JSON.parse(localStorage.getItem('account_billing_frequencies') || '{}');
  } catch {
    return {};
  }
}

export function readSavedNextPaymentOverrides() {
  try {
    return JSON.parse(localStorage.getItem('account_next_payment_overrides') || '{}');
  } catch {
    return {};
  }
}

export function parseDateInput(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateInput(dateObj) {
  if (!dateObj) return '';
  const local = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
