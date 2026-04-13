import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
    buildCampaignAnalysisContextNotes,
    buildCampaignAnalysisFallback,
} from "../../../src/shared/utils/aiReport.js";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

// ─── System prompt (fixo) ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é um gestor de tráfego pago profissional. Você NÃO faz criativos — isso é responsabilidade do cliente. Seu trabalho é gerenciar campanhas de anúncio cujo objetivo principal é gerar conversas (mensagens) ou leads.

Você vai receber as métricas de uma ou mais campanhas e deve gerar um relatório pronto para enviar ao cliente via WhatsApp.

TERMINOLOGIA IMPORTANTE: Use SEMPRE "leads" em vez de "conversas" ou "mensagens". Exemplos: "Total de leads", "Custo por lead", "X leads gerados". Nunca use "conversas" ou "mensagens" como métrica principal.

REGRA DE INTERPRETAÇÃO (MUITO IMPORTANTE):
Para "Custo por lead", SEMPRE considere que quanto menor o valor, melhor a performance. Queda no custo por lead é melhoria. Alta no custo por lead é piora.

REGRAS DE ESCRITA:
- Profissional, claro, objetivo, curto, organizado, fácil de ler.
- Usar emojis leves: 📊 📈 💬 💰 🎯 ✅ ⚠️ 🔍 📅 📍 🚀 📌 💵
- Evitar textos longos.
- Evitar termos técnicos demais.
- Nunca usar lista com tópicos. Escrever sempre em frases.
- Nunca inventar métricas. Usar apenas os dados recebidos.
- Nunca pedir print no final.
- Utilizar TODAS as métricas disponíveis antes de gerar o relatório.

REGRA DE TOM (MUITO IMPORTANTE):
Seja cauteloso com afirmações positivas. Nem sempre a campanha está boa para o cliente. Evite frases como "a campanha está excelente", "os resultados estão ótimos", "performance incrível". Prefira tom realista e ponderado. Use termos como "aparentemente", "até o momento", "dentro do esperado para o período", "tende a melhorar com ajustes". Quando os resultados estiverem de fato ruins, reconheça com honestidade mas sem alarmar, explicando o que está sendo feito. A mensagem final pode ser positiva mas sobre o trabalho que está sendo feito, não sobre os números.

REGRA DE MÚLTIPLAS CAMPANHAS:
- Se tiver mais de uma campanha: separar métricas por campanha e incluir o nome de cada uma.
- Se for apenas uma campanha: NÃO incluir o nome da campanha.
- No nome da campanha: IGNORAR tudo que estiver dentro de colchetes []. Exemplo: "[tag] [lql] [arthur] [01] [ongoing] BPC-LOAS Mensagens" → usar apenas "BPC-LOAS Mensagens".
- Quando receber campanhas com dados já agrupados (mesmo nome), os dados já estão somados. Apresente cada grupo como uma única campanha no relatório.

REGRA DE DATAS (MUITO IMPORTANTE):
O campo "Período analisado" DEVE copiar EXATAMENTE o valor do campo "Período" recebido nos dados, sem alterar nada. O formato correto é dd/mm/aa (exemplo: 01/03/25 a 19/03/25). NÃO recalcule as datas. NÃO use a "Data de hoje" para montar o período. Use o valor de "Período" exatamente como foi enviado.

ANÁLISE DE BREAKDOWNS (OBRIGATÓRIO se receber dados):
Você pode receber dados segmentados por idade, gênero, plataforma e posicionamento. Cada segmento terá: quantidade de mensagens e custo por mensagem.
- Analise internamente TODOS os breakdowns recebidos.
- Inclua no relatório APENAS o que for relevante e útil para o cliente. Exemplo: se 80% dos leads vêm do Instagram e o custo no Facebook é 3x maior, isso vale mencionar. Se a distribuição for equilibrada, não precisa citar.
- Quando mencionar breakdowns, use linguagem simples e natural: "A maior parte dos leads está vindo do Instagram, com um custo menor do que no Facebook" — sem tabelas, sem listas, sem dados crus.
- Nunca liste todos os breakdowns se não houver insight relevante. O cliente não precisa ver números de cada faixa etária se não houver diferença significativa.

ANÁLISE DE SAZONALIDADE (OBRIGATÓRIO):
Sempre que o custo por lead estiver acima do esperado ou quando o resultado oscilar, verificar se existe influência de eventos sazonais. Analisar: mês atual, próximo mês, datas comemorativas próximas, períodos com aumento de anúncios.

Eventos sazonais relevantes: início de ano, volta às aulas, carnaval, páscoa, dia das mães, dia dos pais, dia das crianças, black friday, natal, ano novo, imposto de renda, pagamento de benefícios, fim/início de mês, campanhas políticas, datas comerciais.

