// api/_assistant-analyst-tools.js
// Ferramentas de LEITURA para aprofundar o diagnóstico: conjuntos, criativos, segmentos, série diária,
// carteira inteira e Google (parcela de impressões, termos e índice de qualidade).
// Os números vêm de _assistant-bottleneck.js; a IA interpreta, não calcula.

import { DIAGNOSTIC_FIELDS, diagnosticMetrics, diagnosticRanges, lastCompleteDays } from './_assistant-diagnosis.js';
import { AD_FIELDS, campaignFilter, diagnosticRows, fetchAdsets, listAccountsRaw, resolveAccount, resolveCampaign } from './_assistant-tools.js';
import { readMemorySafe } from './_assistant-memory.js';
import { resolveGoogleAccount } from './_assistant-google-tools.js';
import { googleAdsSearch, normalizePeriodToDateFilter, readWithAuthorizedRoutes } from './google-ads-proxy.js';
import {
    BREAKDOWNS, adsetStructure, breakdownAnalysis, creativeSignals, dailyTrend, googleBottlenecks, portfolioTriage, resolveEvent,
} from './_assistant-bottleneck.js';

const BREAKDOWN_FIELDS = 'spend,impressions,cpm,inline_link_clicks,inline_link_click_ctr,actions';
const PERIODS = ['yesterday', '7d', '14d', '30d', 'month'];
const PERIOD_DAYS = { yesterday: 1, '7d': 7, '14d': 14, '30d': 30 };

const accountInput = (extra = {}, required = []) => ({
    type: 'object',
    properties: {
        conta: { type: 'string', description: 'Nome do cliente ou ID da conta Meta.' },
        periodo: { type: 'string', enum: PERIODS, description: 'Dias completos. Default: 7d.' },
        campanha: { type: 'string', description: 'Opcional: nome (ou parte) ou ID de uma campanha para filtrar.' },
        ...extra,
    },
    required: ['conta', ...required],
});

// Resolve conta, janela, ficha, campanha e evento. Evento sem ficha é inferido e sinalizado.
async function analysisContext({ conta, periodo = '7d', campanha }) {
    const { match, accounts } = await resolveAccount(conta);
    if (!match) return { erro: { erro: `Nenhuma conta encontrada para "${conta}".`, contas_disponiveis: accounts.map((a) => a.name) } };
    const period = PERIODS.includes(periodo) ? periodo : '7d';
    const ranges = diagnosticRanges(period, new Date(), match.timezone_name || 'America/Sao_Paulo');
    if (!ranges) return { erro: { erro: 'Ainda não há dias completos neste mês. Use 7d ou yesterday.' } };
    let campaign = null;
    if (campanha) {
        const resolved = await resolveCampaign(match.id, campanha);
        if (!resolved.match) return { erro: { erro: `Campanha "${campanha}" não encontrada.`, campanhas: resolved.campaigns.slice(0, 40).map((c) => c.name) } };
        campaign = resolved.match;
    }
    const memory = await readMemorySafe('meta', match.id);
    const days = PERIOD_DAYS[period] ?? (Date.parse(ranges.atual.until) - Date.parse(ranges.atual.since)) / 86400000 + 1;
    return { match, ranges, campaign, memory, days, period };
}

// Evento: ficha primeiro; sem ficha, o de maior volume no nível da conta (ou campanha filtrada).
async function eventFor(ctx) {
    if (ctx.memory.ficha?.conversao_principal) return { evento: ctx.memory.ficha.conversao_principal, inferido: false };
    const totals = await diagnosticRows(`/${ctx.match.id}/insights`, {
        level: ctx.campaign ? 'campaign' : 'account', fields: DIAGNOSTIC_FIELDS,
        time_range: JSON.stringify(ctx.ranges.atual), filtering: campaignFilter(ctx.campaign),
    });
    return resolveEvent(null, totals.rows?.[0]);
}

function header(ctx, event) {
    const limitations = [];
    if (event.inferido) limitations.push(`Conversão principal inferida pelo maior volume (${event.evento}); confirme na ficha.`);
    if (!event.evento) limitations.push('Sem conversão principal na ficha e sem volume para inferir: custos por resultado indisponíveis.');
    if (!ctx.memory.disponivel && ctx.memory.erro) limitations.push(ctx.memory.erro);
    return {
        conta: ctx.match.name, id: ctx.match.id, moeda: ctx.match.currency, periodo: ctx.period,
        periodo_atual: ctx.ranges.atual, periodo_anterior: ctx.ranges.anterior,
        campanha: ctx.campaign ? { id: ctx.campaign.id, nome: ctx.campaign.name } : 'todas',
        conversao_principal: event.evento, conversao_inferida: event.inferido,
        meta_custo: ctx.memory.ficha?.meta_custo ?? null,
        limitacoes: limitations,
    };
}

