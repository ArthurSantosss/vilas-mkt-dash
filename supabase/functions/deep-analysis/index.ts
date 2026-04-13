import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um analista sênior de tráfego pago com experiência profunda em Meta Ads. Você está falando DIRETAMENTE com o gestor de tráfego (não com o cliente final). Seja técnico, direto e estratégico.

CONTEXTO: O gestor precisa entender o que está acontecendo com a conta/campanha, por que está acontecendo, e o que fazer a respeito. Ele precisa de insights acionáveis, não de relatório bonito.

REGRAS DE ANÁLISE:
- Analise TODOS os dados recebidos: métricas principais, breakdowns (idade, gênero, plataforma, posicionamento), dados de vídeo, período anterior.
- Cruze os dados entre si. Exemplo: se o CPM está alto E a frequência está subindo, isso indica saturação de público.
- Identifique padrões: tendências de piora/melhora, sazonalidade, gargalos no funil.
- Considere o contexto do mercado brasileiro: sazonalidade, datas comerciais, comportamento de consumo.
- Use seu conhecimento de Meta Ads para explicar por que as coisas estão acontecendo (algoritmo, leilão, qualidade do criativo, público, etc.)
- Sempre que possível, quantifique o impacto: "reduzir o CPM de R$X para R$Y economizaria R$Z no período".
- Para "Custo por lead/conversa", menor = melhor. Queda = bom. Alta = ruim.

REGRAS DE TOM:
- Fale como um colega experiente conversando com outro gestor. Sem formalidade excessiva.
- Seja honesto: se está ruim, diga que está ruim e por quê.
- Não enrole. Vá direto ao ponto.
- Use termos técnicos de tráfego pago sem medo (CPM, CTR, frequência, hook rate, etc.)

SAZONALIDADE:
Considere sempre o mês e período atual. Eventos relevantes no Brasil: início de ano, volta às aulas, carnaval, páscoa, dia das mães, dia dos namorados, são joão, dia dos pais, dia das crianças, black friday, natal, ano novo, imposto de renda, 13o salário, períodos eleitorais. Explique como isso impacta o leilão e os custos.

FORMATO — responda APENAS com JSON nesta estrutura:
{
  "resumo": "2-3 frases resumindo a situação geral da conta/campanha. Direto, sem rodeios.",
  "diagnosticos": [
    {
      "titulo": "título curto do problema/oportunidade",
      "severidade": "critico | atencao | positivo",
      "analise": "explicação técnica detalhada do que está acontecendo e por quê (2-4 frases)",
      "impacto": "qual o impacto financeiro ou de performance (1 frase com números se possível)"
    }
  ],
  "acoes": [
    {
      "acao": "o que fazer (específico e acionável)",
      "motivo": "por que isso vai funcionar (1-2 frases técnicas)",
      "prioridade": "alta | media | baixa",
      "dificuldade": "facil | medio | complexo"
    }
  ],
  "insights": [
    "insight 1 — observação não óbvia que cruza dados diferentes",
    "insight 2 — padrão ou tendência relevante"
  ]
}

