// api/_assistant-google-tools.js
// Ferramentas do assistente para Google Ads. Reaproveitam as conexões privadas e as
// rotas de acesso (MCC/conta direta) do google-ads-proxy: o assistente nunca escolhe
// token nem login-customer-id por conta própria.
//
// Escrita segue o mesmo guardrail das ferramentas Meta: prepare() só monta a proposta;
// a mutação roda em EXECUTORS depois do clique em Confirmar.

import {
    fetchAccountOverview,
    googleAdsSearch,
    publicSnapshot,
    readConnections,
    readWithAuthorizedRoutes,
    resolveAccountRoute,
    updateCampaignBudget,
    updateCampaignStatus,
} from './google-ads-proxy.js';
import { normalize } from './_assistant-tools.js';
import { logChange } from './_supabase-server.js';
import { readMemorySafe } from './_assistant-memory.js';

const MAX_DAILY_BUDGET = 100000; // mesmo teto de sanidade das ferramentas Meta (R$)
const PERIODS = ['today', 'yesterday', '7d', '14d', '30d', 'month', 'last_month'];

const round2 = (value) => Number((Number(value) || 0).toFixed(2));

async function listGoogleAccounts() {
    return publicSnapshot(await readConnections()).accounts.filter((a) => !a.unavailable);
}

export async function resolveGoogleAccount(query) {
    const accounts = await listGoogleAccounts();
    const q = normalize(query).replace(/-/g, '');
    let match = accounts.find((a) => a.accountId === q);
    const exact = accounts.filter((a) => normalize(a.name) === normalize(query));
    if (!match && exact.length === 1) match = exact[0];
    if (!match && exact.length > 1) return { match: undefined, accounts };
    if (!match && q) {
        const candidates = accounts.filter((a) => normalize(a.name).includes(normalize(query)));
        if (candidates.length === 1) match = candidates[0];
    }
    return { match, accounts };
}

function googleAccountNotFound(conta, accounts) {
    return {
        erro: `Nenhuma conta Google Ads encontrada para "${conta}".`,
        contas_disponiveis: accounts.map((a) => a.name),
    };
}

function summarizeGoogleMetrics(m) {
    return {
        investimento: round2(m.spend),
        impressoes: m.impressions,
        cliques: m.clicks,
        ctr: round2(m.ctr),
        cpc: round2(m.cpc),
        cpm: round2(m.cpm),
        conversoes: round2(m.conversions),
        custo_por_conversao: m.conversions > 0 ? round2(m.costPerConversion) : null,
        valor_conversoes: round2(m.conversionsValue),
    };
}

// Lista as campanhas não removidas, mesmo sem veiculação no período (precisa para reativar).
async function listGoogleCampaigns(account) {
    const payload = await readWithAuthorizedRoutes({ customerId: account.accountId }, (token, route) => googleAdsSearch(
        route.accountId,
        `SELECT campaign.id, campaign.name, campaign.status, campaign_budget.id,
                campaign_budget.amount_micros, campaign_budget.explicitly_shared
         FROM campaign WHERE campaign.status != 'REMOVED'`,
        token,
        route.loginCustomerId,
    ));
    return (payload.results || []).map((row) => ({
        id: String(row.campaign?.id || ''),
        name: row.campaign?.name || '',
        status: row.campaign?.status || '',
        budgetId: row.campaignBudget?.id ? String(row.campaignBudget.id) : null,
        dailyBudget: row.campaignBudget?.amountMicros ? round2(Number(row.campaignBudget.amountMicros) / 1_000_000) : null,
        budgetShared: Boolean(row.campaignBudget?.explicitlyShared),
    }));
}

async function resolveGoogleCampaign(account, query) {
    const campaigns = await listGoogleCampaigns(account);
    const q = normalize(query);
    let match = campaigns.find((c) => c.id === q);
    if (!match) match = campaigns.find((c) => normalize(c.name) === q);
    if (!match) match = campaigns.find((c) => normalize(c.name).includes(q));
    return { match, campaigns };
}

// ─── LEITURA ─────────────────────────────────────────────────────────────────

