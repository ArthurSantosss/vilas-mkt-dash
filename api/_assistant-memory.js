/* global process */
import { createClient } from '@supabase/supabase-js';
import { getConfiguredAuth } from './_auth.js';

export const PROFILE_FIELDS = {
    objetivo: { type: 'string', description: 'Objetivo comercial informado pelo gestor.' },
    conversao_principal: { type: 'string', enum: ['mensagens', 'leads', 'compras'], description: 'Meta: evento usado no diagnóstico. Google usa as conversões configuradas na plataforma.' },
    oferta: { type: 'string', description: 'Produto/serviço e oferta.' },
    regiao: { type: 'string' },
    lead_qualificado: { type: 'string', description: 'Critério comercial para um contato qualificado.' },
    meta_custo: { type: 'number', description: 'Custo desejado por conversão principal, na moeda da conta; maior que zero.' },
    orcamento_mensal: { type: 'number' },
    ticket_medio: { type: 'number' },
    margem_percentual: { type: 'number', minimum: 0, maximum: 100 },
    atraso_conversao_dias: { type: 'integer', minimum: 0, maximum: 90, description: 'Dias esperados até as conversões aparecerem, informado pelo gestor.' },
    observacoes: { type: 'string' },
};

export function validateProfile(input) {
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('Ficha inválida.');
    const output = {};
    for (const [key, value] of Object.entries(input)) {
        if (!Object.hasOwn(PROFILE_FIELDS, key)) throw new Error(`Campo de ficha desconhecido: ${key}.`);
        const field = PROFILE_FIELDS[key];
        if (value === null) { output[key] = null; continue; }
        if (field.type === 'string') {
            if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new Error(`Texto inválido para ${key}.`);
            if (field.enum && !field.enum.includes(value)) throw new Error('Conversão principal inválida.');
            output[key] = value.trim();
        } else {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > (field.maximum ?? 1e9)
                || (key === 'meta_custo' && value === 0) || (field.type === 'integer' && !Number.isInteger(value))) {
                throw new Error(`Valor inválido para ${key}.`);
            }
            output[key] = value;
        }
    }
    if (!Object.keys(output).length) throw new Error('Informe pelo menos um campo da ficha.');
    return output;
}

export function validatePlan(input) {
    const output = {};
    for (const key of ['titulo', 'hipotese', 'acao', 'criterio_avaliacao']) {
        const value = input?.[key];
        if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new Error(`Informe ${key} (até 2000 caracteres).`);
        output[key] = value.trim();
    }
    return output;
}

export function memoryKey(platform, accountId) {
    if (!['meta', 'google'].includes(platform)) throw new Error('Plataforma inválida.');
    const raw = String(accountId || '').trim();
    const id = platform === 'meta' ? raw.replace(/^act_/, '') : raw.replace(/-/g, '');
    if (!/^\d+$/.test(id)) throw new Error('ID da conta inválido.');
    return { platform, account_id: platform === 'meta' ? `act_${id}` : id };
}

function storage() {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { authorizedEmail } = getConfiguredAuth();
    if (!url || !key || !authorizedEmail) {
        throw new Error('Memória indisponível: configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e AUTH_EMAIL no servidor e aplique a migração assistant_intelligence.');
    }
    return { db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), owner: authorizedEmail };
}

function check(error) {
    if (error) throw new Error('Não foi possível acessar a memória. Verifique a conexão e a migração 20261015000000_assistant_intelligence.sql no Supabase.');
}

function scoped(db, table, owner, key) {
    return db.from(table).select('*').eq('owner_email', owner).eq('platform', key.platform).eq('account_id', key.account_id);
}

export async function readMemory(platform, accountId) {
    const key = memoryKey(platform, accountId);
    const { db, owner } = storage();
    const [profile, history] = await Promise.all([
        scoped(db, 'assistant_client_context', owner, key).maybeSingle(),
        scoped(db, 'assistant_recommendations', owner, key).order('created_at', { ascending: false }).limit(20),
    ]);
    check(profile.error); check(history.error);
    return {
        disponivel: true,
        ficha: profile.data?.profile || null,
        ficha_atualizada_em: profile.data?.updated_at || null,
        recomendacoes: (history.data || []).map(({ owner_email: _owner, ...row }) => ({ ...row,
            history: (row.history || []).slice(-10), total_acompanhamentos: (row.history || []).length })),
        limite_historico: 20,
    };
}