Nunca dar explicação vaga como "muitos anunciantes" ou "mercado competitivo". Sempre explicar o motivo específico relacionado ao período.

Usar termos como: "pode estar relacionado", "costuma acontecer", "é comum nesse período", "pode ter influência", "normalmente ocorre". A explicação deve tranquilizar o cliente e parecer natural.

FORMATO DO RELATÓRIO — responda APENAS com JSON nesta estrutura:
{
  "relatorio": "texto completo do relatório no formato abaixo"
}

O campo "relatorio" DEVE seguir exatamente este formato:

📊 Relatório Semanal 📊

📅 Período analisado: {período em dd/mm/aa}

📍 Campanha: {nome, só se tiver mais de uma}
💰 Valor investido: R$ {valor}
💬 Total de leads: {número}
🎯 Custo por lead: R$ {valor}
————
📈 Análise: {texto curto e claro sobre como está a campanha, o que foi feito, sazonalidade se aplicável, insights de breakdowns se relevantes}

✅ Sugestões de melhoria: {apenas se tiver, não é obrigatório}
{texto curto em frase}

📌 Próximos passos: {apenas se tiver, não é obrigatório}
{em frase curta, natural, sem lista, como gestor falando com cliente}

🚀 {mensagem positiva sobre o trabalho sendo feito, não sobre os números}

REGRA DE PRÓXIMOS PASSOS — sempre em frase curta, natural, sem lista, sem tópicos. Exemplos de estilo:
- "Nos próximos dias vamos manter a campanha rodando e testar novos anúncios."
- "Vamos continuar otimizando o público para buscar leads mais baratos."
- "Vamos acompanhar mais alguns dias e, se continuar assim, podemos escalar."

Não inclua nada fora do JSON.`;

// ─── Build user prompt from campaign data ────────────────────────────────────

function buildUserPrompt(data: any): string {
    const {
        accountName,
        platform,
        periodLabel,
        todayDate,
        campaigns,
        previousPeriodCampaigns,
        breakdowns,
    } = data;
    const contextNotes = buildCampaignAnalysisContextNotes(data);

    const fmtCampaignMetrics = (c: any) => {
        const lines = [];
        if (c.name) lines.push(`Campanha: ${c.name}`);
        if (c.objective) lines.push(`Objetivo: ${c.objective}`);
        if (c.spend !== undefined) lines.push(`Valor investido: R$ ${Number(c.spend).toFixed(2)}`);
        if (c.impressions !== undefined) lines.push(`Impressões: ${c.impressions}`);
        if (c.clicks !== undefined && c.clicks > 0) lines.push(`Cliques: ${c.clicks}`);
        if (c.ctr !== undefined && c.ctr > 0) lines.push(`CTR: ${Number(c.ctr).toFixed(2)}%`);
        if (c.cpc !== undefined && c.cpc > 0) lines.push(`CPC: R$ ${Number(c.cpc).toFixed(2)}`);
        if (c.cpm !== undefined && c.cpm > 0) lines.push(`CPM: R$ ${Number(c.cpm).toFixed(2)}`);
        if (c.messages !== undefined && c.messages > 0) lines.push(`Leads: ${c.messages}`);
        if (c.costPerMessage !== undefined && c.costPerMessage > 0) lines.push(`Custo por lead: R$ ${Number(c.costPerMessage).toFixed(2)}`);
        if (c.frequency !== undefined && c.frequency > 0) lines.push(`Frequência: ${Number(c.frequency).toFixed(1)}`);
        if (c.hookRate !== undefined && c.hookRate > 0) lines.push(`Hook Rate: ${Number(c.hookRate).toFixed(1)}%`);
        if (c.holdRate !== undefined && c.holdRate > 0) lines.push(`Hold Rate: ${Number(c.holdRate).toFixed(1)}%`);
        return lines.join("\n");
    };

    const fmtBreakdownSegments = (segments: any[]) => {
        return segments.map((s: any) => {
            const msgs = s.messages || 0;
            const cpm = s.costPerMessage || 0;
            const spend = s.spend || 0;
            return `  ${s.label}: ${msgs} leads, gasto R$ ${Number(spend).toFixed(2)}, custo/lead R$ ${Number(cpm).toFixed(2)}`;
        }).join("\n");
    };

    let prompt = `Gere o relatório para o cliente com base nos dados abaixo.\n\n`;
    prompt += `Data de hoje: ${todayDate || "N/A"}\n\n`;
    prompt += `Conta: ${accountName || "N/A"}\n`;
    prompt += `Plataforma: ${platform || "Meta Ads"}\n`;
    prompt += `Período (COPIE EXATAMENTE este valor para "Período analisado"): ${periodLabel}\n\n`;

    prompt += `CAMPANHAS E MÉTRICAS:\n`;
    if (campaigns && campaigns.length > 0) {
        for (const c of campaigns) {
            prompt += `\n${fmtCampaignMetrics(c)}\n`;
        }
    } else {
        prompt += "Nenhuma campanha com dados disponível.\n";
    }

    if (previousPeriodCampaigns && previousPeriodCampaigns.length > 0) {
        prompt += `\nMÉTRICAS DO PERÍODO ANTERIOR (mesmo tamanho):\n`;
        for (const c of previousPeriodCampaigns) {
            prompt += `\n${fmtCampaignMetrics(c)}\n`;
        }
    }

    // Breakdowns
    if (breakdowns) {
        const hasAny = breakdowns.age || breakdowns.gender || breakdowns.platform || breakdowns.placement;
        if (hasAny) {
            prompt += `\nDADOS SEGMENTADOS (breakdowns) — analise e inclua no relatório apenas o que for relevante:\n`;

            if (breakdowns.age && breakdowns.age.length > 0) {
                prompt += `\nPor Idade:\n${fmtBreakdownSegments(breakdowns.age)}\n`;
            }
            if (breakdowns.gender && breakdowns.gender.length > 0) {
                prompt += `\nPor Gênero:\n${fmtBreakdownSegments(breakdowns.gender)}\n`;
            }
            if (breakdowns.platform && breakdowns.platform.length > 0) {
                prompt += `\nPor Plataforma:\n${fmtBreakdownSegments(breakdowns.platform)}\n`;
            }
            if (breakdowns.placement && breakdowns.placement.length > 0) {
                prompt += `\nPor Posicionamento:\n${fmtBreakdownSegments(breakdowns.placement)}\n`;
            }
        }
    }

    if (contextNotes) {
        prompt += `\nLEITURAS CALCULADAS ANTES DA IA (use como apoio, sem copiar mecanicamente):\n${contextNotes}\n`;
    }

    prompt += `\nGere apenas o relatório completo no JSON solicitado.`;

    return prompt;
}

function extractJsonPayload(text: string) {
    let jsonText = text.trim();
    if (jsonText.startsWith("```")) {
        jsonText = jsonText
            .replace(/^```(?:json)?\s*\n?/, "")
            .replace(/\n?```\s*$/, "");
    }

    try {
        return JSON.parse(jsonText);
    } catch {
        const firstBrace = jsonText.indexOf("{");
        const lastBrace = jsonText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return JSON.parse(jsonText.slice(firstBrace, lastBrace + 1));
        }
        throw new Error("No JSON object found");
    }
}

