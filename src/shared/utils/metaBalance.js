function parseMoneyFromCents(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed / 100 : 0;
}

function parsePrepayBalanceFromString(str) {
  if (!str) return 0;
  if (!str.toLowerCase().includes('saldo') && !str.toLowerCase().includes('balance')) return 0;
  
  const match = str.match(/(?:R\$|\$|€|£)?\s*([\d.,]+)/);
  if (match && match[1]) {
    let numStr = match[1];
    if (numStr.includes(',') && numStr.indexOf(',') > numStr.indexOf('.')) {
        numStr = numStr.replace(/\./g, '').replace(',', '.');
    } else if (numStr.includes(',') && numStr.indexOf('.') === -1) {
        numStr = numStr.replace(',', '.');
    } else {
        numStr = numStr.replace(/,/g, '');
    }
    return Number.parseFloat(numStr) || 0;
  }
  return 0;
}

export function calculateMetaBalance(account = {}) {
  const rawBillingBalance = parseMoneyFromCents(account.balance);
  const spendCap = parseMoneyFromCents(account.spend_cap);
  const amountSpent = parseMoneyFromCents(account.amount_spent);

  // funding_source_details pode conter o saldo real da fonte de pagamento
  const fundingDetails = account.funding_source_details || {};
  const fundingCouponAmount = parseMoneyFromCents(fundingDetails.coupon?.amount);
  const fundingDisplayString = fundingDetails.display_string || '';

  let prepaidAvailable = rawBillingBalance < 0 ? Math.abs(rawBillingBalance) : 0;
  
  // Tenta extrair o saldo em tempo real da string "Saldo disponível (R$X,XX)"
  const parsedStringBalance = parsePrepayBalanceFromString(fundingDisplayString);
  if (parsedStringBalance > 0) {
    prepaidAvailable = parsedStringBalance;
  } else if (parsedStringBalance === 0 && (fundingDisplayString.toLowerCase().includes('saldo disponível (r$0,00') || fundingDisplayString.toLowerCase().includes('available balance ($0.00'))) {
    prepaidAvailable = 0;
  }

  const amountDue = rawBillingBalance > 0 ? rawBillingBalance : 0;
  const remainingSpendCap = spendCap > 0 ? Math.max(0, spendCap - amountSpent) : 0;
  const isPrepayAccount = Boolean(account.is_prepay_account) || fundingDetails.type === 20 || rawBillingBalance < 0;

  // Saldo real da conta: prioridade para o prepaid (é o dinheiro na conta).
  // Spend cap é um LIMITE de gasto, não reduz o saldo disponível na conta.
  // Mostramos spend cap remaining separadamente como informação complementar.
  let currentBalance = 0;
  let hasReliableBalance = false;
  let balanceSource = 'unavailable';

  // Se for conta pré-paga clara e tem o display string de saldo, prioriza ele cravado (inclusive se for 0)
  if (isPrepayAccount && (fundingDisplayString.toLowerCase().includes('saldo') || fundingDisplayString.toLowerCase().includes('balance'))) {
    currentBalance = prepaidAvailable;
    hasReliableBalance = true;
    balanceSource = 'prepaid';
  } else if (prepaidAvailable > 0) {
    currentBalance = prepaidAvailable;
    hasReliableBalance = true;
    balanceSource = 'prepaid';
  } else if (fundingCouponAmount > 0) {
    currentBalance = fundingCouponAmount;
    hasReliableBalance = true;
    balanceSource = 'coupon';
  } else if (remainingSpendCap > 0) {
    currentBalance = remainingSpendCap;
    hasReliableBalance = true;
    balanceSource = 'spend_cap';
  } else if (isPrepayAccount) {
     currentBalance = 0;
     hasReliableBalance = true;
     balanceSource = 'prepaid';
  }

  return {
    rawBillingBalance,
    spendCap,
    amountSpent,
    prepaidAvailable,
    amountDue,
    remainingSpendCap,
    currentBalance,
    hasReliableBalance,
    balanceSource,
    isPrepayAccount,
    fundingDisplayString,
  };
}
