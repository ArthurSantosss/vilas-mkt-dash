// Google Ads API proxy + OAuth exchange
// Actions:
//   - "oauth-exchange": troca authorization code por refresh_token e salva em user_tokens
//   - "list-customers":  lista customers acessíveis pelo refresh token do usuário
//   - "get-campaigns":   roda GAQL para retornar campanhas + métricas de um customer
//
// Secrets necessários (via supabase secrets set):
//   GOOGLE_ADS_CLIENT_ID
//   GOOGLE_ADS_CLIENT_SECRET
//   GOOGLE_ADS_DEVELOPER_TOKEN
//   SUPABASE_URL  / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (auto)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_ADS_API_VERSION = "v17";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getUserFromAuthHeader(authHeader: string | null) {
  if (!authHeader) return { user: null, error: "Missing authorization header" };
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabaseUser.auth.getUser();
  if (error || !data.user) return { user: null, error: "Unauthorized" };
  return { user: data.user, error: null };
}

function getAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

// Troca refresh_token por access_token (válido ~1h)
async function refreshAccessToken(refreshToken: string) {
  const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Failed to refresh token");
  return data.access_token as string;
}

async function loadUserRefreshToken(userId: string) {
  const admin = getAdmin();
  const { data, error } = await admin
    .from("user_tokens")
    .select("refresh_token, platform_user_id")
    .eq("user_id", userId)
    .eq("platform", "google_ads")
    .maybeSingle();
  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data?.refresh_token) throw new Error("Google Ads não conectado para este usuário.");
  return data;
}

function googleAdsHeaders(accessToken: string, loginCustomerId?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId.replace(/-/g, "");
  return headers;
}

// ── Action handlers ─────────────────────────────────────────────────────────

async function handleOAuthExchange(userId: string, body: any) {
  const { code, redirectUri } = body;
  if (!code || !redirectUri) return jsonResponse({ error: "Missing code or redirectUri" }, 400);

  const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    return jsonResponse({ error: tokenData.error_description || tokenData.error || "OAuth exchange failed" }, 400);
  }
  if (!tokenData.refresh_token) {
    return jsonResponse({
      error: "Google não retornou refresh_token. Revogue o acesso em myaccount.google.com/permissions e reconecte (precisa prompt=consent + access_type=offline).",
    }, 400);
  }

  const admin = getAdmin();
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

  const { error: upsertError } = await admin.from("user_tokens").upsert({
    user_id: userId,
    platform: "google_ads",
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_expires_at: expiresAt,
    status: "active",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,platform" });

  if (upsertError) return jsonResponse({ error: `DB upsert failed: ${upsertError.message}` }, 500);

  // Buscar customers acessíveis e salvar em ad_accounts
  try {
    const accessToken = tokenData.access_token as string;
    const listRes = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
      { headers: googleAdsHeaders(accessToken) }
    );
    const listData = await listRes.json();

    if (!listRes.ok) {
      // OAuth ok mas API rejeitou (developer token não aprovado, etc.)
      return jsonResponse({
        success: true,
        warning: listData.error?.message || "Conectado, mas não foi possível listar contas (developer token pode não estar aprovado).",
        accountsCount: 0,
      });
    }

    const resourceNames: string[] = listData.resourceNames || [];
    const customerIds = resourceNames.map((rn) => rn.replace("customers/", ""));

    for (const cid of customerIds) {
      // Tenta buscar o nome via GAQL
      let accountName = `Customer ${cid}`;
      let currency = "BRL";
      try {
        const q = `SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1`;
        const r = await fetch(
          `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cid}/googleAds:search`,
          {
            method: "POST",
            headers: googleAdsHeaders(accessToken, cid),
            body: JSON.stringify({ query: q }),
          }
        );
        const d = await r.json();
        if (r.ok && d.results?.[0]?.customer) {
          accountName = d.results[0].customer.descriptiveName || accountName;
          currency = d.results[0].customer.currencyCode || currency;
        }
      } catch (_) { /* ignore */ }

      await admin.from("ad_accounts").upsert({
        user_id: userId,
        platform: "google_ads",
        account_id: cid,
        account_name: accountName,
        account_status: 1,
        currency,
        is_active: true,
        synced_at: new Date().toISOString(),
      }, { onConflict: "user_id,platform,account_id" });
    }

    return jsonResponse({ success: true, accountsCount: customerIds.length, customerIds });
  } catch (e) {
    return jsonResponse({ success: true, warning: String(e), accountsCount: 0 });
  }
}

