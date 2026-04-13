export function isCreditCardPaymentMethod(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'credit_card' || normalized === 'card' || normalized === 'cartao' || normalized === 'cartão';
}

function buildPaymentMethodCandidates(keys) {
  const seen = new Set();
  const candidates = [];

  keys.forEach((key) => {
    const value = String(key || '').trim();
    if (!value) return;

    const variations = [
      value,
      value.replace(/^act_/, ''),
      value.startsWith('act_') ? value : `act_${value}`,
    ];

    variations.forEach((candidate) => {
      if (!candidate || seen.has(candidate)) return;
      seen.add(candidate);
      candidates.push(candidate);
    });
  });

  return candidates;
}

export function getAccountPaymentMethod(paymentMethods, ...keys) {
  const map = paymentMethods && typeof paymentMethods === 'object' ? paymentMethods : {};

  for (const candidate of buildPaymentMethodCandidates(keys)) {
    if (Object.prototype.hasOwnProperty.call(map, candidate)) {
      return map[candidate];
    }
  }

  return '';
}

export function readSavedPaymentMethods() {
  try {
    return JSON.parse(localStorage.getItem('account_payment_methods') || '{}');
  } catch {
    return {};
  }
}
