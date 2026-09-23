import { formatCurrency, formatNumber } from './format.js';
import { buildInsightPack, formatPercentValue, formatFrequency } from './reportInsights.js';

// ── Build a hashtag signature from the agency name ──
function buildAgencySignature(name) {
  const cleaned = String(name || '').trim().replace(/[^\p{L}\p{N}]+/gu, '');
  return cleaned ? ` #${cleaned.toUpperCase()}` : '';
}

// ── Helper: extract action value by type ──
function getActionValue(actions, actionType) {
  if (!actions || !Array.isArray(actions)) return 0;
  const found = actions.find(a => a.action_type === actionType);
  return found ? parseInt(found.value, 10) : 0;
}

function getActionValueMulti(actions, actionTypes) {
  if (!actions || !Array.isArray(actions)) return 0;
  for (const type of actionTypes) {
    const val = getActionValue(actions, type);
    if (val > 0) return val;
  }
  return 0;
}

function getActionValueSum(actions, actionTypes) {
  if (!actions || !Array.isArray(actions)) return 0;
  let total = 0;
  for (const type of actionTypes) {
    total += getActionValue(actions, type);
  }
  return total;
}

// ── Build report from insight data ──
export function buildReportFromInsights(data, campaignName, periodDates) {
  const actions = data.actions || [];
  const spend = parseFloat(data.spend || 0);
  const impressions = parseInt(data.impressions || 0, 10);
  const reach = parseInt(data.reach || 0, 10);
  const cpm = parseFloat(data.cpm || 0);
  const ctr = parseFloat(data.ctr || 0);
  const clicks = parseInt(data.inline_link_clicks || data.clicks || 0, 10);
  const frequency = parseFloat(data.frequency || 0);

  const conversations = getActionValueMulti(actions, [
    'onsite_conversion.messaging_conversation_started_7d',
    'messaging_conversation_started_7d',
    'onsite_conversion.messaging_first_reply',
    'messaging_first_reply',
  ]);

  const engagements = getActionValueSum(actions, ['post_engagement']);

  const costPerConversation = conversations > 0 ? spend / conversations : 0;
  const costPerEngagement = engagements > 0 ? spend / engagements : 0;

  return {
    periodStart: periodDates.start,
    periodEnd: periodDates.end,
    campaignName,
    spend, conversations, engagements,
    impressions, reach, costPerConversation, costPerEngagement, cpm, ctr, clicks, frequency,
  };
}

// ── Report text template ──
export function buildReportText(d, options = {}) {
  if (d.platform === 'google') return buildGoogleReportText(d, options);
  const {
    showCampaignName = true,
    prev = null,
    agencyName = '',
  } = options;

  const signature = buildAgencySignature(agencyName);

  const entitySubject = showCampaignName ? 'A campanha' : 'A conta';
  const entityLine = (showCampaignName && d.campaignName) ? `📌 Campanha: ${d.campaignName}\n` : '';
  const insightPack = buildInsightPack(d, prev);
  const analysisBlock = insightPack.analysisLines.length > 0
    ? `\n${insightPack.analysisLines.map((line) => `- ${line}`).join('\n')}`
    : '';

  return `Excelente dia pessoal!

Segue relatório semanal 👇

⭐ Relatório de Desempenho ⭐

📅 Período Analisado: ${d.periodStart} a ${d.periodEnd}
${entityLine}
➡️ Valor Investido: ${formatCurrency(d.spend)}
➡️ Total de Conversas Iniciadas: ${formatNumber(d.conversations)}
➡️ Engajamentos com a publicação: ${formatNumber(d.engagements)}
➡️ Impressões: ${formatNumber(d.impressions)}
➡️ Alcance: ${formatNumber(d.reach)}
➡️ Custo por conversa: ${formatCurrency(d.costPerConversation)}
➡️ CTR: ${formatPercentValue(d.ctr)}
➡️ Frequência: ${formatFrequency(d.frequency)}

📈 Leitura da semana:
- Cada engajamento custou em média ${formatCurrency(d.costPerEngagement)}.
- O CPM ficou em ${formatCurrency(d.cpm)} para cada mil impressões.
- ${entitySubject} gerou ${formatNumber(d.clicks)} cliques no período.${analysisBlock}

📍 Próximos passos:
- ${insightPack.nextStep}

Fico a disposição para qualquer dúvida!
Obrigado e tenha uma excelente semana!${signature} 🚀`;
}

function buildGoogleReportText(d, { showCampaignName = true, prev = null, agencyName = '' } = {}) {
  const money = value => formatCurrency(value || 0, d.currency);
  const comparison = prev && prev.conversions > 0
    ? `\n- As conversões variaram ${formatPercentValue((d.conversions - prev.conversions) / prev.conversions * 100)} em relação ao período anterior.` : '';
  return `Excelente dia pessoal!

Segue relatório de desempenho 👇

⭐ Relatório de Desempenho — Google Ads ⭐

📅 Período Analisado: ${d.periodStart} a ${d.periodEnd}
${showCampaignName && d.campaignName ? `📌 Campanha: ${d.campaignName}\n` : ''}
➡️ Valor Investido: ${money(d.spend)}
➡️ Conversões: ${formatNumber(d.conversions || 0)}
➡️ Impressões: ${formatNumber(d.impressions || 0)}
➡️ Cliques: ${formatNumber(d.clicks || 0)}
➡️ Custo por conversão: ${money(d.costPerConversion)}
➡️ CPC: ${money(d.cpc)}
➡️ CTR: ${formatPercentValue(d.ctr)}
➡️ Valor de conversões: ${money(d.conversionsValue)}

📈 Leitura do período:
- A conta gerou ${formatNumber(d.conversions || 0)} conversões e ${formatNumber(d.clicks || 0)} cliques.${comparison}

📍 Próximos passos:
- ${d.conversions > 0 ? 'Compare custo por conversão e qualidade dos resultados antes de ajustar os investimentos.' : 'Confira a configuração das conversões e a relevância dos anúncios antes de ampliar o investimento.'}

Fico à disposição para qualquer dúvida!
Obrigado e tenha uma excelente semana!${buildAgencySignature(agencyName)} 🚀`;
}
