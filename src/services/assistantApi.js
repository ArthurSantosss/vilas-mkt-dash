// src/services/assistantApi.js
// Cliente do assistente conversacional. Conversa com a Vercel function
// /api/assistant-chat, que executa o loop de tool-use com a Anthropic.

const ASSISTANT_ENDPOINT = '/api/assistant-chat';

/**
 * Envia o histórico da conversa e devolve a resposta do assistente.
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages
 * @returns {Promise<{ reply: string, toolsUsed: Array }>}
 */
export async function sendAssistantMessage(messages) {
    const response = await fetch(ASSISTANT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // envia o cookie de sessão para o isAuthenticatedRequest
        body: JSON.stringify({ messages }),
    });

    const text = await response.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.error || `Erro ${response.status} no assistente.`);
    }

    return { reply: data.reply || '', toolsUsed: data.toolsUsed || [] };
}