export const GOOGLE_READ_TOOLS = [
    {
        name: 'list_google_accounts',
        description:
            'Lista as contas de Google Ads conectadas na plataforma (nome, ID e moeda). Use quando o usuário perguntar quais clientes têm Google Ads ou para descobrir o nome exato de uma conta Google.',
        input_schema: { type: 'object', properties: {}, required: [] },
        execute: async () => {
            const accounts = await listGoogleAccounts();
            return {
                total: accounts.length,
                contas: accounts.map((a) => ({ nome: a.name, id: a.accountId, moeda: a.currency })),
            };
        },
    },
    {
        name: 'get_google_account_overview',
        description:
            'Retorna as métricas de UMA conta Google Ads num período: totais (investimento, cliques, CTR, CPC, conversões, custo por conversão) e as campanhas com status, orçamento diário e métricas. Aceita nome do cliente ou ID da conta Google. Use para qualquer pergunta sobre performance no Google.',
        input_schema: {
            type: 'object',
            properties: {
                conta: { type: 'string', description: 'Nome do cliente ou ID da conta Google Ads (ex: "123-456-7890").' },
                periodo: { type: 'string', enum: PERIODS, description: 'Default: 7d.' },
            },
            required: ['conta'],
        },
        execute: async ({ conta, periodo = '7d' }) => {
            const { match, accounts } = await resolveGoogleAccount(conta);
            if (!match) return googleAccountNotFound(conta, accounts);
            const period = PERIODS.includes(periodo) ? periodo : '7d';
            const overview = await readWithAuthorizedRoutes({ customerId: match.accountId }, (token, route) =>
                fetchAccountOverview(token, route.accountId, period, route.loginCustomerId, route.timeZone));
            const memory = await readMemorySafe('google', match.accountId);
            return {
                conta: match.name,
                id: match.accountId,
                periodo: period,
                memoria: memory,
                limitacoes: ['Visão geral Google: conversões configuradas na plataforma; não separa o evento da ficha nem verifica qualidade comercial.'],
                totais: summarizeGoogleMetrics(overview.totals),
                campanhas: overview.campaigns.slice(0, 30).map((c) => ({
                    nome: c.name,
                    id: c.id,
                    status: c.status,
                    tipo: c.channelType,
                    orcamento_diario: c.dailyBudget ? round2(c.dailyBudget) : null,
                    metricas: summarizeGoogleMetrics(c.metrics),
                })),
            };
        },
    },
];

// ─── ESCRITA (prepare → confirmação → execute) ───────────────────────────────

const campaignInput = {
    type: 'object',
    properties: {
        conta: { type: 'string', description: 'Nome do cliente ou ID da conta Google Ads.' },
        campanha: { type: 'string', description: 'Nome (ou parte) da campanha, ou o ID.' },
    },
    required: ['conta', 'campanha'],
};

export const GOOGLE_WRITE_TOOLS = [
    {
        name: 'pause_google_campaign',
        description: 'Prepara a PAUSA de uma campanha do Google Ads. Requer confirmação do usuário antes de executar.',
        input_schema: campaignInput,
    },
    {
        name: 'activate_google_campaign',
        description: 'Prepara a ATIVAÇÃO de uma campanha pausada do Google Ads. Requer confirmação do usuário.',
        input_schema: campaignInput,
    },
    {
        name: 'set_google_campaign_budget',
        description:
            'Prepara a alteração do ORÇAMENTO DIÁRIO de uma campanha do Google Ads (em reais). Requer confirmação. Não altera orçamentos compartilhados entre campanhas.',
        input_schema: {
            type: 'object',
            properties: {
                ...campaignInput.properties,
                orcamento_diario: { type: 'number', description: 'Novo orçamento diário em reais (ex: 80 para R$80,00).' },
            },
            required: ['conta', 'campanha', 'orcamento_diario'],
        },
    },
];

async function resolveForWrite(input) {
    const { match: account, accounts } = await resolveGoogleAccount(input.conta);
    if (!account) return { erro: googleAccountNotFound(input.conta, accounts) };
    const { match: campaign, campaigns } = await resolveGoogleCampaign(account, input.campanha);
    if (!campaign) {
        return {
            erro: {
                erro: `Nenhuma campanha "${input.campanha}" encontrada na conta Google ${account.name}.`,
                campanhas_disponiveis: campaigns.map((c) => c.name),
            },
        };
    }
    return { account, campaign };
}