const coverage = (sources) => Object.entries(sources).filter(([, r]) => !r.complete).map(([name, r]) => `${name}: ${r.error}`);

const analyzeAdsets = {
    name: 'analyze_adsets',
    description: 'Estrutura dos conjuntos de anúncios ATIVOS de uma conta Meta: fase de aprendizado (inclusive "aprendizado limitado"), evento de otimização, estratégia de lance, orçamento, resultados por semana estimados contra a referência de ~50 eventos, fragmentação e otimização desalinhada com o objetivo. Use quando o gargalo for estrutura/entrega ou para planejar consolidação e escala.',
    input_schema: accountInput(),
    execute: async (input) => {
        const ctx = await analysisContext(input);
        if (ctx.erro) return ctx.erro;
        const event = await eventFor(ctx);
        const adsets = await fetchAdsets(ctx.match.id, ctx.ranges.atual, ctx.campaign);
        const structure = adsetStructure(adsets.rows || [], { event: event.evento, days: ctx.days });
        const head = header(ctx, event);
        head.limitacoes.push(...coverage({ conjuntos: adsets }));
        return { ...head, ...structure, conjuntos: structure.conjuntos.slice(0, 25), limite_conjuntos_exibidos: 25 };
    },
};

const analyzeCreatives = {
    name: 'analyze_creatives',
    description: 'Diagnóstico de criativos Meta por anúncio: rankings de qualidade/engajamento/conversão da Meta, hook rate e hold rate (vídeo), CTR de link contra a mediana da própria conta, fadiga (queda de CTR com frequência subindo vs período anterior), dias no ar, formato, participação no gasto, gasto sem resultado e destaques. Use quando o gargalo for atração ou conversão, ou para decidir quais criativos renovar/escalar.',
    input_schema: accountInput({ limite: { type: 'number', description: 'Quantos anúncios devolver (5 a 30). Default: 15.' } }),
    execute: async (input) => {
        const ctx = await analysisContext(input);
        if (ctx.erro) return ctx.erro;
        const event = await eventFor(ctx);
        const params = (range) => ({ level: 'ad', fields: AD_FIELDS, time_range: JSON.stringify(range), filtering: campaignFilter(ctx.campaign) });
        const [current, previous, meta] = await Promise.all([
            diagnosticRows(`/${ctx.match.id}/insights`, params(ctx.ranges.atual)),
            diagnosticRows(`/${ctx.match.id}/insights`, params(ctx.ranges.anterior)),
            diagnosticRows(`/${ctx.match.id}/ads`, { fields: 'id,created_time,creative{object_type}', effective_status: JSON.stringify(['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED']), filtering: campaignFilter(ctx.campaign) }),
        ]);
        const info = new Map((meta.rows || []).map((ad) => [ad.id, ad]));
        const rows = (current.rows || []).map((row) => ({ ...row, created_time: info.get(row.ad_id)?.created_time, object_type: info.get(row.ad_id)?.creative?.object_type }));
        const goal = ctx.memory.ficha?.meta_custo;
        const accountTotals = diagnosticMetrics(aggregate(previous.rows || []), event.evento);
        const reference = goal > 0 ? goal : (accountTotals?.resultados >= 10 ? accountTotals.custo_por_resultado : null);
        const result = creativeSignals(rows, previous.rows || [], { event: event.evento, reference });
        const head = header(ctx, event);
        head.limitacoes.push(...coverage({ anuncios_atuais: current, anuncios_anteriores: previous, metadados_anuncios: meta }));
        if (!goal) head.limitacoes.push('Sem meta de custo: referência = custo do período anterior (quando há 10+ resultados).');
        const limit = Math.min(Math.max(Math.round(Number(input.limite) || 15), 5), 30);
        return { ...head, ...result, anuncios: result.anuncios.slice(0, limit), total_anuncios: result.anuncios.length };
    },
};

// Soma linhas de insights (gasto, impressões, cliques e actions) para referência de custo.
function aggregate(rows) {
    if (!rows.length) return null;
    const actions = new Map();
    let spend = 0, impressions = 0, clicks = 0;
    for (const row of rows) {
        spend += Number(row.spend) || 0;
        impressions += Number(row.impressions) || 0;
        clicks += Number(row.inline_link_clicks) || 0;
        for (const a of row.actions || []) actions.set(a.action_type, (actions.get(a.action_type) || 0) + (Number(a.value) || 0));
    }
    return { spend, impressions, inline_link_clicks: clicks, actions: [...actions].map(([action_type, value]) => ({ action_type, value })) };
}

