// Detecção de fadiga de criativo (Meta Ads).
// Compara os últimos 7 dias completos com os 7 dias anteriores, por anúncio ativo:
// frequência alta + CTR de link caindo = público saturado, hora de trocar o criativo.
// Módulo puro: usado pela aba Meta Ads (via proxy) e pelo cron de alertas do Slack.

export const FATIGUE_THRESHOLDS = {
  minImpressions: 2000, // impressões mínimas na janela recente para a análise valer
  minPreviousImpressions: 1000, // base mínima na janela anterior para comparar CTR
  minSpend: 20, // gasto mínimo (R$) na janela recente
  warningFrequency: 2.5,
  criticalFrequency: 3.5,
  saturationFrequency: 4, // acima disso, qualquer queda de CTR já conta
  warningCtrDrop: 20, // queda percentual do CTR de link
  criticalCtrDrop: 35,
  saturationCtrDrop: 10,
};

export const FATIGUE_WINDOW_DAYS = 7;

const LEAD_ACTION_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
  'messaging_first_reply',
  'lead',
  'onsite_conversion.lead_grouped',
];

function dateInTimeZone(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date, days) {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Janelas sem o dia de hoje (parcial): recente = D-7..D-1, anterior = D-14..D-8. */
export function getFatigueWindows(now = new Date(), timeZone = 'America/Sao_Paulo') {
  const today = dateInTimeZone(now, timeZone);
  const n = FATIGUE_WINDOW_DAYS;
  return {
    recent: { since: ymd(shiftDays(today, -n)), until: ymd(shiftDays(today, -1)) },
    previous: { since: ymd(shiftDays(today, -2 * n)), until: ymd(shiftDays(today, -n - 1)) },
  };
}

/** Parâmetros do GET /{act}/insights em nível de anúncio, só anúncios ativos. */
export function buildFatigueInsightsParams(range) {
  return {
    level: 'ad',
    fields: 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,reach,frequency,inline_link_clicks,inline_link_click_ctr,actions',
    time_range: JSON.stringify(range),
    filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: 500,
  };
}

function toNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function leadCount(actions) {
  if (!Array.isArray(actions)) return 0;
  for (const type of LEAD_ACTION_TYPES) {
    const found = actions.find((a) => a.action_type === type);
    const value = found ? Number.parseInt(found.value, 10) || 0 : 0;
    if (value > 0) return value;
  }
  return 0;
}

function normalizeRow(row) {
  const impressions = toNumber(row.impressions);
  const clicks = toNumber(row.inline_link_clicks);
  const spend = toNumber(row.spend);
  const leads = leadCount(row.actions);
  // inline_link_click_ctr nem sempre vem; recalcula pelos cliques quando faltar.
  const ctr = row.inline_link_click_ctr != null
    ? toNumber(row.inline_link_click_ctr)
    : (impressions > 0 ? (clicks / impressions) * 100 : 0);
  return {
    adId: String(row.ad_id || ''),
    adName: row.ad_name || `Anúncio ${row.ad_id || ''}`,
    adsetName: row.adset_name || '',
    campaignName: row.campaign_name || '',
    spend,
    impressions,
    frequency: toNumber(row.frequency),
    ctr,
    leads,
    costPerLead: leads > 0 ? spend / leads : null,
  };
}

function percentChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function round(value, digits = 2) {
  return value == null ? null : Number(value.toFixed(digits));
}

/**
 * Recebe as linhas de insights (nível anúncio) das duas janelas e devolve os anúncios
 * cansados, críticos primeiro. Anúncios novos (sem base anterior) não entram.
 */
export function detectCreativeFatigue(recentRows = [], previousRows = [], thresholds = FATIGUE_THRESHOLDS) {
  const t = { ...FATIGUE_THRESHOLDS, ...thresholds };
  const previousById = new Map(previousRows.map(normalizeRow).map((r) => [r.adId, r]));
  const results = [];

  for (const current of recentRows.map(normalizeRow)) {
    if (!current.adId || current.impressions < t.minImpressions || current.spend < t.minSpend) continue;
    const previous = previousById.get(current.adId);
    if (!previous || previous.impressions < t.minPreviousImpressions || previous.ctr <= 0) continue;

    const ctrChange = percentChange(current.ctr, previous.ctr);
    const ctrDrop = ctrChange != null ? -ctrChange : 0;
    const f = current.frequency;

    const saturated = f >= t.saturationFrequency && ctrDrop >= t.saturationCtrDrop;
    const tired = f >= t.warningFrequency && ctrDrop >= t.warningCtrDrop;
    if (!saturated && !tired) continue;

    const critical = (f >= t.criticalFrequency && ctrDrop >= t.criticalCtrDrop) || (saturated && ctrDrop >= t.warningCtrDrop);
    const cplChange = current.costPerLead != null && previous.costPerLead != null
      ? percentChange(current.costPerLead, previous.costPerLead)
      : null;

    const reasons = [
      `Frequência ${round(f, 1)} nos últimos ${FATIGUE_WINDOW_DAYS} dias (antes ${round(previous.frequency, 1)})`,
      `CTR de link caiu ${round(ctrDrop, 0)}% (${round(previous.ctr)}% → ${round(current.ctr)}%)`,
    ];
    if (cplChange != null && cplChange > 0) reasons.push(`Custo por lead subiu ${round(cplChange, 0)}%`);

    results.push({
      adId: current.adId,
      adName: current.adName,
      adsetName: current.adsetName,
      campaignName: current.campaignName,
      severity: critical ? 'critical' : 'warning',
      spend: round(current.spend),
      impressions: current.impressions,
      frequency: round(f),
      previousFrequency: round(previous.frequency),
      ctr: round(current.ctr),
      previousCtr: round(previous.ctr),
      ctrChange: round(ctrChange, 1),
      costPerLead: round(current.costPerLead),
      previousCostPerLead: round(previous.costPerLead),
      costPerLeadChange: round(cplChange, 1),
      reasons,
    });
  }

  const rank = { critical: 0, warning: 1 };
  return results.sort((a, b) => rank[a.severity] - rank[b.severity] || b.spend - a.spend);
}
