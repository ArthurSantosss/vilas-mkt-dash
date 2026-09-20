// src/services/assistantApi.js
// Cliente do assistente conversacional. Conversa com as Vercel functions
// /api/assistant-chat (chat + tool-use) e /api/assistant-action (executa ações
// de escrita já confirmadas pelo usuário).

function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const storedAuth = localStorage.getItem('vilasmkt_auth');
        if (storedAuth) {
            const parsed = JSON.parse(storedAuth);
            if (parsed?.email) headers['x-auth-email'] = parsed.email;
        }
        const token = localStorage.getItem('meta_provider_token');
        if (token) headers['x-meta-token'] = token;
    } catch {
        // segue com headers básicos
    }
    return headers;
}

async function postJson(endpoint, payload) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include', // envia o cookie de sessão para o isAuthenticatedRequest
        body: JSON.stringify(payload),
    });
    const text = await response.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = {};
    }
    if (!response.ok) {
        throw new Error(data.error || `Erro ${response.status}.`);
    }
    return data;
}

/**
 * Envia o histórico da conversa e devolve a resposta do assistente.
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages
 * @returns {Promise<{ reply: string, toolsUsed: Array, pendingActions: Array }>}
 */
export async function sendAssistantMessage(messages) {
    const metaToken = typeof window !== 'undefined' ? localStorage.getItem('meta_provider_token') : null;
    const data = await postJson('/api/assistant-chat', { messages, metaToken });
    return {
        reply: data.reply || '',
        toolsUsed: data.toolsUsed || [],
        pendingActions: data.pendingActions || [],
    };
}

/**
 * Executa uma ação de escrita já confirmada pelo usuário.
 * @param {object} action - objeto { id, type, summary, meta } vindo de pendingActions
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function confirmAssistantAction(action) {
    const metaToken = typeof window !== 'undefined' ? localStorage.getItem('meta_provider_token') : null;
    const data = await postJson('/api/assistant-action', { action, metaToken });
    return { ok: !!data.ok, message: data.message || '' };
}
