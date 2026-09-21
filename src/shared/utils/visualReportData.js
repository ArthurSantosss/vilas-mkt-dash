const label = date => date.split('-').reverse().join('/');
const dayLabel = date => date.slice(5).split('-').reverse().join('/');

// The Slack export and the visual report screen both render ReportCard.
// Convert the account-level Meta insights into its exact data contract.
export function toVisualReportData(report) {
  const m = report.metrics;
  const daily = report.daily || [];
  return {
    accountName: report.accountName,
    period: { start: label(report.period.since), end: label(report.period.until) },
    objective: 'messages',
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
