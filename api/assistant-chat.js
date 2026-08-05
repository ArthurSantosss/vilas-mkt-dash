/* global process */

// api/assistant-chat.js
// Motor do assistente conversacional. Roda como Vercel function (mesma origem
// do app → reusa o cookie de login) e executa um loop de tool-use com a Anthropic.
//
// Ferramentas de LEITURA executam na hora. Ferramentas de ESCRITA apenas PREPARAM
// uma proposta (guardrail); a execução real acontece em /api/assistant-action
// depois que o usuário confirma na interface.

import crypto from 'node:crypto';
import { isAuthenticatedRequest } from './_auth.js';
import { executeReadTool, readToolSchemas } from './_assistant-tools.js';
import { prepareWriteTool, writeToolSchemas, isWriteTool } from './_assistant-write-tools.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
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
- Seja direto, técnico e prático.
- Ao dar números, contextualize (compare com período, aponte o que chama atenção).
- Se uma ferramenta retornar erro ou listas de opções, ajuste e tente de novo, ou peça o que falta.
- Formate de forma legível. Valores em R$.`;

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

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    if (!isAuthenticatedRequest(req)) return res.status(401).json({ error: 'Unauthorized' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    if (!apiKey) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no ambiente do servidor.' });
    }

    const incoming = Array.isArray(req.body?.messages) ? req.body.messages : null;
    if (!incoming || incoming.length === 0) {
        return res.status(400).json({ error: 'Campo "messages" é obrigatório.' });
    }

    const messages = incoming.map((m) => ({ role: m.role, content: m.content }));
    const tools = [...readToolSchemas(), ...writeToolSchemas()];
    const toolTrace = [];
    const pendingActions = [];

    try {
        let iterations = 0;
        while (iterations < MAX_TOOL_ITERATIONS) {
            iterations += 1;
            const reply = await callAnthropic({ apiKey, model, messages, tools });

            if (reply.stop_reason === 'tool_use') {
                messages.push({ role: 'assistant', content: reply.content });

                const toolResults = [];
                for (const block of reply.content) {
                    if (block.type !== 'tool_use') continue;
                    toolTrace.push({ tool: block.name, input: block.input });

                    if (isWriteTool(block.name)) {
                        // Ferramenta de escrita: apenas prepara a proposta (guardrail).
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
                        // Ferramenta de leitura: executa na hora.
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
        console.error('[assistant-chat] erro:', err);
        return res.status(500).json({ error: 'Erro interno no assistente', details: String(err.message || err) });
    }
}
