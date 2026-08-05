// api/_assistant-write-tools.js
// Ferramentas de ESCRITA do assistente (Onda 3), com guardrails.
//
// Fluxo human-in-the-loop:
//   1. No chat, o Claude "chama" uma ferramenta de escrita → roda `prepare()`,
//      que APENAS valida e monta uma proposta (NÃO altera nada).
//   2. A proposta volta ao front, que mostra botões Confirmar/Cancelar.
//   3. Ao confirmar, /api/assistant-action executa `EXECUTORS[type]` de fato
//      e grava no change_log.
//
// A IA nunca executa a mutação — só propõe.

import { resolveAccount, resolveCampaign, metaPost, normalize } from './_assistant-tools.js';
import { getSupabase, logChange } from './_supabase-server.js';

const PAYMENT_METHODS = ['credit_card', 'pix', 'boleto'];
const MAX_DAILY_BUDGET = 100000; // teto de sanidade (R$) para evitar erro grosseiro

// ─── Schemas apresentados ao Claude ──────────────────────────────────────────

export const WRITE_TOOLS = [
    {
        name: 'pause_campaign',
        description:
            'Prepara a PAUSA de uma campanha específica de uma conta. Requer confirmação do usuário antes de executar. Use quando pedirem para pausar/parar uma campanha.',
        input_schema: {
            type: 'object',
            properties: {
                conta: { type: 'string', description: 'Nome do cliente ou ID da conta.' },
                campanha: { type: 'string', description: 'Nome (ou parte) da campanha, ou o ID.' },
            },
            required: ['conta', 'campanha'],
        },
    },
    {
        name: 'activate_campaign',
        description:
            'Prepara a ATIVAÇÃO (reativar) de uma campanha pausada. Requer confirmação do usuário. Use quando pedirem para ativar/ligar/retomar uma campanha.',
        input_schema: {
            type: 'object',
            properties: {
                conta: { type: 'string', description: 'Nome do cliente ou ID da conta.' },
                campanha: { type: 'string', description: 'Nome (ou parte) da campanha, ou o ID.' },
            },
            required: ['conta', 'campanha'],
        },
    },
    {
        name: 'set_campaign_budget',
        description:
            'Prepara a alteração do ORÇAMENTO DIÁRIO de uma campanha (em reais). Requer confirmação do usuário. Use para "aumenta/reduz o orçamento da campanha X para R$Y".',
        input_schema: {
            type: 'object',
            properties: {
                conta: { type: 'string', description: 'Nome do cliente ou ID da conta.' },
                campanha: { type: 'string', description: 'Nome (ou parte) da campanha, ou o ID.' },
                orcamento_diario: { type: 'number', description: 'Novo orçamento diário em reais (ex: 50 para R$50,00).' },
            },
            required: ['conta', 'campanha', 'orcamento_diario'],
        },
    },
    {
        name: 'create_balance_alert',
        description:
            'Prepara a criação de um ALERTA DE SALDO BAIXO para uma conta (ou todas). Dispara quando o saldo fica abaixo do limite. Requer confirmação. Use para "me avisa quando o saldo do cliente X ficar abaixo de R$Y".',
        input_schema: {
            type: 'object',
            properties: {
                conta: { type: 'string', description: 'Nome do cliente, ID da conta, ou "todas" para aplicar a todas.' },
                limite: { type: 'number', description: 'Limite de saldo em reais. Abaixo disso, o alerta dispara.' },
            },
            required: ['conta', 'limite'],
        },
    },
    {
        name: 'set_account_payment_method',
        description:
            'Prepara a alteração do MÉTODO DE PAGAMENTO registrado para uma conta (cartão, pix ou boleto). Requer confirmação. Use para "muda o pagamento do cliente X para pix".',
        input_schema: {
            type: 'object',
            properties: {
                conta: { type: 'string', description: 'Nome do cliente ou ID da conta.' },
                metodo: { type: 'string', enum: PAYMENT_METHODS, description: 'credit_card, pix ou boleto.' },
            },
            required: ['conta', 'metodo'],
        },
    },
];

// ─── prepare(): valida e monta a proposta (NÃO altera nada) ──────────────────