async function prepareGoogleStatus(input, newStatus) {
    const { account, campaign, erro } = await resolveForWrite(input);
    if (erro) return erro;
    const type = newStatus === 'PAUSED' ? 'pause_google_campaign' : 'activate_google_campaign';
    return {
        requiresConfirmation: true,
        action: {
            type,
            summary: `${newStatus === 'PAUSED' ? 'Pausar' : 'Ativar'} a campanha Google "${campaign.name}" (atualmente ${campaign.status}) da conta ${account.name}.`,
            meta: {
                customerId: account.accountId,
                connectionId: account.connectionId,
                accountName: account.name,
                campaignId: campaign.id,
                campaignName: campaign.name,
                previousStatus: campaign.status,
                newStatus,
            },
        },
    };
}

export const GOOGLE_PREPARERS = {
    pause_google_campaign: (input) => prepareGoogleStatus(input, 'PAUSED'),
    activate_google_campaign: (input) => prepareGoogleStatus(input, 'ENABLED'),
    set_google_campaign_budget: async (input) => {
        const budget = Number(input.orcamento_diario);
        if (!Number.isFinite(budget) || budget <= 0) {
            return { erro: 'Orçamento inválido. Informe um valor em reais maior que zero.' };
        }
        if (budget > MAX_DAILY_BUDGET) {
            return { erro: `Orçamento de R$${budget} parece alto demais (teto de segurança R$${MAX_DAILY_BUDGET}). Confirme o valor.` };
        }
        const { account, campaign, erro } = await resolveForWrite(input);
        if (erro) return erro;
        if (!campaign.budgetId) return { erro: `A campanha "${campaign.name}" não tem orçamento próprio editável.` };
        if (campaign.budgetShared) {
            return { erro: `A campanha "${campaign.name}" usa um orçamento compartilhado com outras campanhas. Ajuste pelo Google Ads para não afetar as demais.` };
        }
        return {
            requiresConfirmation: true,
            action: {
                type: 'set_google_campaign_budget',
                summary: `Alterar o orçamento diário da campanha Google "${campaign.name}" (${account.name}) de R$${campaign.dailyBudget} para R$${budget.toFixed(2)}.`,
                meta: {
                    customerId: account.accountId,
                    connectionId: account.connectionId,
                    accountName: account.name,
                    campaignId: campaign.id,
                    campaignName: campaign.name,
                    budgetId: campaign.budgetId,
                    previousBudget: campaign.dailyBudget,
                    newBudget: Number(budget.toFixed(2)),
                },
            },
        };
    },
};

async function executeGoogleStatus(meta, status) {
    if (!/^\d+$/.test(String(meta.campaignId || ''))) throw new Error('Campanha inválida.');
    const { customerId, route, accessToken } = await resolveAccountRoute({ customerId: meta.customerId, connectionId: meta.connectionId });
    await updateCampaignStatus(accessToken, customerId, meta.campaignId, status, route.loginCustomerId);
    await logChange({
        platform: 'google', clientName: meta.accountName, accountId: customerId, campaignName: meta.campaignName,
        changeType: status === 'PAUSED' ? 'pause_campaign' : 'activate_campaign',
        description: `Campanha Google ${status === 'PAUSED' ? 'pausada' : 'ativada'} via assistente.`,
        previousValue: meta.previousStatus, newValue: status,
    });
    return `Campanha Google "${meta.campaignName}" ${status === 'PAUSED' ? 'pausada' : 'ativada'}.`;
}

export const GOOGLE_EXECUTORS = {
    pause_google_campaign: (meta) => executeGoogleStatus(meta, 'PAUSED'),
    activate_google_campaign: (meta) => executeGoogleStatus(meta, 'ENABLED'),
    set_google_campaign_budget: async (meta) => {
        const budget = Number(meta.newBudget);
        if (!Number.isFinite(budget) || budget <= 0 || budget > MAX_DAILY_BUDGET) throw new Error('Orçamento inválido.');
        if (!/^\d+$/.test(String(meta.budgetId || ''))) throw new Error('Orçamento da campanha inválido.');
        const { customerId, route, accessToken } = await resolveAccountRoute({ customerId: meta.customerId, connectionId: meta.connectionId });
        await updateCampaignBudget(accessToken, customerId, meta.budgetId, budget, route.loginCustomerId);
        await logChange({
            platform: 'google', clientName: meta.accountName, accountId: customerId, campaignName: meta.campaignName,
            changeType: 'set_budget', description: 'Orçamento diário Google alterado via assistente.',
            previousValue: meta.previousBudget != null ? `R$${meta.previousBudget}` : null, newValue: `R$${budget.toFixed(2)}`,
        });
        return `Orçamento da campanha Google "${meta.campaignName}" alterado para R$${budget.toFixed(2)}.`;
    },
};
