/* global process */

// api/assistant-chat.js
// Motor do assistente conversacional. Anthropic Claude é o principal; Google Gemini
// entra como reserva (sem chave Anthropic ou se o Claude falhar).
// Executa loop de tool-use com leitura imediata e guardrails de confirmação para escrita.

import crypto from 'node:crypto';
import { isAuthenticatedRequest } from './_auth.js';
import { executeReadTool, readToolSchemas, runWithMetaToken } from './_assistant-tools.js';
import { GOOGLE_READ_TOOLS } from './_assistant-google-tools.js';
import { prepareWriteTool, writeToolSchemas, isWriteTool } from './_assistant-write-tools.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TOOL_ITERATIONS = 8;

const SYSTEM_PROMPT = `Você é o assistente da plataforma VilasMKT, um painel de gestão de tráfego pago (Meta Ads e Google Ads) usado por um gestor profissional. Você conversa DIRETAMENTE com o gestor (não com o cliente final).

Seu papel: ajudar o gestor a consultar e entender os dados das contas dos clientes, comparar performance, sugerir melhorias e, quando pedido, PREPARAR alterações no sistema.

CONHECIMENTO DE DOMÍNIO:
- "Cliente" e "conta de anúncio" são a mesma coisa. O usuário fala pelo nome do cliente; use as ferramentas para resolver o nome na conta certa.
- Meta Ads: "leads" = conversas iniciadas por mensagem (ou lead forms). É a métrica principal.
- Google Ads: a métrica principal é conversão (custo por conversão).
- Custo por lead/conversão: quanto MENOR, melhor. Queda = melhora; alta = piora.
- Quando o usuário não disser a plataforma, assuma Meta Ads. Se o cliente só existir no Google, use as ferramentas do Google.

FERRAMENTAS DE LEITURA: retornam dados na hora. Use sempre que a pergunta depender de números; nunca invente métricas.
- Meta: list_ad_accounts, get_account_metrics, get_account_campaigns, rank_accounts, compare_periods (atual vs anterior), get_top_ads (melhores/piores criativos).
- Google: list_google_accounts, get_google_account_overview.
- Histórico: get_change_log (alterações já feitas na plataforma).

FERRAMENTAS DE ESCRITA (pause/activate/set_budget nas duas plataformas, create_balance_alert, set_account_payment_method): elas NÃO executam nada imediatamente — apenas PREPARAM uma proposta que o usuário vai confirmar na interface com um botão. Quando usar uma:
- Confirme para o usuário, em uma frase clara, o que você preparou e que basta ele confirmar no card que apareceu.
- NÃO diga que já executou. Diga que está aguardando a confirmação dele.
- Se faltar informação (qual campanha, qual valor), pergunte antes de preparar.

REGRAS GERAIS:
- Responda de forma ágil, direta e concisa. Evite rodeios ou introduções longas; vá direto aos números e fatos.
- Use listas ou tópicos curtos e claros.
- Ao dar números, contextualize de forma breve.
- Formate de forma legível. Valores em R$.`;

function allToolSchemas() {
    const google = GOOGLE_READ_TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
    return [...readToolSchemas(), ...google, ...writeToolSchemas()];
}

// Executa uma chamada de ferramenta: leitura roda na hora; escrita só vira proposta.
async function runTool(name, input, { toolTrace, pendingActions }) {
    toolTrace.push({ tool: name, input });

    if (isWriteTool(name)) {
        const prepared = await prepareWriteTool(name, input);
        if (prepared?.requiresConfirmation) {
            pendingActions.push({ id: crypto.randomUUID(), ...prepared.action });
            return {
                status: 'aguardando_confirmacao_do_usuario',
                resumo: prepared.action.summary,
                nota: 'Um card de confirmação foi mostrado ao usuário. Não afirme que a ação foi concluída.',
            };
        }
        return prepared || { erro: 'Não foi possível preparar a ação.' };
    }

    try {
        const googleTool = GOOGLE_READ_TOOLS.find((t) => t.name === name);
        const result = googleTool ? await googleTool.execute(input) : await executeReadTool(name, input);
        return result ?? { erro: `Ferramenta desconhecida: ${name}` };
    } catch (err) {
        return { erro: `Falha ao executar ${name}: ${err.message}` };
    }
}

