/* global process */

// api/_supabase-server.js
// Cliente Supabase para uso server-side (ações de escrita do assistente + log).
// Usa as mesmas credenciais anon que o front já usa (app single-user).

import { createClient } from '@supabase/supabase-js';

let cached = null;

export function getSupabase() {
    if (cached) return cached;
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
        throw new Error('Supabase não configurado no servidor (SUPABASE_URL / SUPABASE_ANON_KEY).');
    }
    cached = createClient(url, key, { auth: { persistSession: false } });
    return cached;
}

// Registra uma alteração no change_log (mesma tabela usada pelo módulo de log).
export async function logChange({
    platform = 'meta',
    clientName,
    accountId = null,
    campaignName = null,
    changeType,
    description,
    previousValue = null,
    newValue = null,
}) {
    const supabase = getSupabase();
    const { error } = await supabase.from('change_log').insert({
        platform,
        client_name: clientName,
        account_id: accountId,
        campaign_name: campaignName,
        change_type: changeType,
        description,
        previous_value: previousValue != null ? String(previousValue) : null,
        new_value: newValue != null ? String(newValue) : null,
        impact: 'pending',
    });
    if (error) {
        // Não falha a ação por causa do log, mas registra no console do servidor.
        console.error('[assistant] falha ao gravar change_log:', error.message);
    }
}
