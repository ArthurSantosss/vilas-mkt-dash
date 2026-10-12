/* global process */

// api/_assistant-tools.js
// Ferramentas de LEITURA do assistente + helpers Meta compartilhados (usados
// também pelas ferramentas de escrita). Rodam server-side com o token Meta do
// servidor — o mesmo padrão do meta-proxy.

import { AsyncLocalStorage } from 'node:async_hooks';
import { normalizeAdAccountId, readMetaConnectionsSafe, resolveConnectionForAccount } from './_meta-tokens.js';
import { getSupabase } from './_supabase-server.js';

const META_API_BASE = 'https://graph.facebook.com/v22.0';

export const metaTokenStorage = new AsyncLocalStorage();

// Carrega os tokens de BM do registro (mesma fonte do meta-proxy) junto com o token
// de perfil da requisição, para o assistente enxergar as mesmas contas que o painel.
export async function runWithMetaToken(token, fn) {
    const connections = await readMetaConnectionsSafe();
    return metaTokenStorage.run({ token, connections }, fn);
}

function profileToken() {
    return metaTokenStorage.getStore()?.token || process.env.META_ACCESS_TOKEN || process.env.VITE_META_ACCESS_TOKEN || '';
}

// Token de BM que cobre a conta tem prioridade; sem cobertura, cai no token de perfil.
function getEffectiveMetaToken(accountId) {
    const connections = metaTokenStorage.getStore()?.connections || [];
    const bmToken = accountId ? resolveConnectionForAccount(connections, accountId)?.token : null;
    return bmToken || profileToken();
}

function accountFromPath(path) {
    return normalizeAdAccountId(String(path).replace(/^\//, '').split('/')[0]);
}

// ─── Meta Graph helpers (server-side) ────────────────────────────────────────

// `accountId` escolhe o token quando o caminho não começa pela conta (ex.: /{campanha}).
export async function metaGet(path, params = {}, { accountId, token: explicitToken } = {}) {
    const token = explicitToken || getEffectiveMetaToken(accountId || accountFromPath(path));
    if (!token) {
        throw new Error('Nenhum token Meta ativo encontrado.');
    }

    const url = new URL(`${META_API_BASE}${path.startsWith('/') ? path : '/' + path}`);
    url.searchParams.append('access_token', token);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) url.searchParams.append(key, value);
    }

    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
        const metaError = data.error || {};
        throw new Error(metaError.message || `Erro Meta API (${response.status})`);
    }
    return data;
}

// POST à Graph API (mutações: status/orçamento de campanha). Token vai no body,
// nunca em query, para não vazar em logs.
export async function metaPost(path, body = {}, { accountId } = {}) {
    const token = getEffectiveMetaToken(accountId || accountFromPath(path));
    if (!token) {
        throw new Error('Nenhum token Meta ativo encontrado.');
    }

    const url = `${META_API_BASE}${path.startsWith('/') ? path : '/' + path}`;
    const formData = new URLSearchParams();
    formData.append('access_token', token);
    for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) formData.append(key, value);
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: formData.toString(),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
        const metaError = data.error || {};
        throw new Error(metaError.message || `Erro Meta API (${response.status})`);
    }
    return data;
}

export function presetFromPeriod(period) {
    switch (period) {
        case 'today': return 'today';
        case 'yesterday': return 'yesterday';
        case '7d': return 'last_7d';
        case '30d': return 'last_30d';
        case 'month': return 'this_month';
        default: return 'last_7d';
    }
}

