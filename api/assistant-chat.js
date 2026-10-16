/* global process */

// api/assistant-chat.js
// Motor do assistente conversacional. Anthropic Claude é o principal; Google Gemini
// entra como reserva (sem chave Anthropic ou se o Claude falhar).
// Executa loop de tool-use com leitura imediata e guardrails de confirmação para escrita.

import crypto from 'node:crypto';
import { SYSTEM_PROMPT } from './_assistant-prompt.js';
import { INTELLIGENCE_READ_TOOLS, observationFromTool, signIntelligenceAction } from './_assistant-intelligence-tools.js';
import { isAuthenticatedRequest } from './_auth.js';
import { executeReadTool, readToolSchemas, runWithMetaToken } from './_assistant-tools.js';
import { GOOGLE_READ_TOOLS } from './_assistant-google-tools.js';
import { ANALYST_READ_TOOLS } from './_assistant-analyst-tools.js';
import { prepareWriteTool, writeToolSchemas, isWriteTool } from './_assistant-write-tools.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
// Modelos que aceitam fallback server-side `"default"` (recusas de classificador são reenviadas a outro modelo).
const SERVER_FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Análise de analista desce conta → campanha → conjunto → anúncio → segmento; precisa de mais rodadas.
const MAX_TOOL_ITERATIONS = 16;
// A função tem 300s; a partir daqui pedimos a conclusão com o que já foi apurado.
const WRAP_UP_AFTER_MS = 170_000;
// Perguntas de análise (gargalo, diagnóstico, comparação) recebem esforço alto; consultas pontuais, médio.
const DEEP_ANALYSIS = /gargal|diagn[oó]st|analis|análise|por ?que|porqu|piorou|caiu|subiu|aument|otimiz|estrat|sugest|recomend|melhor|carteira|todas as contas|compar|funil|criativ|p[uú]blico|escal/i;

// ANTHROPIC_EFFORT fixa o esforço; sem ela, escolhe pelo último pedido do usuário.
export function pickEffort(messages, forced = process.env.ANTHROPIC_EFFORT) {
    if (forced) return forced;
    const last = [...messages].reverse().find((m) => m.role === 'user' && typeof m.content === 'string');
    return last && DEEP_ANALYSIS.test(last.content) ? 'high' : 'medium';
}

const WRAP_UP_NOTE = 'Limite de tempo/consultas desta resposta atingido. Responda agora com o que já foi apurado, sem chamar novas ferramentas, e diga claramente o que ficou sem verificar.';

const schemaOf = ({ name, description, input_schema }) => ({ name, description, input_schema });
const EXTRA_READ_TOOLS = [...GOOGLE_READ_TOOLS, ...ANALYST_READ_TOOLS, ...INTELLIGENCE_READ_TOOLS];

function allToolSchemas() {
    return [...readToolSchemas(), ...EXTRA_READ_TOOLS.map(schemaOf), ...writeToolSchemas()];
}

// Executa uma chamada de ferramenta: leitura roda na hora; escrita só vira proposta.
export async function runTool(name, input, context) {
    const { toolTrace, pendingActions } = context;
    toolTrace.push({ tool: name, input });

    if (isWriteTool(name)) {
        const prepared = await prepareWriteTool(name, input, context);
        if (prepared?.requiresConfirmation) {
            pendingActions.push(signIntelligenceAction({ id: crypto.randomUUID(), ...prepared.action }));
            return {
                status: 'aguardando_confirmacao_do_usuario',
                resumo: prepared.action.summary,
                nota: 'Um card de confirmação foi mostrado ao usuário. Não afirme que a ação foi concluída.',
            };
        }
        return prepared || { erro: 'Não foi possível preparar a ação.' };
    }

    try {
        const extraTool = EXTRA_READ_TOOLS.find((t) => t.name === name);
        const result = extraTool ? await extraTool.execute(input) : await executeReadTool(name, input);
        const observation = observationFromTool(name, result);
        if (observation) context.observations.set(`${observation.platform}:${observation.id}`, observation);
        return result ?? { erro: `Ferramenta desconhecida: ${name}` };
    } catch (err) {
        return { erro: `Falha ao executar ${name}: ${err.message}` };
    }
}

// ── Anthropic Claude (principal) ──
async function callAnthropic({ apiKey, model, messages, tools, effort }) {
    const fallback = SERVER_FALLBACK_MODELS.has(model);
    const response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            ...(fallback ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
        },
        body: JSON.stringify({
            model,
            max_tokens: 16000,
            // Esforço por pedido: alto só onde a análise cruza muitos sinais (latência e custo menores no resto).
            output_config: { effort },
            // Cache automático do prefixo estável (ferramentas + system + histórico).
            cache_control: { type: 'ephemeral' },
            ...(fallback ? { fallbacks: 'default' } : {}),
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
    const ctx = { toolTrace: [], pendingActions: [], observations: new Map() };
    const messages = incoming.map((m) => ({ role: m.role, content: m.content }));
    // Fixado por requisição: mudar o esforço no meio do loop invalidaria o cache do prefixo.
    const effort = pickEffort(incoming);
    const startedAt = Date.now();
    let wrapUpSent = false;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
        const reply = await callAnthropic({ apiKey, model, messages, tools, effort });

        if (reply.stop_reason === 'refusal') {
            return { reply: 'Não consigo ajudar com esse pedido. Se for uma análise de conta, tente reformular de forma mais específica.', ...ctx };
        }

        if (reply.stop_reason === 'tool_use') {
            // Devolve o conteúdo inteiro (inclui blocos de thinking, que precisam voltar intactos).
            messages.push({ role: 'assistant', content: reply.content });
            const toolBlocks = reply.content.filter((block) => block.type === 'tool_use');
            const results = await Promise.all(toolBlocks.map((block) => runTool(block.name, block.input || {}, ctx)));
            const content = toolBlocks.map((block, i) => ({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(results[i]),
            }));
            // Aviso anexado (nunca editado depois) para manter o histórico append-only.
            const nearLimit = iteration >= MAX_TOOL_ITERATIONS - 2 || Date.now() - startedAt > WRAP_UP_AFTER_MS;
            if (nearLimit && !wrapUpSent) {
                content.push({ type: 'text', text: WRAP_UP_NOTE });
                wrapUpSent = true;
            }
            messages.push({ role: 'user', content });
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
let cachedWorkingModel = 'gemini-2.5-flash';

async function callGemini({ apiKey, contents, tools }) {
    const candidateModels = [
        process.env.GEMINI_MODEL,
        cachedWorkingModel,
        'gemini-2.5-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3-flash-preview',
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
            maxOutputTokens: 4096,
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
    const ctx = { toolTrace: [], pendingActions: [], observations: new Map() };
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
