import { googleVisualData } from './googleReports.js';

const label = date => date.split('-').reverse().join('/');
const dayLabel = date => date.slice(5).split('-').reverse().join('/');

// The Slack export and the visual report screen both render ReportCard.
// Convert the account-level insights into its exact data contract.
export function toVisualReportData(report) {
  if (report.platform === 'google') {
    return googleVisualData(
      { totals: report.metrics, dailyMetrics: report.daily || [] },
      null,
      { clientName: report.accountName, currency: report.currency || 'BRL' },
      { startDate: report.period.since, endDate: report.period.until },
      report.objective || 'conversions',
    );
  }
  const m = report.metrics;
  const daily = report.daily || [];
  return {
    accountName: report.accountName,
    period: { start: label(report.period.since), end: label(report.period.until) },
    objective: report.objective || 'messages',
    spend: m.spend,
    impressions: m.impressions,
    reach: m.reach,
    clicks: m.clicks,
    leads: m.conversations,
    engagements: m.engagements,
    igProfileVisits: 0,
    costPerLead: m.costPerConversation,
    costPerEngagement: m.costPerEngagement,
    costPerClick: m.clicks ? m.spend / m.clicks : 0,
    ctr: m.ctr,
    dailyLeads: daily.map(day => ({ date: dayLabel(day.date), leads: day.messages })),
    dailyClicks: daily.map(day => ({ date: dayLabel(day.date), clicks: day.clicks })),
    dailyEngagements: daily.map(day => ({ date: dayLabel(day.date), engagements: day.engagements })),
  };
}

/** Modelo que o ReportCard deve usar para este relatório. */
export function reportCardObjective(report) {
  return report.objective || (report.platform === 'google' ? 'conversions' : 'messages');
}

const isNum = value => typeof value === 'number' && Number.isFinite(value);

/**
 * Campos do modelo Seguidores a partir do resumo do Instagram vinculado à conta
 * (`/api/instagram?action=followers`). Sem Instagram, tudo vira null e o card mostra "—".
 * Os números são do perfil inteiro (orgânico + anúncios), não só das campanhas filtradas.
 */
export function instagramFollowerFields(instagram, spend) {
  const gained = isNum(instagram?.gained) ? instagram.gained : null;
  return {
    hasInstagram: Boolean(instagram),
    instagramUsername: instagram?.username || null,
    followersGained: gained,
    costPerFollower: gained > 0 && isNum(spend) ? spend / gained : null,
    profileVisits: isNum(instagram?.profileViews?.current) ? instagram.profileViews.current : null,
    totalFollowers: isNum(instagram?.followers) ? instagram.followers : null,
    dailyFollowers: (instagram?.dailyFollowers || []).map(point => ({ date: dayLabel(point.date), followers: point.value })),
    dailyFollowersPartial: Boolean(instagram?.dailyFollowersPartial),
  };
}