async function prepareCampaignStatus(input, newStatus) {
    const { match: account, accounts } = await resolveAccount(input.conta);
    if (!account) {
        return { erro: `Nenhuma conta encontrada para "${input.conta}".`, contas_disponiveis: accounts.map((a) => a.name) };
    }
    const { match: campaign, campaigns } = await resolveCampaign(account.id, input.campanha);
    if (!campaign) {
        return { erro: `Nenhuma campanha "${input.campanha}" encontrada na conta ${account.name}.`, campanhas_disponiveis: campaigns.map((c) => c.name) };
    }
    const acao = newStatus === 'PAUSED' ? 'Pausar' : 'Ativar';
    return {
        requiresConfirmation: true,
        action: {
            type: newStatus === 'PAUSED' ? 'pause_campaign' : 'activate_campaign',
            summary: `${acao} a campanha "${campaign.name}" (atualmente ${campaign.status}) da conta ${account.name}.`,
            meta: {
                accountId: account.id,
                accountName: account.name,
                campaignId: campaign.id,
                campaignName: campaign.name,
                previousStatus: campaign.status,
                newStatus,
            },
        },
    };
}

export const PREPARERS = {
    pause_campaign: (input) => prepareCampaignStatus(input, 'PAUSED'),
    activate_campaign: (input) => prepareCampaignStatus(input, 'ACTIVE'),

    set_campaign_budget: async (input) => {
        const budget = Number(input.orcamento_diario);
        if (!Number.isFinite(budget) || budget <= 0) {
            return { erro: 'Orçamento inválido. Informe um valor em reais maior que zero.' };
        }
        if (budget > MAX_DAILY_BUDGET) {
            return { erro: `Orçamento de R$${budget} parece alto demais (teto de segurança R$${MAX_DAILY_BUDGET}). Confirme o valor.` };
        }
        const { match: account, accounts } = await resolveAccount(input.conta);
        if (!account) {
            return { erro: `Nenhuma conta encontrada para "${input.conta}".`, contas_disponiveis: accounts.map((a) => a.name) };
        }
        const { match: campaign, campaigns } = await resolveCampaign(account.id, input.campanha);
        if (!campaign) {
            return { erro: `Nenhuma campanha "${input.campanha}" encontrada na conta ${account.name}.`, campanhas_disponiveis: campaigns.map((c) => c.name) };
        }
        const previousBudget = campaign.daily_budget ? Number((Number(campaign.daily_budget) / 100).toFixed(2)) : null;
        if (previousBudget == null) {
            return { erro: `A campanha "${campaign.name}" não usa orçamento diário na campanha (pode ser orçamento por conjunto/CBO). Ajuste pelo painel.` };
        }
        return {
            requiresConfirmation: true,
            action: {
                type: 'set_campaign_budget',
                summary: `Alterar o orçamento diário da campanha "${campaign.name}" (${account.name}) de R$${previousBudget} para R$${budget.toFixed(2)}.`,
                meta: {
                    accountId: account.id,
                    accountName: account.name,
                    campaignId: campaign.id,
                    campaignName: campaign.name,
                    previousBudget,
                    newBudget: Number(budget.toFixed(2)),
                },
            },
        };
    },

    create_balance_alert: async (input) => {
        const limite = Number(input.limite);
        if (!Number.isFinite(limite) || limite < 0) {
            return { erro: 'Limite inválido. Informe um valor em reais (>= 0).' };
        }
        const isAll = normalize(input.conta) === 'todas' || normalize(input.conta) === 'todos' || normalize(input.conta) === 'all';
        let accountId = 'all';
        let accountName = 'todas as contas';
        if (!isAll) {
            const { match: account, accounts } = await resolveAccount(input.conta);
            if (!account) {
                return { erro: `Nenhuma conta encontrada para "${input.conta}".`, contas_disponiveis: accounts.map((a) => a.name) };
            }
            accountId = account.id;
            accountName = account.name;
        }
        return {
            requiresConfirmation: true,
            action: {
                type: 'create_balance_alert',
                summary: `Criar alerta de saldo baixo para ${accountName}: avisar quando o saldo ficar abaixo de R$${limite.toFixed(2)}.`,
                meta: { accountId, accountName, threshold: Number(limite.toFixed(2)) },
            },
        };
    },

    set_account_payment_method: async (input) => {
        const metodo = normalize(input.metodo).replace(/\s+/g, '_');
        if (!PAYMENT_METHODS.includes(metodo)) {
            return { erro: `Método inválido. Use um de: ${PAYMENT_METHODS.join(', ')}.` };
        }
        const { match: account, accounts } = await resolveAccount(input.conta);
        if (!account) {
            return { erro: `Nenhuma conta encontrada para "${input.conta}".`, contas_disponiveis: accounts.map((a) => a.name) };
        }
        let previousMethod = null;
        try {
            const { data } = await getSupabase().from('account_configs').select('payment_method').eq('account_id', account.id).maybeSingle();
            previousMethod = data?.payment_method || 'credit_card';
        } catch {
            previousMethod = null;
        }
        return {
            requiresConfirmation: true,
            action: {
                type: 'set_account_payment_method',
                summary: `Mudar o método de pagamento da conta ${account.name} para "${metodo}"${previousMethod ? ` (atual: ${previousMethod})` : ''}.`,
                meta: { accountId: account.id, accountName: account.name, method: metodo, previousMethod },
            },
        };
    },
};

