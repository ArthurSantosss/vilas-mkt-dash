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