REGRAS DO JSON:
- diagnosticos: máximo 6, mínimo 2. Ordene por severidade (critico primeiro).
- acoes: máximo 5, mínimo 2. Ordene por prioridade (alta primeiro).
- insights: máximo 4, mínimo 1. Apenas insights que cruzam dados ou revelam algo não óbvio.
- Não inclua nada fora do JSON.`;

function buildUserPrompt(data: any): string {
    const {
        accountName,
        campaignName,
        periodLabel,
        todayDate,
        metrics,
        previousMetrics,
        breakdowns,
        videoData,
        dailyData,
        allCampaigns,
    } = data;

    let prompt = `Analise profundamente os dados abaixo e gere insights acionáveis.\n\n`;
    prompt += `Data de hoje: ${todayDate || "N/A"}\n`;
    prompt += `Conta: ${accountName || "N/A"}\n`;
    if (campaignName) prompt += `Campanha selecionada: ${campaignName}\n`;
    prompt += `Período: ${periodLabel}\n\n`;

    // Main metrics
    prompt += `MÉTRICAS PRINCIPAIS:\n`;
    if (metrics) {
        if (metrics.spend !== undefined) prompt += `Investimento: R$ ${Number(metrics.spend).toFixed(2)}\n`;
        if (metrics.messages !== undefined) prompt += `Leads/Conversas: ${metrics.messages}\n`;
        if (metrics.costPerMessage !== undefined && metrics.costPerMessage > 0) prompt += `Custo por lead: R$ ${Number(metrics.costPerMessage).toFixed(2)}\n`;
        if (metrics.impressions !== undefined) prompt += `Impressões: ${metrics.impressions}\n`;
        if (metrics.reach !== undefined) prompt += `Alcance: ${metrics.reach}\n`;
        if (metrics.cpm !== undefined && metrics.cpm > 0) prompt += `CPM: R$ ${Number(metrics.cpm).toFixed(2)}\n`;
        if (metrics.ctr !== undefined && metrics.ctr > 0) prompt += `CTR: ${Number(metrics.ctr).toFixed(2)}%\n`;
        if (metrics.frequency !== undefined && metrics.frequency > 0) prompt += `Frequência: ${Number(metrics.frequency).toFixed(2)}\n`;
    }

    // Previous period
    if (previousMetrics) {
        prompt += `\nMÉTRICAS DO PERÍODO ANTERIOR (comparação):\n`;
        if (previousMetrics.spend !== undefined) prompt += `Investimento anterior: R$ ${Number(previousMetrics.spend).toFixed(2)}\n`;
        if (previousMetrics.messages !== undefined) prompt += `Leads anterior: ${previousMetrics.messages}\n`;
        if (previousMetrics.costPerMessage !== undefined && previousMetrics.costPerMessage > 0) prompt += `Custo por lead anterior: R$ ${Number(previousMetrics.costPerMessage).toFixed(2)}\n`;
        if (previousMetrics.impressions !== undefined) prompt += `Impressões anterior: ${previousMetrics.impressions}\n`;
        if (previousMetrics.reach !== undefined) prompt += `Alcance anterior: ${previousMetrics.reach}\n`;
        if (previousMetrics.cpm !== undefined && previousMetrics.cpm > 0) prompt += `CPM anterior: R$ ${Number(previousMetrics.cpm).toFixed(2)}\n`;
        if (previousMetrics.ctr !== undefined && previousMetrics.ctr > 0) prompt += `CTR anterior: ${Number(previousMetrics.ctr).toFixed(2)}%\n`;
        if (previousMetrics.frequency !== undefined && previousMetrics.frequency > 0) prompt += `Frequência anterior: ${Number(previousMetrics.frequency).toFixed(2)}\n`;
    }

    // Video data
    if (videoData) {
        prompt += `\nMÉTRICAS DE VÍDEO:\n`;
        if (videoData.plays) prompt += `Reproduções: ${videoData.plays}\n`;
        if (videoData.avgWatchTime) prompt += `Tempo médio assistido: ${videoData.avgWatchTime}s\n`;
        if (videoData.hookRate) prompt += `Hook Rate (3s): ${Number(videoData.hookRate).toFixed(1)}%\n`;
        if (videoData.holdRate) prompt += `Hold Rate (15s): ${Number(videoData.holdRate).toFixed(1)}%\n`;
        if (videoData.p25) prompt += `Assistiu 25%: ${videoData.p25}\n`;
        if (videoData.p50) prompt += `Assistiu 50%: ${videoData.p50}\n`;
        if (videoData.p75) prompt += `Assistiu 75%: ${videoData.p75}\n`;
        if (videoData.p100) prompt += `Assistiu 100%: ${videoData.p100}\n`;
    }

    // Breakdowns
    const fmtSegments = (segments: any[]) => {
        return segments.map((s: any) => {
            const msgs = s.messages || 0;
            const spend = s.spend || 0;
            const cpm = s.costPerMessage || 0;
            return `  ${s.label}: ${msgs} leads, R$ ${Number(spend).toFixed(2)} gasto, custo/lead R$ ${Number(cpm).toFixed(2)}`;
        }).join("\n");
    };

    if (breakdowns) {
        if (breakdowns.age?.length > 0) {
            prompt += `\nBREAKDOWN POR IDADE:\n${fmtSegments(breakdowns.age)}\n`;
        }
        if (breakdowns.gender?.length > 0) {
            prompt += `\nBREAKDOWN POR GÊNERO:\n${fmtSegments(breakdowns.gender)}\n`;
        }
        if (breakdowns.platform?.length > 0) {
            prompt += `\nBREAKDOWN POR PLATAFORMA:\n${fmtSegments(breakdowns.platform)}\n`;
        }
        if (breakdowns.placement?.length > 0) {
            prompt += `\nBREAKDOWN POR POSICIONAMENTO:\n${fmtSegments(breakdowns.placement)}\n`;
        }
        if (breakdowns.region?.length > 0) {
            prompt += `\nBREAKDOWN POR REGIÃO (top 10):\n`;
            prompt += breakdowns.region.slice(0, 10).map((r: any) =>
                `  ${r.name}: ${r.messages || 0} leads, ${r.impressions || 0} impressões`
            ).join("\n") + "\n";
        }
    }

    // Daily data for trend analysis
    if (dailyData?.length > 0) {
        prompt += `\nDADOS DIÁRIOS (tendência):\n`;
        for (const d of dailyData) {
            prompt += `  ${d.date}: ${d.messages || 0} leads, R$ ${Number(d.spend || 0).toFixed(2)} gasto\n`;
        }
    }

    // Other campaigns in the account for context
    if (allCampaigns?.length > 0) {
        prompt += `\nOUTRAS CAMPANHAS ATIVAS NA CONTA (contexto):\n`;
        for (const c of allCampaigns) {
            prompt += `  ${c.name}: R$ ${Number(c.spend || 0).toFixed(2)} gasto, ${c.messages || 0} leads\n`;
        }
    }

    prompt += `\nGere a análise completa no JSON solicitado.`;
    return prompt;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
        if (!anthropicApiKey) {
            return new Response(
                JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const body = await req.json();

        if (!body.metrics) {
            return new Response(
                JSON.stringify({ error: "Missing required field: metrics" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const userPrompt = buildUserPrompt(body);

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": anthropicApiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 4000,
                system: SYSTEM_PROMPT,
                messages: [{ role: "user", content: userPrompt }],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Claude API error:", response.status, errorText);
            return new Response(
                JSON.stringify({ error: `Claude API error: ${response.status}`, details: errorText }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const claudeResponse = await response.json();
        const textContent = claudeResponse.content?.find((c: any) => c.type === "text");

        if (!textContent?.text) {
            return new Response(
                JSON.stringify({ error: "Empty response from Claude" }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        let resultJson;
        try {
            let jsonText = textContent.text.trim();
            if (jsonText.startsWith("```")) {
                jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
            }
            resultJson = JSON.parse(jsonText);
        } catch (_parseError) {
            console.error("Failed to parse Claude JSON:", textContent.text);
            return new Response(
                JSON.stringify({ error: "Failed to parse AI response", rawResponse: textContent.text }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(JSON.stringify(resultJson), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        console.error("Edge Function error:", err);
        return new Response(
            JSON.stringify({ error: "Internal server error", details: String(err) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
