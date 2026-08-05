/* global process */

// api/_assistant-tools.js
// Ferramentas de LEITURA do assistente + helpers Meta compartilhados (usados
// também pelas ferramentas de escrita). Rodam server-side com o token Meta do
// servidor — o mesmo padrão do meta-proxy.

const META_API_BASE = 'https://graph.facebook.com/v22.0';

function getServerMetaToken() {
    return process.env.META_ACCESS_TOKEN || process.env.VITE_META_ACCESS_TOKEN || '';
}

// ─── Meta Graph helpers (server-side) ────────────────────────────────────────

export async function metaGet(path, params = {}) {
    const token = getServerMetaToken();
    if (!token) {
        throw new Error('Nenhum token Meta configurado no servidor (META_ACCESS_TOKEN).');
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
export async function metaPost(path, body = {}) {
    const token = getServerMetaToken();
    if (!token) {
        throw new Error('Nenhum token Meta configurado no servidor (META_ACCESS_TOKEN).');
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

export async function listAccountsRaw() {
    const data = await metaGet('/me/adaccounts', {
        fields: 'id,account_id,name,account_status,currency,balance,amount_spent',
        limit: 1000,
    });
    return data.data || [];
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
];

export async function executeReadTool(name, input) {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return null;
    return tool.execute(input || {});
}

export function readToolSchemas() {
    return TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}
