import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";

const DISCORD_WEBHOOK_BALANCE =
  "https://discord.com/api/webhooks/1488629372205273270/dSOS4Lyq7stRpz84ftZWYuv8W69htD6ymz4WwZjHHgXYOjwut56D2suvIIUeDvB8-TFe";

const DISCORD_WEBHOOK_PAYMENT =
  "https://discord.com/api/webhooks/1490475742474272838/xPkItH-Q-K8Olu6SF_xGMjNTd2X-2i5m8340tp4lAnyo6VKZ1_xOb9o47G2E6JdSzrV0";

const DISCORD_WEBHOOK_HIGH_COST =
  "https://discord.com/api/webhooks/1490480958921642158/bmEvC_sxobfVFOIMDVZWPQciDYqpJsxJBAf8f1GJWyj9D1uY9Mu8gQL66IAWdLjGVNZ5";

const DISCORD_WEBHOOK_NO_MESSAGES =
  "https://discord.com/api/webhooks/1490482779685650452/T5QHJMlZzGX1BIN-JWcPWsu74aQVQWRP3H4tLMW3GuH6SbCDNTcvffbE45N3sYp9q4iP";

const META_API_BASE = "https://graph.facebook.com/v22.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function parseMoneyFromCents(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed / 100 : 0;
}

function calculateMetaBalance(account: Record<string, unknown>) {
  const rawBillingBalance = parseMoneyFromCents(account.balance);
  const spendCap = parseMoneyFromCents(account.spend_cap);
  const amountSpent = parseMoneyFromCents(account.amount_spent);

  const prepaidAvailable = rawBillingBalance < 0 ? Math.abs(rawBillingBalance) : 0;
  const amountDue = rawBillingBalance > 0 ? rawBillingBalance : 0;
  const remainingSpendCap = spendCap > 0 ? Math.max(0, spendCap - amountSpent) : 0;

  let currentBalance = 0;
  let hasReliableBalance = false;

  if (prepaidAvailable > 0 && remainingSpendCap > 0) {
    currentBalance = Math.min(prepaidAvailable, remainingSpendCap);
    hasReliableBalance = true;
  } else if (prepaidAvailable > 0) {
    currentBalance = prepaidAvailable;
    hasReliableBalance = true;
  } else if (remainingSpendCap > 0) {
    currentBalance = remainingSpendCap;
    hasReliableBalance = true;
  }

  return {
    rawBillingBalance,
    spendCap,
    amountSpent,
    amountDue,
    currentBalance,
    hasReliableBalance,
  };
}

// ── Fetch Meta ad accounts with balances ──
async function fetchMetaBalances(token: string): Promise<any[]> {
  const url = `${META_API_BASE}/me/adaccounts?access_token=${token}&fields=id,account_id,name,account_status,disable_reason,balance,amount_spent,spend_cap,is_prepay_account,currency&limit=100`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return (data.data || []).map((acc: any) => {
    const { currentBalance, hasReliableBalance, amountDue } = calculateMetaBalance(acc);
    return {
      accountId: acc.id,
      accountNumericId: acc.account_id,
      name: acc.name,
      currentBalance,
      hasReliableBalance,
      amountDue,
      status: acc.account_status,
      disableReason: acc.disable_reason || null,
    };
  });
}

// ── Fetch account insights (spend, messages) for last 7 days ──
async function fetchAccountInsights(token: string, accountId: string): Promise<{ spend: number; messages: number; costPerMessage: number }> {
  try {
    const url = `${META_API_BASE}/${accountId}/insights?access_token=${token}&fields=spend,actions&date_preset=last_7d`;
    const res = await fetch(url);
    if (!res.ok) return { spend: 0, messages: 0, costPerMessage: 0 };
    const data = await res.json();
    const insight = data.data?.[0];
    if (!insight) return { spend: 0, messages: 0, costPerMessage: 0 };

    const spend = Number.parseFloat(insight.spend || "0");
    const actions = insight.actions || [];
    const msgTypes = [
      "onsite_conversion.messaging_conversation_started_7d",
      "messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
      "messaging_first_reply",
    ];
    let messages = 0;
    for (const type of msgTypes) {
      const found = actions.find((a: any) => a.action_type === type);
      if (found) { messages = Number.parseInt(found.value, 10) || 0; break; }
    }

    return {
      spend,
      messages,
      costPerMessage: messages > 0 ? spend / messages : 0,
    };
  } catch {
    return { spend: 0, messages: 0, costPerMessage: 0 };
  }
}

// ── Fetch account payment methods from Supabase ──
async function fetchAccountConfigs(
  supabase: any
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("account_configs")
    .select("account_id, payment_method");
  const map = new Map<string, string>();
  (data || []).forEach((r: any) => map.set(r.account_id, r.payment_method));
  return map;
}

