/* global process */

// api/assistant-chat.js
// Motor do assistente conversacional. Suporta Google Gemini (gratuito) e Anthropic Claude.
// Executa loop de tool-use com leitura imediata e guardrails de confirmação para escrita.

import crypto from 'node:crypto';
import { isAuthenticatedRequest } from './_auth.js';
import { executeReadTool, readToolSchemas, runWithMetaToken } from './_assistant-tools.js';
import { prepareWriteTool, writeToolSchemas, isWriteTool } from './_assistant-write-tools.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TOOL_ITERATIONS = 6;

const SYSTEM_PROMPT = `Você é o assistente da plataforma VilasMKT, um painel de gestão de tráfego pago (Meta Ads) usado por um gestor profissional. Você conversa DIRETAMENTE com o gestor (não com o cliente final).

Seu papel: ajudar o gestor a consultar e entender os dados das contas dos clientes, comparar performance, sugerir melhorias e, quando pedido, PREPARAR alterações no sistema.

CONHECIMENTO DE DOMÍNIO:
- "Cliente" e "conta de anúncio" são a mesma coisa. O usuário fala pelo nome do cliente; use as ferramentas para resolver o nome na conta certa.
- "Leads" = conversas iniciadas por mensagem (ou lead forms). É a métrica principal.
- Custo por lead: quanto MENOR, melhor. Queda = melhora; alta = piora.

FERRAMENTAS DE LEITURA (list/get/rank): retornam dados na hora. Use sempre que a pergunta depender de números; nunca invente métricas.

FERRAMENTAS DE ESCRITA (pause/activate/set_budget/create_alert/set_payment_method): elas NÃO executam nada imediatamente — apenas PREPARAM uma proposta que o usuário vai confirmar na interface com um botão. Quando usar uma:
- Confirme para o usuário, em uma frase clara, o que você preparou e que basta ele confirmar no card que apareceu.
- NÃO diga que já executou. Diga que está aguardando a confirmação dele.
- Se faltar informação (qual campanha, qual valor), pergunte antes de preparar.

REGRAS GERAIS:
- Responda de forma ágil, direta e concisa. Evite rodeios ou introduções longas; vá direto aos números e fatos.
- Use listas ou tópicos curtos e claros.
- Ao dar números, contextualize de forma breve.
- Formate de forma legível. Valores em R$.`;

