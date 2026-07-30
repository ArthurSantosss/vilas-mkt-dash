/* global process */

// api/assistant-chat.js
// Motor do assistente conversacional (Onda 1 — texto, somente leitura).
// Roda como Vercel function (mesma origem do app → reusa o cookie de login)
// e executa um loop de tool-use com a API da Anthropic.

import { isAuthenticatedRequest } from './_auth.js';
import { executeTool, toolSchemas } from './_assistant-tools.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOOL_ITERATIONS = 6;

const SYSTEM_PROMPT = `Você é o assistente da plataforma VilasMKT, um painel de gestão de tráfego pago (Meta Ads) usado por um gestor profissional. Você conversa DIRETAMENTE com o gestor (não com o cliente final).

Seu papel: ajudar o gestor a consultar e entender os dados das contas dos clientes, comparar performance e sugerir melhorias. Você tem ferramentas para ler dados reais das contas — use-as sempre que a pergunta depender de números; nunca invente métricas.

CONHECIMENTO DE DOMÍNIO:
- "Cliente" e "conta de anúncio" são a mesma coisa aqui. O usuário fala pelo nome do cliente; use as ferramentas para resolver o nome na conta certa.
- "Leads" = conversas iniciadas por mensagem (ou lead forms). É a métrica principal.
- Custo por lead: quanto MENOR, melhor. Queda = melhora; alta = piora.

REGRAS:
- Seja direto, técnico e prático — o gestor não precisa de rodeios.
- Ao dar números, contextualize (compare com período, aponte o que chama atenção).
- Se uma ferramenta retornar erro ou lista de contas disponíveis, ajuste e tente de novo, ou peça a informação que falta.
- Formate respostas de forma legível (pode usar listas e negrito). Valores em R$.
- Você é somente-leitura por enquanto: se pedirem para ALTERAR algo (pausar campanha, mudar orçamento, editar cliente), explique que essa capacidade ainda vai ser habilitada e que por ora você só consulta.`;

async function callAnthropic({ apiKey, model, messages }) {
    const response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            tools: toolSchemas(),
            messages,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API ${response.status}: ${errorText}`);
    }
    return response.json();
}

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!isAuthenticatedRequest(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    if (!apiKey) {
        return res.status(500).json({
            error: 'ANTHROPIC_API_KEY não configurada no ambiente do servidor.',
        });
    }

    // Aceita histórico de conversa vindo do front. Cada item: { role, content }.
    const incoming = Array.isArray(req.body?.messages) ? req.body.messages : null;
    if (!incoming || incoming.length === 0) {
        return res.status(400).json({ error: 'Campo "messages" é obrigatório.' });
    }

    // Trabalha sobre uma cópia; o loop vai anexando turnos de tool-use.
    const messages = incoming.map((m) => ({ role: m.role, content: m.content }));
    const toolTrace = [];

    try {
        let iterations = 0;
        while (iterations < MAX_TOOL_ITERATIONS) {
            iterations += 1;
            const reply = await callAnthropic({ apiKey, model, messages });

            if (reply.stop_reason === 'tool_use') {
                // Anexa o turno do assistente (com os blocos tool_use).
                messages.push({ role: 'assistant', content: reply.content });

                // Executa cada ferramenta pedida e devolve os resultados.
                const toolResults = [];
                for (const block of reply.content) {
                    if (block.type !== 'tool_use') continue;
                    const result = await executeTool(block.name, block.input);
                    toolTrace.push({ tool: block.name, input: block.input });
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: JSON.stringify(result),
                    });
                }
                messages.push({ role: 'user', content: toolResults });
                continue; // volta ao modelo com os resultados
            }

            // stop_reason === 'end_turn' (ou similar): extrai o texto final.
            const text = (reply.content || [])
                .filter((b) => b.type === 'text')
                .map((b) => b.text)
                .join('\n')
                .trim();

            return res.status(200).json({
                reply: text || '(sem resposta)',
                toolsUsed: toolTrace,
            });
        }

        return res.status(200).json({
            reply: 'Precisei consultar dados demais para responder isso de uma vez. Tenta reformular de forma mais específica?',
            toolsUsed: toolTrace,
        });
    } catch (err) {
        console.error('[assistant-chat] erro:', err);
        return res.status(500).json({ error: 'Erro interno no assistente', details: String(err.message || err) });
    }
}
