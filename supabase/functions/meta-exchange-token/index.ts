import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Verificar autenticação do usuário
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Missing authorization header" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const metaAppId = Deno.env.get("META_APP_ID")!;
        const metaAppSecret = Deno.env.get("META_APP_SECRET")!;

        // Criar cliente Supabase com o token do usuário para verificar identidade
        const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
        if (userError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Usar service role para operações no banco
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        const { shortLivedToken, facebookUserId } = await req.json();

        if (!shortLivedToken) {
            return new Response(JSON.stringify({ error: "Missing shortLivedToken" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── PASSO 1: Trocar short-lived token por long-lived token ──
        const exchangeUrl = `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${shortLivedToken}`;

        const exchangeRes = await fetch(exchangeUrl);
        const exchangeData = await exchangeRes.json();

        if (exchangeData.error) {
            return new Response(JSON.stringify({ error: exchangeData.error.message }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const longLivedToken = exchangeData.access_token;
        const expiresIn = exchangeData.expires_in || 5184000; // ~60 dias

        // ── PASSO 2: Salvar token no banco ──
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        const { error: upsertError } = await supabaseAdmin
            .from("user_tokens")
            .upsert({
                user_id: user.id,
                platform: "meta",
                access_token: longLivedToken,
                token_expires_at: tokenExpiresAt,
                platform_user_id: facebookUserId || null,
                status: "active",
                updated_at: new Date().toISOString(),
            }, { onConflict: "user_id,platform" });

        if (upsertError) {
            console.error("Erro ao salvar token:", upsertError);
            return new Response(JSON.stringify({ error: "Falha ao salvar token" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── PASSO 3: Listar contas de anúncio ──
        const accountsUrl = `https://graph.facebook.com/v22.0/me/adaccounts?access_token=${longLivedToken}&fields=id,name,account_id,account_status,balance,currency,business_name`;

        const accountsRes = await fetch(accountsUrl);
        const accountsData = await accountsRes.json();

        if (accountsData.error) {
            // Token salvo, mas não conseguiu listar contas — não é erro fatal
            console.error("Erro ao listar contas:", accountsData.error);
            return new Response(JSON.stringify({ success: true, accountsCount: 0, warning: accountsData.error.message }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const accounts = accountsData.data || [];

        // ── PASSO 4: Salvar contas no banco ──
        for (const account of accounts) {
            await supabaseAdmin.from("ad_accounts").upsert({
                user_id: user.id,
                platform: "meta",
                account_id: account.id,
                account_name: account.name,
                business_name: account.business_name || null,
                account_status: account.account_status,
                currency: account.currency || "BRL",
                is_active: account.account_status === 1,
                synced_at: new Date().toISOString(),
            }, { onConflict: "user_id,platform,account_id" });
        }

        return new Response(
            JSON.stringify({ success: true, accountsCount: accounts.length }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err) {
        console.error("Edge Function error:", err);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
