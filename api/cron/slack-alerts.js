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

  return { currentBalance, hasReliableBalance, isPrepayAccount };
}

function isCreditCard(pm) {
  const n = String(pm || '').trim().toLowerCase();
  return n === 'credit_card' || n === 'card' || n === 'cartao' || n === 'cartão';
}

function getBrasiliaHour() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const brasilia = new Date(utc - 3 * 3600000);
  return brasilia.getHours();
}

async function fetchMetaAccounts(token) {
  const url = `${META_API_BASE}/me/adaccounts?access_token=${token}&fields=id,account_id,name,account_status,balance,amount_spent,spend_cap,is_prepay_account,funding_source_details,disable_reason&limit=100`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta API ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.data || [];
}

async function fetchAccountDailyInsights(token, accountId) {
  try {
    const url = `${META_API_BASE}/${accountId}/insights?access_token=${token}&fields=spend,actions&date_preset=today`;
    const res = await fetch(url);
    if (!res.ok) return { spend: 0, messages: 0 };
    const data = await res.json();
    const insight = data.data?.[0];
    if (!insight) return { spend: 0, messages: 0 };

    const spend = parseFloat(insight.spend || '0');
    const msgTypes = [
      'onsite_conversion.messaging_conversation_started_7d',
      'messaging_conversation_started_7d',
      'onsite_conversion.messaging_first_reply',
      'messaging_first_reply',
    ];
    let messages = 0;
    for (const type of msgTypes) {
      const found = (insight.actions || []).find(a => a.action_type === type);
      if (found) { messages = parseInt(found.value, 10) || 0; break; }
    }
    return { spend, messages };
  } catch {
    return { spend: 0, messages: 0 };
  }
}

async function fetchPaymentMethods(supabaseUrl, supabaseKey) {
  try {
    const url = `${supabaseUrl}/rest/v1/account_configs?select=account_id,payment_method`;
    const res = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map();
    (data || []).forEach(r => map.set(r.account_id, r.payment_method));
    return map;
  } catch {
    return new Map();
  }
}

function fmtR$(val) {
  return `R$ ${val.toFixed(2).replace('.', ',')}`;
}