// Normaliza texto para casar nomes de conta/campanha sem depender de acento/caixa.
export function normalize(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

// ─── Extração de métricas a partir das actions da Meta ───────────────────────

function actionValue(actions, type) {
    if (!Array.isArray(actions)) return 0;
    const found = actions.find((a) => a.action_type === type);
    return found ? Number.parseInt(found.value, 10) || 0 : 0;
}

// "Leads" no domínio deste negócio = conversas iniciadas por mensagem (ou lead forms).
function extractLeads(actions) {
    const messageTypes = [
        'onsite_conversion.messaging_conversation_started_7d',
        'messaging_conversation_started_7d',
        'onsite_conversion.messaging_first_reply',
        'messaging_first_reply',
    ];
    for (const type of messageTypes) {
        const v = actionValue(actions, type);
        if (v > 0) return v;
    }
    const leadTypes = ['lead', 'onsite_conversion.lead_grouped'];
    for (const type of leadTypes) {
        const v = actionValue(actions, type);
        if (v > 0) return v;
    }
    return 0;
}

export function summarizeInsights(insights) {
    if (!insights) return null;
    const spend = Number(insights.spend) || 0;
    const leads = extractLeads(insights.actions);
    return {
        investimento: Number(spend.toFixed(2)),
        impressoes: Number(insights.impressions) || 0,
        alcance: Number(insights.reach) || 0,
        frequencia: insights.frequency ? Number(Number(insights.frequency).toFixed(2)) : 0,
        cpm: insights.cpm ? Number(Number(insights.cpm).toFixed(2)) : 0,
        ctr: insights.ctr ? Number(Number(insights.ctr).toFixed(2)) : 0,
        cpc: insights.cpc ? Number(Number(insights.cpc).toFixed(2)) : 0,
        leads,
        custo_por_lead: leads > 0 ? Number((spend / leads).toFixed(2)) : null,
    };
}

// ─── Resolução de conta ("cliente") e campanha por nome ou ID ────────────────

const accountsCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 segundos

// União das contas de todos os tokens de BM + token de perfil (igual ao meta-proxy).
export async function listAccountsRaw(forceRefresh = false) {
    const connections = metaTokenStorage.getStore()?.connections || [];
    const tokens = [...new Set([...connections.map((c) => c.token), profileToken()].filter(Boolean))];
    if (tokens.length === 0) throw new Error('Nenhum token Meta ativo encontrado.');
    const cacheKey = tokens.map((t) => t.slice(-16)).join('|');
    const now = Date.now();
    const cached = accountsCache.get(cacheKey);

    if (!forceRefresh && cached && (now - cached.time < CACHE_TTL_MS)) {
        return cached.data;
    }

    const errors = [];
    const results = await Promise.all(tokens.map(async (token) => {
        try {
            const data = await metaGet('/me/adaccounts', {
                fields: 'id,account_id,name,account_status,currency,balance,amount_spent',
                limit: 1000,
            }, { token });
            return data.data || [];
        } catch (err) {
            errors.push(err.message);
            return [];
        }
    }));
    const merged = new Map();
    for (const account of results.flat()) {
        if (!merged.has(account.id)) merged.set(account.id, account);
    }
    if (merged.size === 0 && errors.length) throw new Error(errors[0]);
    const accounts = [...merged.values()];
    accountsCache.set(cacheKey, { data: accounts, time: now });
    return accounts;
}

export async function resolveAccount(query) {
    const accounts = await listAccountsRaw();
    const q = normalize(query);
    let match = accounts.find((a) => normalize(a.id) === q || normalize(a.account_id) === q);
    if (!match) match = accounts.find((a) => normalize(a.name) === q);
    if (!match) match = accounts.find((a) => normalize(a.name).includes(q));
    return { match, accounts };
}

// Busca as campanhas de uma conta (sem insights) e resolve uma por nome/ID.
export async function resolveCampaign(accountId, query) {
    const data = await metaGet(`/${accountId}/campaigns`, {
        fields: 'id,name,status,daily_budget,lifetime_budget',
        limit: 200,
    });
    const campaigns = data.data || [];
    const q = normalize(query);
    let match = campaigns.find((c) => normalize(c.id) === q);
    if (!match) match = campaigns.find((c) => normalize(c.name) === q);
    if (!match) match = campaigns.find((c) => normalize(c.name).includes(q));
    return { match, campaigns };
}

// ─── Períodos comparáveis (fuso de São Paulo) ────────────────────────────────

function todayInSaoPaulo(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).map((p) => [p.type, p.value]));
    return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

const ymd = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);

/** Período atual e o período anterior de mesmo tamanho, só com dias completos (exceto "month"). */
export function comparableRanges(period, now = new Date()) {
    const today = todayInSaoPaulo(now);
    if (period === 'month') {
        const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
        const prevFirst = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
        const prevMonthLast = addDays(first, -1);
        const prevUntil = new Date(Math.min(
            Date.UTC(prevFirst.getUTCFullYear(), prevFirst.getUTCMonth(), today.getUTCDate()),
            prevMonthLast.getTime(),
        ));
        return {
            atual: { since: ymd(first), until: ymd(today) },
            anterior: { since: ymd(prevFirst), until: ymd(prevUntil) },
        };
    }
    const days = { yesterday: 1, '7d': 7, '14d': 14, '30d': 30 }[period] || 7;
    return {
        atual: { since: ymd(addDays(today, -days)), until: ymd(addDays(today, -1)) },
        anterior: { since: ymd(addDays(today, -2 * days)), until: ymd(addDays(today, -days - 1)) },
    };
}

