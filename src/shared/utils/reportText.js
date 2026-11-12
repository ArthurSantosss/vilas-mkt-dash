import { formatCurrency, formatNumber } from './format.js';
import { formatPercentValue, formatFrequency } from './reportInsights.js';
import { buildNextStep, buildPositiveReading } from './positiveReading.js';

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

function periodDays(start, end) {
  const toDate = label => {
    const [day, month, year] = String(label || '').split('/');
    return Date.parse(`${year}-${month}-${day}T12:00:00Z`);
  };
  const days = Math.round((toDate(end) - toDate(start)) / 86400000) + 1;
  return Number.isFinite(days) ? days : null;
}

function header(d, { title, entityLine }) {
  const weekly = periodDays(d.periodStart, d.periodEnd) === 7;
  return `Excelente dia pessoal!

Segue o relatório ${weekly ? 'semanal' : 'do período'} 👇

⭐ ${title} ⭐

📅 Período Analisado: ${d.periodStart} a ${d.periodEnd}
${entityLine}`;
}

function entityLineOf(d, showCampaignName, campaignNames) {
  if (campaignNames.length) return `📌 Campanhas: ${campaignNames.join(', ')}\n`;
  return showCampaignName && d.campaignName ? `📌 Campanha: ${d.campaignName}\n` : '';
}

/** Bloco do Instagram vinculado à conta. Só mostra o que a API entregou. */
function instagramBlock(instagram) {
  if (!instagram) return '';
  const lines = [];
  if (instagram.followers != null) lines.push(`➡️ Seguidores: ${formatNumber(instagram.followers)}`);
  if (instagram.gained > 0) lines.push(`➡️ Novos seguidores no período: +${formatNumber(instagram.gained)}`);
  if (instagram.profileViews?.current > 0) lines.push(`➡️ Visitas ao perfil: ${formatNumber(instagram.profileViews.current)}`);
  if (instagram.reach?.current > 0) lines.push(`➡️ Contas alcançadas no perfil: ${formatNumber(instagram.reach.current)}`);
  if (!lines.length) return '';
  return `\n📸 Instagram${instagram.username ? ` (@${instagram.username})` : ''}\n${lines.join('\n')}\n`;
}

function footer({ reading, nextStep, weekly, agencyName }) {
  return `
📈 Leitura ${weekly ? 'da semana' : 'do período'}:
${reading.map(line => `- ${line}`).join('\n')}

📍 Próximos passos:
- ${nextStep}

Fico à disposição para qualquer dúvida!
Obrigado e tenha uma excelente semana!${buildAgencySignature(agencyName)} 🚀`;
}

const META_RESULT = {
  messages: d => ({ result: d.conversations, costPerResult: d.costPerConversation }),
  clicks: d => ({ result: d.clicks, costPerResult: d.clicks > 0 ? d.spend / d.clicks : 0 }),
  engagements: d => ({ result: d.engagements, costPerResult: d.costPerEngagement }),
};

const metaReadingInput = (d, objective) => d && ({
  ...META_RESULT[objective](d),
  spend: d.spend, clicks: d.clicks, ctr: d.ctr, cpm: d.cpm, reach: d.reach, impressions: d.impressions, frequency: d.frequency,
});

function metaResultLines(d, objective) {
  const conversations = `➡️ Conversas iniciadas: ${formatNumber(d.conversations)}`;
  const clicks = `➡️ Cliques no link: ${formatNumber(d.clicks)}`;
  const engagements = `➡️ Engajamentos com a publicação: ${formatNumber(d.engagements)}`;
  if (objective === 'clicks') {
    return [clicks, `➡️ Custo por clique: ${formatCurrency(d.clicks > 0 ? d.spend / d.clicks : 0)}`, engagements];
  }
  if (objective === 'engagements') {
    return [engagements, `➡️ Custo por engajamento: ${formatCurrency(d.costPerEngagement)}`, clicks];
  }
  return [conversations, `➡️ Custo por conversa: ${formatCurrency(d.costPerConversation)}`, engagements, clicks];
}