// ── Anthropic Claude (principal) ──
async function callAnthropic({ apiKey, model, messages, tools }) {
    const response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: 16000,
            // Chat ágil: esforço médio mantém respostas rápidas sem perder qualidade nas ferramentas.
            output_config: { effort: 'medium' },
            // Cache automático do prefixo estável (ferramentas + system + histórico).
            cache_control: { type: 'ephemeral' },
            system: SYSTEM_PROMPT,
            tools,
            messages,
        }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API ${response.status}: ${errorText}`);
    }
    return response.json();
}

function textFromClaude(reply) {
    return (reply.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
}

async function runClaude({ apiKey, incoming, tools }) {
    const model = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
    const ctx = { toolTrace: [], pendingActions: [] };
    const messages = incoming.map((m) => ({ role: m.role, content: m.content }));

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
        const reply = await callAnthropic({ apiKey, model, messages, tools });

        if (reply.stop_reason === 'refusal') {
            return { reply: 'Não consigo ajudar com esse pedido.', ...ctx };
        }

        if (reply.stop_reason === 'tool_use') {
            // Devolve o conteúdo inteiro (inclui blocos de thinking, que precisam voltar intactos).
            messages.push({ role: 'assistant', content: reply.content });
            const toolBlocks = reply.content.filter((block) => block.type === 'tool_use');
            const results = await Promise.all(toolBlocks.map((block) => runTool(block.name, block.input || {}, ctx)));
            messages.push({
                role: 'user',
                content: toolBlocks.map((block, i) => ({
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: JSON.stringify(results[i]),
                })),
            });
            continue;
        }

        const text = textFromClaude(reply);
        if (reply.stop_reason === 'max_tokens') {
            return { reply: `${text}\n\n(Resposta cortada por ser longa demais. Peça a continuação ou algo mais específico.)`.trim(), ...ctx };
        }
        return { reply: text || '(sem resposta)', ...ctx };
    }

    return { reply: 'Precisei consultar dados demais para responder de uma vez. Tenta reformular de forma mais específica?', ...ctx };
}

// ── Google Gemini (reserva) com fallback de modelo ──
let cachedWorkingModel = 'gemini-3.5-flash-lite';

async function callGemini({ apiKey, contents, tools }) {
    const candidateModels = [
        process.env.GEMINI_MODEL,
        cachedWorkingModel,
        'gemini-3.5-flash-lite',
        'gemini-3-flash-preview',
        'gemini-3.6-flash',
        'gemini-3.8-flash',
    ].filter(Boolean);

    const uniqueModels = [...new Set(candidateModels)];

    const functionDeclarations = tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
    }));

    const payload = {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        tools: [{ functionDeclarations }],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
        },
    };

    let lastError = null;
    for (const model of uniqueModels) {
        try {
            const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                cachedWorkingModel = model;
                return await response.json();
            }

            const errorData = await response.json().catch(() => ({}));
            lastError = new Error(`Gemini (${model}) ${response.status}: ${errorData.error?.message || response.statusText}`);
            // Se for 404 de modelo descontinuado, tenta o próximo da lista
            if (response.status === 404) continue;
            // Erro 503 (sobrecarga temporária), tenta o próximo modelo
            if (response.status === 503) continue;
            throw lastError;
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('Não foi possível conectar a nenhum modelo Gemini disponível.');
}

async function runGemini({ apiKey, incoming, tools }) {
    const ctx = { toolTrace: [], pendingActions: [] };
    const contents = incoming.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content || '' }],
    }));

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
        const result = await callGemini({ apiKey, contents, tools });
        const content = result.candidates?.[0]?.content;
        if (!content || !content.parts) {
            throw new Error('Resposta vazia da API do Gemini.');
        }

        const functionCalls = content.parts.filter((p) => p.functionCall);
        if (functionCalls.length > 0) {
            contents.push(content);
            for (const part of functionCalls) {
                const call = part.functionCall;
                const output = await runTool(call.name, call.args || {}, ctx);
                contents.push({
                    role: 'user',
                    parts: [{ functionResponse: { name: call.name, response: { output } } }],
                });
            }
            continue;
        }

        const text = content.parts.filter((p) => p.text).map((p) => p.text).join('\n').trim();
        return { reply: text || '(sem resposta)', ...ctx };
    }

    return { reply: 'Consultei muitos dados. Pode perguntar de forma mais específica?', ...ctx };
}

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    if (!isAuthenticatedRequest(req)) return res.status(401).json({ error: 'Unauthorized' });

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!geminiKey && !anthropicKey) {
        return res.status(500).json({
            error: 'Nenhuma chave de IA configurada. Adicione ANTHROPIC_API_KEY (ou GEMINI_API_KEY) no arquivo .env ou no painel da Vercel.',
        });
    }

    const rawIncoming = Array.isArray(req.body?.messages) ? req.body.messages : null;
    if (!rawIncoming || rawIncoming.length === 0) {
        return res.status(400).json({ error: 'Campo "messages" é obrigatório.' });
    }
    const incoming = rawIncoming.slice(-10);

    const clientMetaToken = req.headers['x-meta-token'] || req.body?.metaToken;

    return runWithMetaToken(clientMetaToken, async () => {
        const tools = allToolSchemas();
        const respond = ({ reply, toolTrace, pendingActions }) =>
            res.status(200).json({ reply, toolsUsed: toolTrace, pendingActions });

        if (anthropicKey) {
            try {
                return respond(await runClaude({ apiKey: anthropicKey, incoming, tools }));
            } catch (err) {
                console.error('[assistant-chat] erro Claude:', err);
                if (!geminiKey) {
                    return res.status(500).json({ error: 'Erro interno no assistente', details: String(err.message || err) });
                }
                console.warn('[assistant-chat] usando Gemini como reserva.');
            }
        }

        try {
            return respond(await runGemini({ apiKey: geminiKey, incoming, tools }));
        } catch (err) {
            console.error('[assistant-chat] erro Gemini:', err);
            return res.status(500).json({ error: 'Erro no assistente Gemini', details: String(err.message || err) });
        }
    });
}
