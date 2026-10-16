/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import actionHandler from '../api/assistant-action.js';
import { runTool } from '../api/assistant-chat.js';
import { executeConfirmedAction, prepareWriteTool } from '../api/_assistant-write-tools.js';
import { readMemory, readMemorySafe, memoryKey, validateProfile, saveProfile, updateRecommendation } from '../api/_assistant-memory.js';
import { signIntelligenceAction, verifyIntelligenceAction, profilePatch, observationFromTool } from '../api/_assistant-intelligence-tools.js';
import { diagnoseAccount, resolveAccount } from '../api/_assistant-tools.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const metric = { spend: '100', impressions: '5000', inline_link_clicks: '100', inline_link_click_ctr: '2', frequency: '2', actions: [{ action_type: 'lead', value: '10' }] };
function setup(t, customMeta) {
    const vars = { AUTH_EMAIL: 'owner@test.local', AUTH_PASS: 'test-secret', AUTH_SESSION_SECRET: 'session-secret',
        SUPABASE_URL: 'https://db.test.local', SUPABASE_SERVICE_ROLE_KEY: 'service-test-only', META_ACCESS_TOKEN: crypto.randomUUID() };
    const original = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
    Object.assign(process.env, vars);
    const oldFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = oldFetch; for (const [k, v] of Object.entries(original)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
    const state = { assistant_client_context: [], assistant_recommendations: [], writes: 0, fail: false, seenMeta: [] };
    globalThis.fetch = async (input, options = {}) => {
        const url = new URL(input);
        if (url.hostname === 'graph.facebook.com') {
            state.seenMeta.push(url);
            if (customMeta) { const response = customMeta(url); if (response) return response; }
            if (url.pathname.endsWith('/me/adaccounts')) return reply({ data: [{ id: 'act_123', account_id: '123', name: 'Cliente A', currency: 'BRL', timezone_name: 'America/Bahia' }] });
            if (url.pathname.endsWith('/campaigns')) return reply({ data: [{ id: 'c1', name: 'Campanha', status: 'ACTIVE', insights: { data: [metric] } }] });
            return reply({ data: [url.searchParams.get('level') === 'ad' ? { ...metric, ad_id: 'a1', ad_name: 'Anúncio' } : metric] });
        }
        assert.equal(url.hostname, 'db.test.local');
        assert.equal(new Headers(options.headers).get('apikey'), 'service-test-only');
        if (state.fail) return reply({ message: 'missing relation', code: '42P01' }, 404);
        const table = url.pathname.split('/').at(-1);
        assert.ok(Array.isArray(state[table]), `Tabela inesperada ${table}`);
        const matches = row => [...url.searchParams].every(([key, value]) => {
            if (['select', 'order', 'limit', 'on_conflict', 'columns'].includes(key)) return true;
            assert.ok(value.startsWith('eq.'));
            return String(row[key]) === value.slice(3);
        });
        let selected = state[table].filter(matches);
        if (options.method === 'POST') {
            state.writes++;
            const row = JSON.parse(options.body);
            const existing = state[table].find(r => table === 'assistant_recommendations' ? r.id === row.id : r.owner_email === row.owner_email && r.platform === row.platform && r.account_id === row.account_id);
            if (!existing) state[table].push({ status: 'suggested', history: [], created_at: '2026-10-15T12:00:00Z', updated_at: '2026-10-15T12:00:00Z', ...row });
            selected = [row];
        }
        if (options.method === 'PATCH') {
            state.writes++;
            for (const row of selected) Object.assign(row, JSON.parse(options.body));
        }
        const limit = Number(url.searchParams.get('limit'));
        if (limit > 0) selected = selected.slice(0, limit);
        return reply(selected);
    };
    return state;
}

test('normaliza IDs e rejeita valores inválidos sem coerção silenciosa', () => {
    assert.deepEqual(memoryKey('meta', '123'), memoryKey('meta', 'act_123'));
    assert.equal(memoryKey('google', '123-456-7890').account_id, '1234567890');
    for (const values of [['unknown', '123'], ['meta', ''], ['google', '1 OR 1']]) assert.throws(() => memoryKey(...values));
    for (const ficha of [{ meta_custo: -1 }, { meta_custo: 0 }, { meta_custo: Infinity }, { margem_percentual: 101 }, { meta_custo: '12' }, { owner_email: 'attacker' }, {}]) assert.throws(() => validateProfile(ficha));
    assert.deepEqual(profilePatch({ remover_campos: ['meta_custo'] }), { meta_custo: null });
    assert.throws(() => profilePatch({ ficha: { meta_custo: 10 }, remover_campos: ['meta_custo'] }));
});

test('preparar ficha não grava; confirmação salva e edição parcial preserva valores', async t => {
    const state = setup(t);
    const prepared = await prepareWriteTool('save_client_context', { conta: '123', ficha: { objetivo: 'Leads qualificados', conversao_principal: 'leads', meta_custo: 20 } });
    assert.equal(prepared.requiresConfirmation, true);
    assert.equal(state.writes, 0);
    assert.match(prepared.action.summary, /20/);
    await executeConfirmedAction(signIntelligenceAction({ id: crypto.randomUUID(), ...prepared.action }));
    let memory = await readMemory('meta', '123');
    assert.equal(memory.ficha.meta_custo, 20);
    await saveProfile('meta', 'act_123', 'Cliente A', { meta_custo: 25, objetivo: null }, memory.ficha_atualizada_em);
    memory = await readMemory('meta', '123');
    assert.equal(memory.ficha.meta_custo, 25);
    assert.equal(memory.ficha.conversao_principal, 'leads');
    assert.equal(memory.ficha.objetivo, undefined);
    await assert.rejects(() => saveProfile('meta', '123', 'Cliente A', { meta_custo: 99 }, 'stale'), /mudou/);
});

test('assinatura recusa alteração, expiração e troca de proprietário', t => {
    setup(t);
    const action = signIntelligenceAction({ id: 'a', type: 'save_client_context', summary: 'Ficha', meta: { accountId: 'act_123', patch: { meta_custo: 20 } } });
    assert.doesNotThrow(() => verifyIntelligenceAction(action));
    assert.throws(() => verifyIntelligenceAction({ ...action, meta: { ...action.meta, patch: { meta_custo: 200 } } }), /inválida/);
    assert.throws(() => verifyIntelligenceAction({ ...action, expiresAt: 1 }), /expirada/);
    process.env.AUTH_EMAIL = 'other@test.local';
    assert.throws(() => verifyIntelligenceAction(action), /inválida/);
});

test('diagnóstico coleta 14 dias iguais em todos os níveis e carrega ficha', async t => {
    const state = setup(t);
    state.assistant_client_context.push({ owner_email: 'owner@test.local', platform: 'meta', account_id: 'act_123', profile: { conversao_principal: 'leads', meta_custo: 5 } });
    const result = await diagnoseAccount({ conta: '123', periodo: '14d' });
    assert.equal(result.metricas_atuais.resultados, 10);
    assert.equal(result.memoria.ficha.meta_custo, 5);
    assert.ok(result.evidencias.some(e => e.tipo === 'custo_acima_da_meta'));
    for (const url of state.seenMeta.filter(url => url.pathname.endsWith('/insights'))) {
        assert.equal(url.searchParams.has('date_preset'), false);
        const range = JSON.parse(url.searchParams.get('time_range'));
        assert.equal((Date.parse(range.until) - Date.parse(range.since)) / 86400000 + 1, 14);
    }
    const campaign = state.seenMeta.find(url => url.pathname.endsWith('/campaigns'));
    assert.ok(campaign.searchParams.get('fields').includes(JSON.stringify(result.periodo_atual)));
});

test('erros de API e banco não se tornam ausência de problemas ou sucesso', async t => {
    const state = setup(t, url => url.searchParams.get('level') === 'ad' ? reply({ error: { message: 'API indisponível' } }, 503) : null);
    state.fail = true;
    const result = await diagnoseAccount({ conta: '123' });
    assert.equal(result.cobertura.anuncios_atuais.completa, false);
    assert.equal(result.cobertura.anuncios_atuais.linhas, null);
    assert.equal(result.memoria.disponivel, false);
    assert.match(result.limitacoes.join(' '), /API indisponível/);
    const action = await prepareWriteTool('save_client_context', { conta: '123', ficha: { meta_custo: 20 } });
    assert.ok(action.erro);
    assert.equal(action.requiresConfirmation, undefined);
    assert.equal(state.writes, 0);
});

test('recomendação exige observação real, salva uma vez e permite relato confirmado', async t => {
    const state = setup(t);
    state.assistant_client_context.push({ owner_email: 'owner@test.local', platform: 'meta', account_id: 'act_123', profile: { conversao_principal: 'leads' } });
    const context = { toolTrace: [], pendingActions: [], observations: new Map() };
    const plan = { conta: '123', titulo: 'Testar oferta', hipotese: 'A proposta pode não estar clara', acao: 'Testar nova copy', criterio_avaliacao: 'Comparar após volume e maturação suficientes' };
    assert.match((await prepareWriteTool('save_recommendation', plan, context)).erro, /primeiro/);
    await runTool('diagnose_account', { conta: '123' }, context);
    await runTool('save_recommendation', { ...plan, evidence: { investimento: 999 } }, context);
    assert.equal(state.writes, 0);
    const action = context.pendingActions[0];
    assert.equal(action.meta.evidence.metricas_atuais.investimento, 100);
    await executeConfirmedAction(action);
    await executeConfirmedAction(action);
    assert.equal(state.assistant_recommendations.length, 1);
    assert.equal(state.assistant_recommendations[0].status, 'suggested');
    const memory = await readMemory('meta', '123');
    assert.equal(memory.recomendacoes[0].plan.titulo, plan.titulo);
    assert.equal(memory.recomendacoes[0].owner_email, undefined);
    const followup = await prepareWriteTool('record_recommendation_followup', { conta: '123', recomendacao_id: action.meta.recommendationId, status: 'reviewed', relato: 'Ainda não tenho volume para concluir.' });
    await executeConfirmedAction(signIntelligenceAction({ id: crypto.randomUUID(), ...followup.action }));
    assert.equal(state.assistant_recommendations[0].history[0].source, 'relato_do_gestor');
    assert.equal(state.assistant_recommendations[0].history[0].causalidade, 'nao_comprovada');
});

test('memória isola conta, plataforma e dono; escrita em recomendação alheia é recusada', async t => {
    const state = setup(t);
    state.assistant_recommendations.push({ id: 'other', owner_email: 'other@test.local', platform: 'meta', account_id: 'act_123', plan: {}, evidence: {} },
        { id: 'account', owner_email: 'owner@test.local', platform: 'meta', account_id: 'act_456', plan: {}, evidence: {} },
        { id: 'google', owner_email: 'owner@test.local', platform: 'google', account_id: '123', plan: {}, evidence: {} });
    assert.equal((await readMemory('meta', '123')).recomendacoes.length, 0);
    await assert.rejects(() => updateRecommendation({ platform: 'meta', accountId: '123', recommendationId: 'other', status: 'executed', relato: 'Teste' }), /não encontrada/);
    assert.equal(state.writes, 0);
});

test('sem service role informa indisponibilidade sem fallback público', async t => {
    setup(t);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const result = await readMemorySafe('meta', '123');
    assert.equal(result.disponivel, false);
    assert.match(result.erro, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('endpoint de confirmação recusa acesso sem cookie autenticado', async () => {
    const res = { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await actionHandler({ method: 'POST', headers: {}, body: { action: { type: 'save_client_context' } } }, res);
    assert.equal(res.code, 401);
});

test('nomes exatos duplicados exigem ID da conta', async t => {
    setup(t, url => url.pathname.endsWith('/me/adaccounts') ? reply({ data: [
        { id: 'act_123', account_id: '123', name: 'Cliente' }, { id: 'act_456', account_id: '456', name: 'Cliente' },
    ] }) : null);
    assert.equal((await resolveAccount('Cliente')).match, undefined);
    assert.equal((await resolveAccount('123')).match.id, 'act_123');
    assert.ok((await prepareWriteTool('save_client_context', { conta: 'Cliente', ficha: { meta_custo: 20 } })).erro);
});

test('snapshot preserva evidências por entidade sem incorporar memória recursiva', () => {
    const result = observationFromTool('diagnose_account', { id: 'act_123', campanhas: [{ id: 'c1' }], revisao_de_gasto: { anuncios: [{ id: 'a1' }] },
        hipoteses_fadiga: [{ id: 'a2' }], candidatos_a_teste_de_escala: [{ id: 'a3' }], memoria: { recomendacoes: [] } });
    assert.equal(result.revisao_de_gasto.anuncios[0].id, 'a1');
    assert.equal(result.campanhas[0].id, 'c1');
    assert.equal(result.memoria, undefined);
});

test('acompanhamento recupera recomendação por ID fora das 20 mais recentes', async t => {
    const state = setup(t);
    const base = { owner_email: 'owner@test.local', platform: 'meta', account_id: 'act_123', plan: { titulo: 'Teste' }, evidence: {}, updated_at: '2026-01-01T00:00:00Z' };
    for (let i = 0; i < 25; i++) state.assistant_recommendations.push({ ...base, id: crypto.randomUUID() });
    const id = state.assistant_recommendations[24].id;
    assert.equal((await readMemory('meta', '123')).recomendacoes.length, 20);
    const prepared = await prepareWriteTool('record_recommendation_followup', { conta: '123', recomendacao_id: id, status: 'rejected', relato: 'Decidi encerrar este teste.' });
    assert.equal(prepared.requiresConfirmation, true);
    assert.equal(prepared.action.meta.recommendationId, id);
});
