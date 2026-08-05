// api/assistant-action.js
// Executa uma ação de escrita JÁ CONFIRMADA pelo usuário na interface.
// Só chega aqui depois de o usuário clicar "Confirmar" no card do assistente.
// Valida auth, executa a mutação real (Meta/Supabase) e grava no change_log.

import { isAuthenticatedRequest } from './_auth.js';
import { executeConfirmedAction } from './_assistant-write-tools.js';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    if (!isAuthenticatedRequest(req)) return res.status(401).json({ error: 'Unauthorized' });

    const action = req.body?.action;
    if (!action || typeof action !== 'object' || !action.type) {
        return res.status(400).json({ error: 'Campo "action" (com type e meta) é obrigatório.' });
    }

    try {
        const message = await executeConfirmedAction(action);
        return res.status(200).json({ ok: true, message });
    } catch (err) {
        console.error('[assistant-action] erro:', err);
        return res.status(500).json({ ok: false, error: String(err.message || err) });
    }
}