export async function readMemorySafe(platform, accountId) {
    try { return await readMemory(platform, accountId); }
    catch (error) { return { disponivel: false, erro: error.message }; }
}

export async function readRecommendation(platform, accountId, id) {
    const key = memoryKey(platform, accountId);
    const { db, owner } = storage();
    const result = await scoped(db, 'assistant_recommendations', owner, key).eq('id', id).maybeSingle();
    check(result.error);
    if (!result.data) throw new Error('Recomendação não encontrada nesta conta.');
    const { owner_email: _owner, ...row } = result.data;
    return row;
}

export async function saveProfile(platform, accountId, accountName, patch, expectedUpdatedAt) {
    const fields = validateProfile(patch);
    const key = memoryKey(platform, accountId);
    const { db, owner } = storage();
    const current = await scoped(db, 'assistant_client_context', owner, key).maybeSingle();
    check(current.error);
    if ((current.data?.updated_at || null) !== (expectedUpdatedAt || null)) throw new Error('A ficha mudou desde a proposta. Consulte novamente antes de salvar.');
    const profile = { ...(current.data?.profile || {}), ...fields };
    for (const field of Object.keys(profile)) if (profile[field] === null) delete profile[field];
    const updatedAt = new Date(Math.max(Date.now(), (Date.parse(current.data?.updated_at) || 0) + 1)).toISOString();
    const row = { owner_email: owner, ...key, account_name: accountName, profile, updated_at: updatedAt };
    const result = current.data
        ? await db.from('assistant_client_context').update(row).eq('owner_email', owner).eq('platform', key.platform)
            .eq('account_id', key.account_id).eq('updated_at', current.data.updated_at).select('account_id')
        : await db.from('assistant_client_context').insert(row).select('account_id');
    check(result.error);
    if (!result.data?.length) throw new Error('A ficha mudou durante a gravação. Atualize a proposta.');
}

export async function saveRecommendation(meta) {
    const plan = validatePlan(meta.plan);
    const key = memoryKey(meta.platform, meta.accountId);
    if (!/^[a-f0-9-]{36}$/i.test(meta.recommendationId || '') || !meta.evidence?.consultado_em || meta.evidence.id !== key.account_id) {
        throw new Error('Recomendação sem evidência válida da conta.');
    }
    const { db, owner } = storage();
    // Idempotência: um segundo clique nunca sobrescreve decisões/resultado existentes.
    const result = await db.from('assistant_recommendations').upsert({
        id: meta.recommendationId, owner_email: owner, ...key,
        account_name: meta.accountName, plan, evidence: meta.evidence,
    }, { onConflict: 'id', ignoreDuplicates: true });
    check(result.error);
}

export function validateFollowup(input) {
    if (!['accepted', 'rejected', 'executed', 'reviewed'].includes(input?.status)) throw new Error('Status inválido.');
    if (typeof input.relato !== 'string' || !input.relato.trim() || input.relato.length > 3000) throw new Error('Informe o relato do gestor (até 3000 caracteres).');
    return { status: input.status, relato: input.relato.trim() };
}

export async function updateRecommendation(meta) {
    const update = validateFollowup(meta);
    const key = memoryKey(meta.platform, meta.accountId);
    const { db, owner } = storage();
    const current = await scoped(db, 'assistant_recommendations', owner, key).eq('id', meta.recommendationId).maybeSingle();
    check(current.error);
    if (!current.data) throw new Error('Recomendação não encontrada nesta conta.');
    if (current.data.updated_at !== meta.expectedUpdatedAt) throw new Error('A recomendação mudou. Consulte o histórico antes de atualizar.');
    const now = new Date(Math.max(Date.now(), Date.parse(current.data.updated_at) + 1)).toISOString();
    const result = await db.from('assistant_recommendations').update({
        status: update.status,
        history: [...(current.data.history || []), { ...update, date: now, source: 'relato_do_gestor', causalidade: 'nao_comprovada' }],
        updated_at: now,
    }).eq('id', meta.recommendationId).eq('owner_email', owner).eq('platform', key.platform)
        .eq('account_id', key.account_id).eq('updated_at', meta.expectedUpdatedAt).select('id');
    check(result.error);
    if (!result.data?.length) throw new Error('A recomendação mudou durante a gravação. Atualize a proposta.');
}