// ─── Edge Function handler ───────────────────────────────────────────────────

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    let body: any = null;

    try {
        const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
        const anthropicModel = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-20250514";

        body = await req.json();

        // Validate required fields
        if (!body.campaigns || !body.periodLabel) {
            return new Response(
                JSON.stringify({
                    error: "Missing required fields: campaigns, periodLabel",
                }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        const userPrompt = buildUserPrompt(body);
        const fallbackResponse = {
            relatorio: buildCampaignAnalysisFallback(body),
            source: "fallback",
        };

        if (!anthropicApiKey) {
            console.warn("ANTHROPIC_API_KEY not configured. Returning local fallback report.");
            return new Response(JSON.stringify(fallbackResponse), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Call Claude API
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": anthropicApiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: anthropicModel,
                max_tokens: 3000,
                system: SYSTEM_PROMPT,
                messages: [
                    {
                        role: "user",
                        content: userPrompt,
                    },
                ],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Claude API error:", response.status, errorText);
            return new Response(JSON.stringify({
                ...fallbackResponse,
                fallbackReason: `Claude API error: ${response.status}`,
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const claudeResponse = await response.json();

        // Extract the text content from Claude's response
        const textContent = claudeResponse.content?.find(
            (c: any) => c.type === "text"
        );
        if (!textContent?.text) {
            return new Response(JSON.stringify({
                ...fallbackResponse,
                fallbackReason: "Empty response from Claude",
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        let resultJson;
        try {
            resultJson = extractJsonPayload(textContent.text);
        } catch (_parseError) {
            console.error("Failed to parse Claude JSON:", textContent.text);
            return new Response(JSON.stringify({
                ...fallbackResponse,
                fallbackReason: "Failed to parse AI response as JSON",
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Validate expected structure
        if (!resultJson.relatorio) {
            return new Response(JSON.stringify({
                ...fallbackResponse,
                fallbackReason: "AI response missing 'relatorio' field",
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({
            ...resultJson,
            source: "anthropic",
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        console.error("Edge Function error:", err);
        const fallbackReport = body ? buildCampaignAnalysisFallback(body) : null;

        if (fallbackReport) {
            return new Response(
                JSON.stringify({
                    relatorio: fallbackReport,
                    source: "fallback",
                    fallbackReason: "Internal server error",
                }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        return new Response(
            JSON.stringify({ error: "Internal server error", details: String(err) }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