async function handleListCustomers(userId: string) {
  const { refresh_token } = await loadUserRefreshToken(userId);
  const accessToken = await refreshAccessToken(refresh_token);

  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
    { headers: googleAdsHeaders(accessToken) }
  );
  const data = await res.json();
  if (!res.ok) return jsonResponse({ error: data.error?.message || "Failed to list customers" }, res.status);

  const customerIds = (data.resourceNames || []).map((rn: string) => rn.replace("customers/", ""));
  return jsonResponse({ customerIds });
}

// Mapeia o "period" do front em filtro GAQL segments.date
function periodToDateFilter(period: any): string {
  // Permite custom { type: 'custom', startDate, endDate } ou strings preset
  if (period && typeof period === "object" && period.type === "custom" && period.startDate && period.endDate) {
    return `segments.date BETWEEN '${period.startDate}' AND '${period.endDate}'`;
  }
  switch (period) {
    case "today": return "segments.date DURING TODAY";
    case "yesterday": return "segments.date DURING YESTERDAY";
    case "7d": return "segments.date DURING LAST_7_DAYS";
    case "14d": return "segments.date DURING LAST_14_DAYS";
    case "30d": return "segments.date DURING LAST_30_DAYS";
    case "month": return "segments.date DURING THIS_MONTH";
    case "last_month": return "segments.date DURING LAST_MONTH";
    default: return "segments.date DURING LAST_7_DAYS";
  }
}

async function handleGetCampaigns(userId: string, body: any) {
  const { customerId, period } = body;
  if (!customerId) return jsonResponse({ error: "Missing customerId" }, 400);

  const { refresh_token } = await loadUserRefreshToken(userId);
  const accessToken = await refreshAccessToken(refresh_token);

  const dateFilter = periodToDateFilter(period);
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE ${dateFilter}
    ORDER BY metrics.cost_micros DESC
    LIMIT 200
  `;

  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: googleAdsHeaders(accessToken, customerId),
      body: JSON.stringify({ query }),
    }
  );
  const data = await res.json();
  if (!res.ok) return jsonResponse({ error: data.error?.message || "Google Ads API error", details: data }, res.status);

  // Normalizar — micros para float, status lower-case
  const campaigns = (data.results || []).map((row: any) => {
    const c = row.campaign || {};
    const m = row.metrics || {};
    const b = row.campaignBudget || {};
    const costMicros = Number(m.costMicros || 0);
    const impressions = Number(m.impressions || 0);
    const clicks = Number(m.clicks || 0);
    return {
      id: String(c.id),
      accountId: customerId,
      name: c.name,
      status: String(c.status || "").toLowerCase(),
      channelType: c.advertisingChannelType,
      dailyBudget: Number(b.amountMicros || 0) / 1_000_000,
      metrics: {
        spend: costMicros / 1_000_000,
        impressions,
        clicks,
        ctr: Number(m.ctr || 0) * 100,
        cpc: Number(m.averageCpc || 0) / 1_000_000,
        cpm: Number(m.averageCpm || 0) / 1_000_000,
        conversions: Number(m.conversions || 0),
        conversionsValue: Number(m.conversionsValue || 0),
      },
    };
  });

  // Totais agregados (account-level insights)
  const totals = campaigns.reduce(
    (acc: any, c: any) => {
      acc.spend += c.metrics.spend;
      acc.impressions += c.metrics.impressions;
      acc.clicks += c.metrics.clicks;
      acc.conversions += c.metrics.conversions;
      acc.conversionsValue += c.metrics.conversionsValue;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionsValue: 0 }
  );
  totals.ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0;
  totals.cpc = totals.clicks ? totals.spend / totals.clicks : 0;
  totals.cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0;

  return jsonResponse({ campaigns, totals });
}

// ── Entry point ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user, error } = await getUserFromAuthHeader(req.headers.get("Authorization"));
    if (!user) return jsonResponse({ error }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    switch (action) {
      case "oauth-exchange": return await handleOAuthExchange(user.id, body);
      case "list-customers": return await handleListCustomers(user.id);
      case "get-campaigns":  return await handleGetCampaigns(user.id, body);
      default: return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[google-ads-proxy] error:", err);
    return jsonResponse({ error: String(err?.message || err) }, 500);
  }
});