function variationPct(current, previous) {
    if (current == null || previous == null || previous === 0) return null;
    return Number((((current - previous) / previous) * 100).toFixed(1));
}

async function accountInsightsForRange(accountId, range) {
    const data = await metaGet(`/${accountId}/insights`, {
        fields: 'spend,impressions,cpm,cpc,ctr,actions,reach,frequency',
        level: 'account',
        time_range: JSON.stringify(range),
    });
    return summarizeInsights(data.data && data.data[0]);
}

function accountNotFound(conta, accounts) {
    return { erro: `Nenhuma conta encontrada para "${conta}".`, contas_disponiveis: accounts.map((a) => a.name) };
}

// ─── Definição das ferramentas de LEITURA (schema + executor) ────────────────

export const TOOLS = [
    {
        name: 'list_ad_accounts',
        description:
            'Lista todas as contas de anúncio (clientes) disponíveis, com nome, ID, status, moeda e saldo. Use quando o usuário perguntar "quais clientes/contas eu tenho" ou quando precisar descobrir o ID de uma conta a partir do nome do cliente.',
        input_schema: { type: 'object', properties: {}, required: [] },
        execute: async () => {
            const accounts = await listAccountsRaw();
            return {
                total: accounts.length,
                contas: accounts.map((a) => ({
                    nome: a.name,
                    id: a.id,
                    status: a.account_status === 1 ? 'ativa' : 'inativa',
                    moeda: a.currency,
                    saldo: a.balance != null ? Number((Number(a.balance) / 100).toFixed(2)) : null,
                    total_gasto: a.amount_spent != null ? Number((Number(a.amount_spent) / 100).toFixed(2)) : null,
                })),
            };
        },
    },
    {
        name: 'get_account_metrics',
        description:
            'Retorna as métricas agregadas de UMA conta (cliente) num período: investimento, impressões, alcance, frequência, CPM, CTR, CPC, leads e custo por lead. Aceita o nome do cliente ou o ID da conta. Use para "como está a conta do cliente X".',
        input_schema: {
            type: 'object',
            properties: {
                conta: { type: 'string', description: 'Nome do cliente ou ID da conta (ex: "Padaria do João" ou "act_123456").' },
                periodo: { type: 'string', enum: ['today', 'yesterday', '7d', '30d', 'month'], description: 'Período das métricas. Default: 7d.' },
            },
            required: ['conta'],
        },
        execute: async ({ conta, periodo = '7d' }) => {
            const { match, accounts } = await resolveAccount(conta);
            if (!match) {
                return { erro: `Nenhuma conta encontrada para "${conta}".`, contas_disponiveis: accounts.map((a) => a.name) };
            }
            const data = await metaGet(`/${match.id}/insights`, {
                fields: 'spend,impressions,cpm,cpc,ctr,actions,reach,frequency',
                level: 'account',
                date_preset: presetFromPeriod(periodo),
            });
            const insights = data.data && data.data.length > 0 ? data.data[0] : null;
            return { conta: match.name, id: match.id, periodo, metricas: summarizeInsights(insights) || 'Sem dados no período.' };
        },
    },
    {
        name: 'get_account_campaigns',
        description:
            'Lista as campanhas de UMA conta (cliente) num período, com status, orçamento e métricas por campanha (investimento, leads, custo por lead, CTR, CPM). Aceita nome do cliente ou ID. Use para "quais campanhas do cliente X estão rodando" ou para comparar campanhas.',
        input_schema: {
            type: 'object',
            properties: {
                conta: { type: 'string', description: 'Nome do cliente ou ID da conta.' },
                periodo: { type: 'string', enum: ['today', 'yesterday', '7d', '30d', 'month'], description: 'Período das métricas. Default: 7d.' },
            },
            required: ['conta'],
        },
        execute: async ({ conta, periodo = '7d' }) => {
            const { match, accounts } = await resolveAccount(conta);
            if (!match) {
                return { erro: `Nenhuma conta encontrada para "${conta}".`, contas_disponiveis: accounts.map((a) => a.name) };
            }
            const preset = presetFromPeriod(periodo);
            const data = await metaGet(`/${match.id}/campaigns`, {
                fields: `id,name,status,objective,daily_budget,lifetime_budget,insights.date_preset(${preset}){spend,impressions,cpm,cpc,ctr,actions,reach,frequency}`,
                limit: 50,
            });
            const campaigns = (data.data || []).map((c) => {
                const insights = c.insights && c.insights.data && c.insights.data[0];
                return {
                    nome: c.name,
                    id: c.id,
                    status: c.status,
                    objetivo: c.objective,
                    orcamento_diario: c.daily_budget ? Number((Number(c.daily_budget) / 100).toFixed(2)) : null,
                    metricas: summarizeInsights(insights),
                };
            });
            return { conta: match.name, id: match.id, periodo, total_campanhas: campaigns.length, campanhas: campaigns };
        },
    },
    {
        name: 'rank_accounts',
        description:
            'Compara TODAS as contas (clientes) num período e ordena por uma métrica. Use para "qual cliente está com o custo por lead pior/melhor", "quem gastou mais", "ranking de leads". Retorna a lista ordenada.',
        input_schema: {
            type: 'object',
            properties: {
                metrica: { type: 'string', enum: ['custo_por_lead', 'leads', 'investimento', 'ctr', 'cpm'], description: 'Métrica usada para ordenar.' },
                ordem: { type: 'string', enum: ['desc', 'asc'], description: 'desc = maior primeiro (default); asc = menor primeiro. Para custo_por_lead, asc lista os melhores primeiro.' },
                periodo: { type: 'string', enum: ['today', 'yesterday', '7d', '30d', 'month'], description: 'Período. Default: 7d.' },
            },
            required: ['metrica'],
        },
        execute: async ({ metrica, ordem = 'desc', periodo = '7d' }) => {
            const accounts = await listAccountsRaw();
            const ativos = accounts.filter((a) => a.account_status === 1);
            const preset = presetFromPeriod(periodo);
            const rows = await Promise.all(
                ativos.map(async (a) => {
                    try {
                        const data = await metaGet(`/${a.id}/insights`, {
                            fields: 'spend,impressions,cpm,cpc,ctr,actions,reach,frequency',
                            level: 'account',
                            date_preset: preset,
                        });
                        const insights = data.data && data.data.length > 0 ? data.data[0] : null;
                        const m = summarizeInsights(insights);
                        return { conta: a.name, id: a.id, ...(m || {}) };
                    } catch {
                        return { conta: a.name, id: a.id, erro: true };
                    }
                }),
            );
            const valid = rows.filter((r) => !r.erro && r[metrica] != null);
            valid.sort((x, y) => (ordem === 'asc' ? x[metrica] - y[metrica] : y[metrica] - x[metrica]));
            return { metrica, ordem, periodo, ranking: valid };
        },
    },
    {
        name: 'compare_periods',
        description:
            'Compara as métricas de UMA conta Meta (cliente) no período atual com o período anterior de mesmo tamanho e devolve a variação percentual de cada métrica. Use para "como a conta X está em relação à semana passada", "melhorou ou piorou", "o que mudou".',
        input_schema: {
            type: 'object',
            properties: {
                conta: { type: 'string', description: 'Nome do cliente ou ID da conta.' },
                periodo: {
                    type: 'string',
                    enum: ['yesterday', '7d', '14d', '30d', 'month'],
                    description: 'yesterday = ontem vs anteontem; 7d/14d/30d = últimos N dias completos vs N dias anteriores; month = mês até hoje vs mesmo trecho do mês passado. Default: 7d.',
                },
            },
            required: ['conta'],
        },
        execute: async ({ conta, periodo = '7d' }) => {
            const { match, accounts } = await resolveAccount(conta);
            if (!match) return accountNotFound(conta, accounts);
            const ranges = comparableRanges(periodo);
            const [atual, anterior] = await Promise.all([
                accountInsightsForRange(match.id, ranges.atual),
                accountInsightsForRange(match.id, ranges.anterior),
            ]);
            const variacao = {};
            if (atual && anterior) {
                for (const key of Object.keys(atual)) variacao[key] = variationPct(atual[key], anterior[key]);
            }
            return {
                conta: match.name,
                id: match.id,
                periodo_atual: ranges.atual,
                periodo_anterior: ranges.anterior,
                atual: atual || 'Sem dados no período.',
                anterior: anterior || 'Sem dados no período.',
                variacao_percentual: variacao,
                nota: 'Em custo_por_lead, CPM e CPC, variação positiva é piora. Em leads e CTR, positiva é melhora.',
            };
        },
    },
    {
        name: 'get_top_ads',
        description:
            'Lista os MELHORES ou PIORES anúncios (criativos) de uma conta Meta num período, pelo custo por lead. "piores" inclui primeiro os anúncios que gastaram sem gerar nenhum lead. Use para "quais criativos estão performando melhor/pior no cliente X".',
        input_schema: {
            type: 'object',
            properties: {
                conta: { type: 'string', description: 'Nome do cliente ou ID da conta.' },
                ordem: { type: 'string', enum: ['melhores', 'piores'], description: 'Default: melhores.' },
                periodo: { type: 'string', enum: ['today', 'yesterday', '7d', '30d', 'month'], description: 'Default: 7d.' },
                limite: { type: 'number', description: 'Quantos anúncios devolver (1 a 15). Default: 5.' },
            },
            required: ['conta'],
        },
        execute: async ({ conta, ordem = 'melhores', periodo = '7d', limite = 5 }) => {
            const { match, accounts } = await resolveAccount(conta);
            if (!match) return accountNotFound(conta, accounts);
            const data = await metaGet(`/${match.id}/insights`, {
                level: 'ad',
                fields: 'ad_id,ad_name,campaign_name,spend,impressions,cpm,ctr,inline_link_click_ctr,frequency,actions,reach',
                date_preset: presetFromPeriod(periodo),
                limit: 500,
            });
            const MIN_SPEND = 10;
            const ads = (data.data || [])
                .map((row) => ({
                    anuncio: row.ad_name,
                    id: row.ad_id,
                    campanha: row.campaign_name,
                    ctr_link: row.inline_link_click_ctr ? Number(Number(row.inline_link_click_ctr).toFixed(2)) : null,
                    ...summarizeInsights(row),
                }))
                .filter((ad) => ad.investimento >= MIN_SPEND);
            let ranked;
            if (ordem === 'piores') {
                const semLead = ads.filter((ad) => ad.leads === 0).sort((a, b) => b.investimento - a.investimento);
                const comLead = ads.filter((ad) => ad.leads > 0).sort((a, b) => b.custo_por_lead - a.custo_por_lead);
                ranked = [...semLead, ...comLead];
            } else {
                ranked = ads.filter((ad) => ad.leads > 0).sort((a, b) => a.custo_por_lead - b.custo_por_lead);
            }
            const n = Math.min(Math.max(Math.round(Number(limite) || 5), 1), 15);
            return {
                conta: match.name,
                periodo,
                ordem,
                criterio: `custo por lead; só anúncios com pelo menos R$${MIN_SPEND} de investimento`,
                total_analisados: ads.length,
                anuncios: ranked.slice(0, n),
            };
        },
    },
    {
        name: 'get_change_log',
        description:
            'Consulta o histórico de alterações registradas na plataforma (pausas, ativações, mudanças de orçamento, alertas, método de pagamento), de todas as contas ou de um cliente. Use para "o que eu mudei na conta X", "quais alterações fiz essa semana".',
        input_schema: {
            type: 'object',
            properties: {
                conta: { type: 'string', description: 'Nome do cliente (opcional). Sem isso, traz todas as contas.' },
                dias: { type: 'number', description: 'Quantos dias para trás (1 a 90). Default: 14.' },
            },
            required: [],
        },
        execute: async ({ conta, dias = 14 }) => {
            const days = Math.min(Math.max(Math.round(Number(dias) || 14), 1), 90);
            const since = new Date(Date.now() - days * 86_400_000).toISOString();
            let query = getSupabase()
                .from('change_log')
                .select('date,platform,client_name,campaign_name,change_type,description,previous_value,new_value')
                .gte('date', since)
                .order('date', { ascending: false })
                .limit(50);
            if (conta) query = query.ilike('client_name', `%${String(conta).replace(/[%_,()]/g, ' ').trim()}%`);
            const { data, error } = await query;
            if (error) return { erro: `Não foi possível ler o histórico: ${error.message}` };
            return {
                dias: days,
                conta: conta || 'todas',
                total: (data || []).length,
                alteracoes: (data || []).map((row) => ({
                    data: row.date,
                    plataforma: row.platform,
                    cliente: row.client_name,
                    campanha: row.campaign_name,
                    tipo: row.change_type,
                    descricao: row.description,
                    antes: row.previous_value,
                    depois: row.new_value,
                })),
            };
        },
    },
];

export async function executeReadTool(name, input) {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return null;
    return tool.execute(input || {});
}

export function readToolSchemas() {
    return TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}