// ── Report text template ──
/**
 * options: showCampaignName, prev, agencyName, campaignNames, objective,
 * daily ([{ date: 'YYYY-MM-DD', value }] do resultado principal), instagram (resumo do perfil vinculado).
 */
export function buildReportText(d, options = {}) {
  if (d.platform === 'google') return buildGoogleReportText(d, options);
  const {
    showCampaignName = true, prev = null, agencyName = '', campaignNames = [],
    objective: requested = 'messages', daily = [], instagram = null,
  } = options;
  const objective = META_RESULT[requested] ? requested : 'messages';
  const weekly = periodDays(d.periodStart, d.periodEnd) === 7;
  const readingInput = { platform: 'meta', objective, current: metaReadingInput(d, objective), previous: metaReadingInput(prev, objective) };

  return `${header(d, { title: 'Relatório de Desempenho', entityLine: entityLineOf(d, showCampaignName, campaignNames) })}
💰 Investimento e resultados
➡️ Valor Investido: ${formatCurrency(d.spend)}
${metaResultLines(d, objective).join('\n')}

👀 Alcance e entrega
➡️ Impressões: ${formatNumber(d.impressions)}
➡️ Alcance: ${formatNumber(d.reach)}
➡️ Frequência: ${formatFrequency(d.frequency)}
➡️ CTR: ${formatPercentValue(d.ctr)}
➡️ CPM: ${formatCurrency(d.cpm)}
${instagramBlock(instagram)}${footer({
    reading: buildPositiveReading({ ...readingInput, daily, instagram }),
    nextStep: buildNextStep(readingInput),
    weekly, agencyName,
  })}`;
}

const googleReadingInput = (d, objective) => d && ({
  result: objective === 'clicks' ? d.clicks || 0 : d.conversions || 0,
  costPerResult: objective === 'clicks' ? d.cpc || 0 : d.costPerConversion || 0,
  spend: d.spend || 0, clicks: d.clicks || 0, ctr: d.ctr || 0, impressions: d.impressions || 0,
});

function buildGoogleReportText(d, {
  showCampaignName = true, prev = null, agencyName = '', campaignNames = [],
  objective: requested = 'conversions', daily = [], instagram = null,
} = {}) {
  const objective = requested === 'clicks' ? 'clicks' : 'conversions';
  const money = value => formatCurrency(value || 0, d.currency);
  const weekly = periodDays(d.periodStart, d.periodEnd) === 7;
  const readingInput = { platform: 'google', objective, current: googleReadingInput(d, objective), previous: googleReadingInput(prev, objective) };
  const results = objective === 'clicks'
    ? [`➡️ Cliques: ${formatNumber(d.clicks || 0)}`, `➡️ CPC: ${money(d.cpc)}`]
    : [`➡️ Conversões: ${formatNumber(d.conversions || 0)}`, `➡️ Custo por conversão: ${money(d.costPerConversion)}`, `➡️ Cliques: ${formatNumber(d.clicks || 0)}`, `➡️ CPC: ${money(d.cpc)}`];
  if (objective === 'conversions' && d.conversionsValue > 0) results.push(`➡️ Valor de conversões: ${money(d.conversionsValue)}`);

  return `${header(d, { title: 'Relatório de Desempenho — Google Ads', entityLine: entityLineOf(d, showCampaignName, campaignNames) })}
💰 Investimento e resultados
➡️ Valor Investido: ${money(d.spend)}
${results.join('\n')}

👀 Visibilidade
➡️ Impressões: ${formatNumber(d.impressions || 0)}
➡️ CTR: ${formatPercentValue(d.ctr)}
${instagramBlock(instagram)}${footer({
    reading: buildPositiveReading({ ...readingInput, daily, instagram, currency: d.currency }),
    nextStep: buildNextStep(readingInput),
    weekly, agencyName,
  })}`;
}