export default async function handler(req, res) {
  // Vercel Cron sends GET requests with Authorization header
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const metaToken = process.env.META_ACCESS_TOKEN || process.env.VITE_META_ACCESS_TOKEN;
  const slackWebhook = process.env.SLACK_WEBHOOK_ALERTS || process.env.VITE_SLACK_WEBHOOK_ALERTS;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!metaToken) return res.status(500).json({ error: 'META_ACCESS_TOKEN not configured' });
  if (!slackWebhook) return res.status(500).json({ error: 'SLACK_WEBHOOK_ALERTS not configured' });

  try {
    // Thresholds (same as frontend defaults)
    const THRESHOLDS = {
      balance_critical: 50,
      balance_warning: 150,
      high_cost_lead: 25,
    };

    // 1. Fetch accounts + payment methods
    const [rawAccounts, paymentMethods] = await Promise.all([
      fetchMetaAccounts(metaToken),
      supabaseUrl && supabaseKey ? fetchPaymentMethods(supabaseUrl, supabaseKey) : new Map(),
    ]);

    // 2. Evaluate alerts
    const alerts = [];

    for (const account of rawAccounts) {
      const actId = account.id;
      const accountName = account.name || actId;
      const paymentMethod = paymentMethods.get(actId) || paymentMethods.get(account.account_id) || '';
      const isCard = isCreditCard(paymentMethod);
      const { currentBalance, hasReliableBalance } = calculateMetaBalance(account);
      const isActive = account.account_status === 1;

      // Payment error: card + disabled account
      if (isCard && !isActive) {
        alerts.push({
          type: 'payment_error',
          severity: 'danger',
          accountName,
          message: 'Possível falha na cobrança do cartão — conta desativada',
          detail: `Status: ${account.account_status}`,
        });
      }

      // Zero balance on prepaid
      if (!isCard && hasReliableBalance && currentBalance <= 0) {
        const methodLabel = paymentMethod === 'pix' ? 'Pix' : paymentMethod === 'boleto' ? 'Boleto' : 'Pré-pago';
        alerts.push({
          type: 'payment_error',
          severity: 'danger',
          accountName,
          message: `${methodLabel} — Saldo esgotado (R$ 0,00)`,
          detail: 'Campanhas serão pausadas automaticamente',
        });
      }

      // Low balance
      if (!isCard && hasReliableBalance && currentBalance > 0) {
        if (currentBalance < THRESHOLDS.balance_critical) {
          alerts.push({
            type: 'balance_low',
            severity: 'danger',
            accountName,
            message: `Saldo crítico: ${fmtR$(currentBalance)}`,
            detail: `Limite: ${fmtR$(THRESHOLDS.balance_critical)}`,
          });
        } else if (currentBalance < THRESHOLDS.balance_warning) {
          alerts.push({
            type: 'balance_low',
            severity: 'warning',
            accountName,
            message: `Saldo em atenção: ${fmtR$(currentBalance)}`,
            detail: `Limite: ${fmtR$(THRESHOLDS.balance_warning)}`,
          });
        }
      }

      // Daily insights checks (spend without messages, high cost per lead)
      if (isActive) {
        const daily = await fetchAccountDailyInsights(metaToken, actId);

        if (daily.spend > 0 && daily.messages === 0) {
          alerts.push({
            type: 'no_messages',
            severity: 'danger',
            accountName,
            message: `Gastou ${fmtR$(daily.spend)} hoje sem gerar mensagens`,
            detail: 'Verifique configuração de campanha e pixel',
          });
        }

        if (daily.messages > 0) {
          const costPerLead = daily.spend / daily.messages;
          if (costPerLead >= THRESHOLDS.high_cost_lead) {
            const isCritical = costPerLead >= THRESHOLDS.high_cost_lead * 1.5;
            alerts.push({
              type: 'high_cost',
              severity: isCritical ? 'danger' : 'warning',
              accountName,
              message: `Custo por lead hoje: ${fmtR$(costPerLead)}`,
              detail: `Gasto: ${fmtR$(daily.spend)} • ${daily.messages} msg`,
            });
          }
        }
      }
    }

    // 3. If no alerts, no need to send
    if (alerts.length === 0) {
      return res.status(200).json({ message: 'No alerts', alerts_sent: 0 });
    }

    // 4. Build Slack message
    const brasiliaHour = getBrasiliaHour();
    const today = new Date().toLocaleDateString('pt-BR');
    const severityEmoji = { danger: ':red_circle:', warning: ':large_yellow_circle:', info: ':large_blue_circle:' };
    const typeHeaders = {
      balance_low: ':moneybag: Saldo Baixo',
      payment_error: ':credit_card: Erro no Pagamento',
      high_cost: ':chart_with_downwards_trend: Custo Alto',
      no_messages: ':no_entry_sign: Sem Mensagens',
    };

    const grouped = {};
    alerts.forEach(a => {
      if (!grouped[a.type]) grouped[a.type] = [];
      grouped[a.type].push(a);
    });

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🔔 Lembrete ${brasiliaHour}h — ${alerts.length} alerta${alerts.length !== 1 ? 's' : ''} pendente${alerts.length !== 1 ? 's' : ''}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '_Esses problemas foram detectados automaticamente:_' },
      },
    ];

    Object.entries(grouped).forEach(([type, typeAlerts]) => {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${typeHeaders[type] || type}* (${typeAlerts.length})` },
      });

      typeAlerts.slice(0, 15).forEach(alert => {
        const emoji = severityEmoji[alert.severity] || '';
        let text = `${emoji} *${alert.accountName}*\n${alert.message}`;
        if (alert.detail) text += `\n${alert.detail}`;
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text } });
      });
    });

    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `_Lembrete automático • ${today} às ${brasiliaHour}h • Vilas MKT Dash (Vercel Cron)_` }],
    });

    // 5. Send to Slack
    const slackRes = await fetch(slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });

    if (!slackRes.ok) {
      const errText = await slackRes.text();
      console.error('[slack-alerts] Slack webhook error:', slackRes.status, errText);
      return res.status(502).json({ error: 'Slack webhook failed', status: slackRes.status });
    }

    return res.status(200).json({
      message: 'OK',
      hour_brasilia: brasiliaHour,
      alerts_sent: alerts.length,
      types: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])),
    });
  } catch (err) {
    console.error('[slack-alerts] Error:', err);
    return res.status(500).json({ error: 'Internal error', details: String(err) });
  }
}