const getBreakdown = {
    name: 'get_breakdown',
    description: 'Quebra o desempenho Meta por segmento (posicionamento, plataforma, idade_genero, idade, genero, dispositivo, regiao, horario) e compara participação no gasto com participação nos resultados, apontando segmentos que consomem mais do que entregam e os que entregam mais do que consomem. Use para localizar onde a verba está sendo desperdiçada ou onde há eficiência.',
    input_schema: accountInput({ dimensao: { type: 'string', enum: Object.keys(BREAKDOWNS), description: 'Dimensão da quebra.' } }, ['dimensao']),
    execute: async (input) => {
        if (!Object.hasOwn(BREAKDOWNS, input.dimensao)) return { erro: `Dimensão inválida. Use: ${Object.keys(BREAKDOWNS).join(', ')}.` };
        const ctx = await analysisContext(input);
        if (ctx.erro) return ctx.erro;
        const event = await eventFor(ctx);
        const rows = await diagnosticRows(`/${ctx.match.id}/insights`, {
            level: 'account', fields: BREAKDOWN_FIELDS, breakdowns: BREAKDOWNS[input.dimensao],
            time_range: JSON.stringify(ctx.ranges.atual), filtering: campaignFilter(ctx.campaign),
        });
        const head = header(ctx, event);
        head.limitacoes.push(...coverage({ segmentos: rows }));
        if (input.dimensao === 'horario') head.limitacoes.push('Por horário a Meta pode não atribuir todas as conversões; use para padrão de entrega, não para cortar horários sozinho.');
        return { ...head, ...breakdownAnalysis(rows.rows || [], input.dimensao, event.evento) };
    },
};

const getDailyTrend = {
    name: 'get_daily_trend',
    description: 'Série diária Meta (investimento, resultados, custo por resultado, CPM, CTR de link, frequência) dos últimos N dias completos, com últimos 3 dias contra o restante e dias sem entrega. Use para ver tendência, quedas pontuais, efeito de mudanças em datas específicas e problemas de entrega.',
    input_schema: {
        type: 'object',
        properties: {
            conta: { type: 'string', description: 'Nome do cliente ou ID da conta Meta.' },
            dias: { type: 'number', description: 'Quantos dias completos (7 a 60). Default: 14.' },
            campanha: { type: 'string', description: 'Opcional: nome ou ID da campanha.' },
        },
        required: ['conta'],
    },
    execute: async (input) => {
        const days = Math.min(Math.max(Math.round(Number(input.dias) || 14), 7), 60);
        const ctx = await analysisContext({ ...input, periodo: '7d' });
        if (ctx.erro) return ctx.erro;
        const range = lastCompleteDays(days, new Date(), ctx.match.timezone_name || 'America/Sao_Paulo');
        ctx.ranges = { atual: range, anterior: null };
        const event = await eventFor(ctx);
        const rows = await diagnosticRows(`/${ctx.match.id}/insights`, {
            level: ctx.campaign ? 'campaign' : 'account', fields: DIAGNOSTIC_FIELDS, time_increment: 1,
            time_range: JSON.stringify(range), filtering: campaignFilter(ctx.campaign),
        });
        const head = header(ctx, event);
        head.periodo = `${days} dias`;
        delete head.periodo_anterior;
        head.limitacoes.push(...coverage({ serie_diaria: rows }));
        return { ...head, ...dailyTrend(rows.rows || [], event.evento) };
    },
};

// Executa tarefas com concorrência limitada para não estourar limites da Graph API.
async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

const scanPortfolio = {
    name: 'scan_portfolio',
    description: 'Varre TODAS as contas Meta ativas e prioriza quais precisam de atenção (parou de entregar, gasto sem resultado, acima da meta, custo subindo, resultados caindo) e quais são candidatas a escala, usando a conversão principal e a meta de cada ficha. Use para "como estão meus clientes", "o que preciso olhar hoje", "quem está pior".',
    input_schema: {
        type: 'object',
        properties: { periodo: { type: 'string', enum: ['yesterday', '7d', '14d', '30d'], description: 'Default: 7d.' } },
        required: [],
    },
    execute: async ({ periodo = '7d' } = {}) => {
        const period = ['yesterday', '7d', '14d', '30d'].includes(periodo) ? periodo : '7d';
        const accounts = (await listAccountsRaw()).filter((a) => a.account_status === 1);
        const entries = await mapLimit(accounts, 6, async (account) => {
            try {
                const ranges = diagnosticRanges(period, new Date(), account.timezone_name || 'America/Sao_Paulo');
                const [memory, current, previous] = await Promise.all([
                    readMemorySafe('meta', account.id),
                    diagnosticRows(`/${account.id}/insights`, { level: 'account', fields: DIAGNOSTIC_FIELDS, time_range: JSON.stringify(ranges.atual) }),
                    diagnosticRows(`/${account.id}/insights`, { level: 'account', fields: DIAGNOSTIC_FIELDS, time_range: JSON.stringify(ranges.anterior) }),
                ]);
                const error = [current, previous].find((r) => r.error && !r.rows)?.error;
                const event = resolveEvent(memory.ficha, current.rows?.[0] || previous.rows?.[0]);
                // Período sem linhas = sem entrega (zero); falha de leitura = desconhecido (null), nunca zero.
                const EMPTY = { spend: 0, impressions: 0, inline_link_clicks: 0, actions: [] };
                const metrics = (result) => result.rows ? diagnosticMetrics(result.rows[0] || EMPTY, event.evento) : null;
                return {
                    conta: account.name, id: account.id, moeda: account.currency, evento: event.evento, evento_inferido: event.inferido,
                    meta: memory.ficha?.meta_custo, erro: error, atual: metrics(current), anterior: metrics(previous),
                };
            } catch (error) {
                return { conta: account.name, id: account.id, moeda: account.currency, erro: error.message };
            }
        });
        return { periodo: period, contas_analisadas: entries.length, ...portfolioTriage(entries) };
    },
};