// ── Chamada Anthropic Claude ──
async function callAnthropic({ apiKey, model, messages, tools }) {
    const response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens: 2048, system: SYSTEM_PROMPT, tools, messages }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API ${response.status}: ${errorText}`);
    }
    return response.json();
}

// ── Chamada Google Gemini com Fallback de Modelo ──
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

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    if (!isAuthenticatedRequest(req)) return res.status(401).json({ error: 'Unauthorized' });

    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!geminiKey && !anthropicKey) {
        return res.status(500).json({
            error: 'Nenhuma chave de IA configurada. Adicione GEMINI_API_KEY ou ANTHROPIC_API_KEY no arquivo .env ou no painel da Vercel.',
        });
    }

    const rawIncoming = Array.isArray(req.body?.messages) ? req.body.messages : null;
    if (!rawIncoming || rawIncoming.length === 0) {
        return res.status(400).json({ error: 'Campo "messages" é obrigatório.' });
    }
    const incoming = rawIncoming.slice(-10);

    const clientMetaToken = req.headers['x-meta-token'] || req.body?.metaToken;

    return runWithMetaToken(clientMetaToken, async () => {
        const tools = [...readToolSchemas(), ...writeToolSchemas()];
        const toolTrace = [];
        const pendingActions = [];

        // ── Fluxo 1: Google Gemini (Prioritário se configurado) ──
        if (geminiKey) {
        try {
            // Converte o histórico para o formato do Gemini
            const contents = incoming.map((m) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content || '' }],
            }));

            let iterations = 0;
            while (iterations < MAX_TOOL_ITERATIONS) {
                iterations += 1;
                const result = await callGemini({ apiKey: geminiKey, contents, tools });
                const candidate = result.candidates?.[0];
                const content = candidate?.content;

                if (!content || !content.parts) {
                    throw new Error('Resposta vazia da API do Gemini.');
                }

                // Verifica chamadas de função
                const functionCalls = content.parts.filter((p) => p.functionCall);

                if (functionCalls.length > 0) {
                    contents.push(content);

                    for (const part of functionCalls) {
                        const call = part.functionCall;
                        toolTrace.push({ tool: call.name, input: call.args || {} });

                        let toolOutput;
                        if (isWriteTool(call.name)) {
                            const prepared = await prepareWriteTool(call.name, call.args || {});
                            if (prepared?.requiresConfirmation) {
                                const id = crypto.randomUUID();
                                pendingActions.push({ id, ...prepared.action });
                                toolOutput = {
                                    status: 'aguardando_confirmacao_do_usuario',
                                    resumo: prepared.action.summary,
                                    nota: 'Card de confirmação mostrado ao gestor. NÃO diga que executou.',
                                };
                            } else {
                                toolOutput = prepared || { erro: 'Não foi possível preparar a ação.' };
                            }
                        } else {
                            try {
                                const readRes = await executeReadTool(call.name, call.args || {});
                                toolOutput = readRes ?? { erro: `Ferramenta ${call.name} não retornou dados.` };
                            } catch (err) {
                                toolOutput = { erro: `Falha em ${call.name}: ${err.message}` };
                            }
                        }

                        contents.push({
                            role: 'user',
                            parts: [{
                                functionResponse: {
                                    name: call.name,
                                    response: { output: toolOutput },
                                },
                            }],
                        });
                    }
                    continue;
                }

                // Resposta final em texto
                const text = content.parts
                    .filter((p) => p.text)
                    .map((p) => p.text)
                    .join('\n')
                    .trim();

                return res.status(200).json({
                    reply: text || '(sem resposta)',
                    toolsUsed: toolTrace,
                    pendingActions,
                });
            }

            return res.status(200).json({
                reply: 'Consultei muitos dados. Pode perguntar de forma mais específica?',
                toolsUsed: toolTrace,
                pendingActions,
            });
        } catch (err) {
            console.error('[assistant-chat] erro Gemini:', err);
            return res.status(500).json({ error: 'Erro no assistente Gemini', details: String(err.message || err) });
        }
    }

    // ── Fluxo 2: Anthropic Claude (Fallback) ──
    try {
        const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
        const messages = incoming.map((m) => ({ role: m.role, content: m.content }));

        let iterations = 0;
        while (iterations < MAX_TOOL_ITERATIONS) {
            iterations += 1;
            const reply = await callAnthropic({ apiKey: anthropicKey, model, messages, tools });

            if (reply.stop_reason === 'tool_use') {
                messages.push({ role: 'assistant', content: reply.content });

                const toolResults = [];
                for (const block of reply.content) {
                    if (block.type !== 'tool_use') continue;
                    toolTrace.push({ tool: block.name, input: block.input });

                    if (isWriteTool(block.name)) {
                        const prepared = await prepareWriteTool(block.name, block.input);
                        let resultForModel;
                        if (prepared?.requiresConfirmation) {
                            const id = crypto.randomUUID();
                            pendingActions.push({ id, ...prepared.action });
                            resultForModel = {
                                status: 'aguardando_confirmacao_do_usuario',
                                resumo: prepared.action.summary,
                                nota: 'Um card de confirmação foi mostrado ao usuário. Não afirme que a ação foi concluída.',
                            };
                        } else {
                            resultForModel = prepared || { erro: 'Não foi possível preparar a ação.' };
                        }
                        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(resultForModel) });
                    } else {
                        let result;
                        try {
                            result = await executeReadTool(block.name, block.input);
                            if (result === null) result = { erro: `Ferramenta desconhecida: ${block.name}` };
                        } catch (err) {
                            result = { erro: `Falha ao executar ${block.name}: ${err.message}` };
                        }
                        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
                    }
                }
                messages.push({ role: 'user', content: toolResults });
                continue;
            }

            const text = (reply.content || [])
                .filter((b) => b.type === 'text')
                .map((b) => b.text)
                .join('\n')
                .trim();

            return res.status(200).json({
                reply: text || '(sem resposta)',
                toolsUsed: toolTrace,
                pendingActions,
            });
        }

        return res.status(200).json({
            reply: 'Precisei consultar dados demais para responder de uma vez. Tenta reformular de forma mais específica?',
            toolsUsed: toolTrace,
            pendingActions,
        });
        } catch (err) {
            console.error('[assistant-chat] erro Claude:', err);
            return res.status(500).json({ error: 'Erro interno no assistente', details: String(err.message || err) });
        }
    });
}
