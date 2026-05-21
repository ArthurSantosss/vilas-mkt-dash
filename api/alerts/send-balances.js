/* global process */

const META_API_BASE = 'https://graph.facebook.com/v22.0';

function parseMoneyFromCents(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed / 100 : 0;
}

function parsePrepayBalanceFromString(str) {
  if (!str) return 0;
  const lower = str.toLowerCase();
  if (!lower.includes('saldo') && !lower.includes('balance')) return 0;

  const match = str.match(/(?:R\$|\$|€|£)?\s*([\d.,]+)/);
  if (!match?.[1]) return 0;

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

function calculateMetaBalance(account) {
  const rawBillingBalance = parseMoneyFromCents(account.balance);
  const spendCap = parseMoneyFromCents(account.spend_cap);
  const amountSpent = parseMoneyFromCents(account.amount_spent);
  const fundingDetails = account.funding_source_details || {};
  const fundingDisplayString = fundingDetails.display_string || '';
  const isPrepayAccount = Boolean(account.is_prepay_account) || fundingDetails.type === 20 || rawBillingBalance < 0;

  let prepaidAvailable = rawBillingBalance < 0 ? Math.abs(rawBillingBalance) : 0;
  const parsedStringBalance = parsePrepayBalanceFromString(fundingDisplayString);
  if (parsedStringBalance > 0) {
    prepaidAvailable = parsedStringBalance;
  } else if (parsedStringBalance === 0 && (fundingDisplayString.toLowerCase().includes('saldo disponível (r$0,00') || fundingDisplayString.toLowerCase().includes('available balance ($0.00'))) {
    prepaidAvailable = 0;
  }

  const remainingSpendCap = spendCap > 0 ? Math.max(0, spendCap - amountSpent) : 0;

  let currentBalance = 0;
  let hasReliableBalance = false;

  if (isPrepayAccount && (fundingDisplayString.toLowerCase().includes('saldo') || fundingDisplayString.toLowerCase().includes('balance'))) {
    currentBalance = prepaidAvailable;
    hasReliableBalance = true;
  } else if (prepaidAvailable > 0) {
    currentBalance = prepaidAvailable;
    hasReliableBalance = true;
  } else if (remainingSpendCap > 0) {
    currentBalance = remainingSpendCap;
    hasReliableBalance = true;
  } else if (isPrepayAccount) {
    currentBalance = 0;
    hasReliableBalance = true;
  }

  return { currentBalance, hasReliableBalance };
}

function isCreditCard(pm) {
  const normalized = String(pm || '').trim().toLowerCase();
  return normalized === 'credit_card' || normalized === 'card' || normalized === 'cartao' || normalized === 'cartão';
}

function getBrasiliaDateLabel() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
}

async function fetchMetaAccounts(token) {
  const url = `${META_API_BASE}/me/adaccounts?access_token=${token}&fields=id,account_id,name,balance,amount_spent,spend_cap,is_prepay_account,funding_source_details&limit=100`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta API ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.data || [];
}

async function fetchPaymentMethods(supabaseUrl, supabaseKey) {
  if (!supabaseUrl || !supabaseKey) {
    return new Map();
  }

  const url = `${supabaseUrl}/rest/v1/account_configs?select=account_id,payment_method`;
  const res = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!res.ok) {
    return new Map();
  }

  const data = await res.json();
  const map = new Map();
  (data || []).forEach((row) => map.set(row.account_id, row.payment_method));
  return map;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const metaToken = process.env.META_ACCESS_TOKEN || process.env.VITE_META_ACCESS_TOKEN;
  const slackWebhook = process.env.SLACK_WEBHOOK_ALERTS || process.env.VITE_SLACK_WEBHOOK_ALERTS;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!metaToken) return res.status(500).json({ error: 'META_ACCESS_TOKEN not configured' });
  if (!slackWebhook) return res.status(500).json({ error: 'SLACK_WEBHOOK_ALERTS not configured' });

  try {
    const [accounts, paymentMethods] = await Promise.all([
      fetchMetaAccounts(metaToken),
      fetchPaymentMethods(supabaseUrl, supabaseKey),
    ]);

    const sorted = accounts
      .map((account) => {
        const paymentMethod = paymentMethods.get(account.id) || paymentMethods.get(account.account_id) || '';
        const { currentBalance, hasReliableBalance } = calculateMetaBalance(account);

        return {
          accountName: account.name || account.id,
          paymentMethod,
          currentBalance,
          hasReliableBalance,
        };
      })
      .sort((a, b) => {
        if (isCreditCard(a.paymentMethod) && !isCreditCard(b.paymentMethod)) return 1;
        if (!isCreditCard(a.paymentMethod) && isCreditCard(b.paymentMethod)) return -1;
        return (a.currentBalance || 0) - (b.currentBalance || 0);
      });

    const lines = sorted.map((account) => {
      if (isCreditCard(account.paymentMethod)) {
        return `:credit_card: *${account.accountName}* — Cartão`;
      }

      const emoji = !account.hasReliableBalance
        ? ':white_circle:'
        : account.currentBalance <= 0
          ? ':red_circle:'
          : account.currentBalance < 50
            ? ':large_orange_circle:'
            : account.currentBalance < 150
              ? ':large_yellow_circle:'
              : ':large_green_circle:';

      if (!account.hasReliableBalance) {
        return `${emoji} *${account.accountName}* — Saldo indisponível`;
      }

      return `${emoji} *${account.accountName}* — R$ ${account.currentBalance.toFixed(2)}`;
    });

    const today = getBrasiliaDateLabel();
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `💰 Saldos das Contas — ${today}`, emoji: true } },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n').slice(0, 3000) } },
      { type: 'divider' },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `_${sorted.length} contas • Vilas MKT Dash_` }] },
    ];

    const slackRes = await fetch(slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });

    if (!slackRes.ok) {
      const errText = await slackRes.text();
      return res.status(502).json({ error: 'Slack webhook failed', details: errText });
    }

    return res.status(200).json({ message: 'OK', accounts_sent: sorted.length });
  } catch (error) {
    console.error('[send-balances] Error:', error);
    return res.status(500).json({ error: 'Internal error', details: String(error) });
  }
}