// ── Send Discord embeds ──
async function sendDiscord(webhookUrl: string, embeds: any[]) {
  for (let i = 0; i < embeds.length; i += 10) {
    const chunk = embeds.slice(i, i + 10);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: null, embeds: chunk }),
    });
    if (!res.ok) {
      console.error(
        `Discord webhook error: ${res.status}`,
        await res.text()
      );
    }
  }
}

// ── Main handler ──
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const metaToken = Deno.env.get("META_ACCESS_TOKEN");

    if (!metaToken) {
      return new Response(
        JSON.stringify({ error: "META_ACCESS_TOKEN not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const currentHour = new Date().getUTCHours();

    // Determinar quais tipos rodar baseado na hora
    // balance_low: toda hora | payment_error: cada 6h | high_cost + no_messages: cada 3h
    const activeTypes: string[] = ["balance_low"];
    if (currentHour % 6 === 0) activeTypes.push("payment_error");
    if (currentHour % 3 === 0) activeTypes.push("high_cost", "no_messages");

    // 1. Fetch active rules dos tipos que devem rodar agora
    const { data: rules, error: rulesError } = await supabase
      .from("balance_alert_rules")
      .select("*")
      .eq("enabled", true)
      .in("type", activeTypes);

    if (rulesError) throw rulesError;
    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active rules for this cycle", active_types: activeTypes, alerts_sent: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Fetch Meta balances + account configs
    const [balances, accountConfigs] = await Promise.all([
      fetchMetaBalances(metaToken),
      fetchAccountConfigs(supabase),
    ]);

    // 3. Get today's already-sent alerts (dedup key: rule_id + account_id + date)
    const today = new Date().toISOString().slice(0, 10);
    const { data: sentToday } = await supabase
      .from("balance_alert_log")
      .select("rule_id, account_id")
      .eq("alert_date", today);

    const sentKeys = new Set(
      (sentToday || []).map(
        (s: any) => `${s.rule_id}__${s.account_id}`
      )
    );

    // 4. Pre-fetch insights for high_cost/no_messages rules (se necessário)
    const needsInsights = rules.some((r) => r.type === "high_cost" || r.type === "no_messages");
    const insightsMap = new Map<string, { spend: number; messages: number; costPerMessage: number }>();

    if (needsInsights) {
      const insightPromises = balances.map(async (b) => {
        const data = await fetchAccountInsights(metaToken, b.accountId);
        insightsMap.set(b.accountId, data);
      });
      await Promise.all(insightPromises);
    }

    // 5. Evaluate rules
    const balanceEmbeds: any[] = [];
    const paymentEmbeds: any[] = [];
    const highCostEmbeds: any[] = [];
    const noMessagesEmbeds: any[] = [];
    const newLogs: any[] = [];

    const isCreditCard = (pm: string) =>
      pm === "credit_card" || pm === "card" || pm === "cartao" || pm === "cartão";

    for (const rule of rules) {
      const targetAccounts =
        rule.account_id === "all"
          ? balances
          : balances.filter(
              (b) =>
                b.accountId === rule.account_id ||
                b.accountNumericId === rule.account_id
            );

      for (const account of targetAccounts) {
        const key = `${rule.id}__${account.accountId}`;
        if (sentKeys.has(key)) continue;

        const paymentMethod = accountConfigs.get(account.accountId) || "credit_card";

        // ── balance_low: toda hora ──
        if (rule.type === "balance_low") {
          if (isCreditCard(paymentMethod)) continue;
          if (!account.hasReliableBalance) continue;
          if (account.currentBalance >= rule.threshold) continue;

          const isCritical = account.currentBalance < rule.threshold * 0.5;
          balanceEmbeds.push({
            title: isCritical ? "🚨 Saldo Crítico" : "⚠️ Saldo Baixo",
            color: isCritical ? 0xef4444 : 0xf59e0b,
            fields: [
              { name: "Conta", value: account.name || account.accountId, inline: true },
              { name: "Saldo Atual", value: `R$ ${account.currentBalance.toFixed(2)}`, inline: true },
              { name: "Limite", value: `R$ ${Number(rule.threshold).toFixed(2)}`, inline: true },
            ],
            timestamp: new Date().toISOString(),
          });
          newLogs.push({ rule_id: rule.id, account_id: account.accountId, alert_date: today });
        }

        // ── payment_error: cada 6h ──
        if (rule.type === "payment_error") {
          let hasError = false;
          let errorMessage = "";

          if (isCreditCard(paymentMethod)) {
            if (account.status === 2 || account.status === 3) {
              hasError = true;
              const reasons: Record<number, string> = {
                0: "Não especificado", 1: "Conta com anúncios pessoais",
                2: "Violação de termos", 3: "Conta cinza",
                4: "Conta não configurada", 5: "Conta não utilizada",
                8: "Cobrança pendente", 9: "Página removida",
              };
              const reasonText = account.disableReason !== null
                ? reasons[account.disableReason] || `Código ${account.disableReason}`
                : account.status === 3 ? "Cobrança pendente" : "Conta desativada";
              errorMessage = `Cartão — ${reasonText}`;
            }
          } else {
            if (account.hasReliableBalance && account.currentBalance <= 0) {
              hasError = true;
              errorMessage = `${paymentMethod === "pix" ? "Pix" : "Boleto"} — Saldo esgotado (R$ 0,00)`;
            }
          }

          if (hasError) {
            paymentEmbeds.push({
              title: "🔴 Erro no Pagamento",
              color: 0xdc2626,
              fields: [
                { name: "Conta", value: account.name || account.accountId, inline: true },
                { name: "Método", value: isCreditCard(paymentMethod) ? "Cartão" : paymentMethod === "pix" ? "Pix" : "Boleto", inline: true },
                { name: "Problema", value: errorMessage, inline: false },
                { name: "Saldo", value: `R$ ${account.currentBalance.toFixed(2)}`, inline: true },
              ],
              timestamp: new Date().toISOString(),
            });
            newLogs.push({ rule_id: rule.id, account_id: account.accountId, alert_date: today });
          }
        }

        // ── high_cost: cada 3h ──
        if (rule.type === "high_cost") {
          const insights = insightsMap.get(account.accountId);
          if (!insights || insights.costPerMessage <= 0) continue;
          if (insights.costPerMessage < rule.threshold) continue;

          const isCritical = insights.costPerMessage >= rule.threshold * 1.5;
          highCostEmbeds.push({
            title: isCritical ? "🔴 Custo Muito Alto" : "🟠 Custo Alto",
            color: isCritical ? 0xef4444 : 0xf97316,
            fields: [
              { name: "Conta", value: account.name || account.accountId, inline: true },
              { name: "Custo/Lead", value: `R$ ${insights.costPerMessage.toFixed(2)}`, inline: true },
              { name: "Limite", value: `R$ ${Number(rule.threshold).toFixed(2)}`, inline: true },
              { name: "Leads (7d)", value: `${insights.messages}`, inline: true },
              { name: "Gasto (7d)", value: `R$ ${insights.spend.toFixed(2)}`, inline: true },
            ],
            timestamp: new Date().toISOString(),
          });
          newLogs.push({ rule_id: rule.id, account_id: account.accountId, alert_date: today });
        }

        // ── no_messages: cada 3h ──
        if (rule.type === "no_messages") {
          const insights = insightsMap.get(account.accountId);
          if (!insights || insights.spend <= 0 || insights.messages > 0) continue;

          noMessagesEmbeds.push({
            title: "🟣 Sem Mensagens",
            color: 0xa855f7,
            fields: [
              { name: "Conta", value: account.name || account.accountId, inline: true },
              { name: "Gasto (7d)", value: `R$ ${insights.spend.toFixed(2)}`, inline: true },
              { name: "Mensagens", value: "0", inline: true },
            ],
            timestamp: new Date().toISOString(),
          });
          newLogs.push({ rule_id: rule.id, account_id: account.accountId, alert_date: today });
        }
      }
    }

    // 6. Send to Discord — cada tipo para seu webhook
    if (balanceEmbeds.length > 0) await sendDiscord(DISCORD_WEBHOOK_BALANCE, balanceEmbeds);
    if (paymentEmbeds.length > 0) await sendDiscord(DISCORD_WEBHOOK_PAYMENT, paymentEmbeds);
    if (highCostEmbeds.length > 0) await sendDiscord(DISCORD_WEBHOOK_HIGH_COST, highCostEmbeds);
    if (noMessagesEmbeds.length > 0) await sendDiscord(DISCORD_WEBHOOK_NO_MESSAGES, noMessagesEmbeds);

    const totalSent = balanceEmbeds.length + paymentEmbeds.length + highCostEmbeds.length + noMessagesEmbeds.length;

    // 7. Log sent alerts
    if (newLogs.length > 0) {
      const { error: logError } = await supabase
        .from("balance_alert_log")
        .insert(newLogs);
      if (logError) console.error("Error logging alerts:", logError);
    }

    // 8. Cleanup old logs (keep last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    await supabase
      .from("balance_alert_log")
      .delete()
      .lt("alert_date", weekAgo.toISOString().slice(0, 10));

    return new Response(
      JSON.stringify({
        message: "OK",
        active_types: activeTypes,
        rules_checked: rules.length,
        accounts_checked: balances.length,
        alerts_sent: totalSent,
        balance_alerts: balanceEmbeds.length,
        payment_alerts: paymentEmbeds.length,
        high_cost_alerts: highCostEmbeds.length,
        no_messages_alerts: noMessagesEmbeds.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("check-balances-cron error:", err);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