// ─── EXECUTORS: rodam SÓ após confirmação (via /api/assistant-action) ────────

export const EXECUTORS = {
    pause_campaign: async (meta) => {
        await metaPost(`/${meta.campaignId}`, { status: 'PAUSED' });
        await logChange({
            clientName: meta.accountName, accountId: meta.accountId, campaignName: meta.campaignName,
            changeType: 'pause_campaign', description: `Campanha pausada via assistente.`,
            previousValue: meta.previousStatus, newValue: 'PAUSED',
        });
        return `Campanha "${meta.campaignName}" pausada.`;
    },

    activate_campaign: async (meta) => {
        await metaPost(`/${meta.campaignId}`, { status: 'ACTIVE' });
        await logChange({
            clientName: meta.accountName, accountId: meta.accountId, campaignName: meta.campaignName,
            changeType: 'activate_campaign', description: `Campanha ativada via assistente.`,
            previousValue: meta.previousStatus, newValue: 'ACTIVE',
        });
        return `Campanha "${meta.campaignName}" ativada.`;
    },

    set_campaign_budget: async (meta) => {
        const budget = Number(meta.newBudget);
        if (!Number.isFinite(budget) || budget <= 0 || budget > MAX_DAILY_BUDGET) {
            throw new Error('Orçamento inválido.');
        }
        await metaPost(`/${meta.campaignId}`, { daily_budget: Math.round(budget * 100) });
        await logChange({
            clientName: meta.accountName, accountId: meta.accountId, campaignName: meta.campaignName,
            changeType: 'set_budget', description: `Orçamento diário alterado via assistente.`,
            previousValue: meta.previousBudget != null ? `R$${meta.previousBudget}` : null, newValue: `R$${budget.toFixed(2)}`,
        });
        return `Orçamento da campanha "${meta.campaignName}" alterado para R$${budget.toFixed(2)}.`;
    },

    create_balance_alert: async (meta) => {
        const supabase = getSupabase();
        const { error } = await supabase.from('balance_alert_rules').insert({
            type: 'balance_low',
            account_id: meta.accountId,
            agency: 'all',
            threshold: meta.threshold,
            enabled: true,
        });
        if (error) throw new Error(error.message);
        await logChange({
            clientName: meta.accountName, accountId: meta.accountId === 'all' ? null : meta.accountId,
            changeType: 'create_alert', description: `Alerta de saldo baixo criado via assistente.`,
            newValue: `< R$${meta.threshold}`,
        });
        return `Alerta de saldo criado para ${meta.accountName} (abaixo de R$${meta.threshold}).`;
    },

    set_account_payment_method: async (meta) => {
        if (!PAYMENT_METHODS.includes(meta.method)) throw new Error('Método inválido.');
        const supabase = getSupabase();
        const { error } = await supabase.from('account_configs').upsert(
            { account_id: meta.accountId, payment_method: meta.method, updated_at: new Date().toISOString() },
            { onConflict: 'account_id' },
        );
        if (error) throw new Error(error.message);
        await logChange({
            clientName: meta.accountName, accountId: meta.accountId,
            changeType: 'set_payment_method', description: `Método de pagamento alterado via assistente.`,
            previousValue: meta.previousMethod, newValue: meta.method,
        });
        return `Método de pagamento da conta ${meta.accountName} alterado para ${meta.method}.`;
    },
};

// Executa uma ferramenta de escrita no CHAT = apenas preparar a proposta.
export async function prepareWriteTool(name, input) {
    const preparer = PREPARERS[name];
    if (!preparer) return null; // não é ferramenta de escrita
    try {
        return await preparer(input || {});
    } catch (err) {
        return { erro: `Falha ao preparar ${name}: ${err.message}` };
    }
}

// Executa a ação já confirmada pelo usuário.
export async function executeConfirmedAction(action) {
    if (!action || !action.type) throw new Error('Ação inválida.');
    const executor = EXECUTORS[action.type];
    if (!executor) throw new Error(`Ação desconhecida: ${action.type}`);
    return executor(action.meta || {});
}

export function writeToolSchemas() {
    return WRITE_TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}

export function isWriteTool(name) {
    return !!PREPARERS[name];
}