// ─── Google ──────────────────────────────────────────────────────────────────

const GOOGLE_PERIODS = ['yesterday', '7d', '14d', '30d', 'month', 'last_month'];

async function safeSearch(read) {
    try { return { results: (await read()).results || [] }; }
    catch (error) { return { results: [], error: error.message }; }
}

const analyzeGoogleAccount = {
    name: 'analyze_google_account',
    description: 'Gargalos Google Ads de UMA conta: parcela de impressões perdida por orçamento vs por ranking em cada campanha de pesquisa, termos de pesquisa com gasto e zero conversões (candidatos a negativação) e palavras-chave com índice de qualidade baixo e seus componentes. Use depois de get_google_account_overview para localizar o gargalo no Google.',
    input_schema: {
        type: 'object',
        properties: {
            conta: { type: 'string', description: 'Nome do cliente ou ID da conta Google Ads.' },
            periodo: { type: 'string', enum: GOOGLE_PERIODS, description: 'Default: 30d.' },
        },
        required: ['conta'],
    },
    execute: async ({ conta, periodo = '30d' }) => {
        const { match, accounts } = await resolveGoogleAccount(conta);
        if (!match) return { erro: `Nenhuma conta Google Ads encontrada para "${conta}".`, contas_disponiveis: accounts.map((a) => a.name) };
        const period = GOOGLE_PERIODS.includes(periodo) ? periodo : '30d';
        const memory = await readMemorySafe('google', match.accountId);
        const data = await readWithAuthorizedRoutes({ customerId: match.accountId }, async (token, route) => {
            const filter = normalizePeriodToDateFilter(period, route.timeZone || 'UTC');
            const search = (query) => safeSearch(() => googleAdsSearch(route.accountId, query, token, route.loginCustomerId));
            const [campaigns, terms, keywords] = await Promise.all([
                search(`SELECT campaign.id, campaign.name, campaign.advertising_channel_type, metrics.cost_micros, metrics.conversions,
                    metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share
                    FROM campaign WHERE ${filter} AND campaign.status = 'ENABLED' ORDER BY metrics.cost_micros DESC`),
                search(`SELECT search_term_view.search_term, campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions
                    FROM search_term_view WHERE ${filter} AND metrics.cost_micros > 0 ORDER BY metrics.cost_micros DESC LIMIT 200`),
                search(`SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, campaign.name,
                    ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score,
                    ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr,
                    metrics.cost_micros, metrics.conversions
                    FROM keyword_view WHERE ${filter} AND ad_group_criterion.status = 'ENABLED' AND metrics.cost_micros > 0
                    ORDER BY metrics.cost_micros DESC LIMIT 200`),
            ]);
            return { campaigns, terms, keywords };
        });
        const limitations = ['Parcela de impressões só existe para Pesquisa/Shopping; outras campanhas aparecem sem esse dado.',
            'Conversões são as configuradas no Google Ads; qualidade comercial não é verificável sem CRM.'];
        for (const [name, r] of Object.entries(data)) if (r.error) limitations.push(`${name}: ${r.error}`);
        return {
            conta: match.name, id: match.accountId, periodo: period, meta_custo: memory.ficha?.meta_custo ?? null,
            ...googleBottlenecks({ campaigns: data.campaigns.results, searchTerms: data.terms.results, keywords: data.keywords.results, reference: memory.ficha?.meta_custo }),
            limitacoes: limitations,
        };
    },
};

export const ANALYST_READ_TOOLS = [analyzeAdsets, analyzeCreatives, getBreakdown, getDailyTrend, scanPortfolio, analyzeGoogleAccount];
