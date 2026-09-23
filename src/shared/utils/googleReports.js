// Resolve once in the account timezone; use the same dates for query, label and comparison.
export function googleReportPeriods(period, timeZone = 'UTC', now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  const today = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  const day = 86400000;
  let start = new Date(today); let end = new Date(today);
  if (typeof period === 'object' && period?.type === 'custom') {
    start = new Date(`${period.startDate}T00:00:00Z`); end = new Date(`${period.endDate}T00:00:00Z`);
    if (![start, end].every(d => Number.isFinite(d.getTime())) || start > end || start.toISOString().slice(0, 10) !== period.startDate || end.toISOString().slice(0, 10) !== period.endDate) throw new Error('Período inválido.');
  } else if (period === 'yesterday') { start = end = new Date(+today - day); }
  else if (period === 'today_yesterday') start = new Date(+today - day);
  else if (period === 'month') start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  else if (period === 'last_month') { start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)); end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)); }
  else if (period !== 'today') { const count = ({ '7d': 7, '14d': 14, '30d': 30 })[period] || 7; end = new Date(+today - day); start = new Date(+today - count * day); }
  const range = (a, b) => ({ type: 'custom', startDate: a.toISOString().slice(0, 10), endDate: b.toISOString().slice(0, 10) });
  const length = +end - +start + day;
  return { current: range(start, end), previous: range(new Date(+start - length), new Date(+start - day)) };
}

export function googleTextData(metrics, name, period, currency = 'BRL') {
  const date = value => value.split('-').reverse().join('/');
  return { ...metrics, platform: 'google', currency, campaignName: name,
    periodStart: date(period.startDate), periodEnd: date(period.endDate),
    costPerConversion: metrics.conversions > 0 ? metrics.spend / metrics.conversions : 0,
    cpc: metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0,
    ctr: metrics.impressions > 0 ? metrics.clicks / metrics.impressions * 100 : 0 };
}

export function googleVisualData(current, previous, account, period, objective = 'conversions') {
  const metrics = googleTextData(current.totals, account.clientName, period, account.currency);
  const previousMetrics = previous ? googleTextData(previous.totals, '', period, account.currency) : null;
  const rows = new Map((current.dailyMetrics || []).map(d => [d.date, d]));
  const daily = [];
  for (let date = new Date(`${period.startDate}T00:00:00Z`), end = new Date(`${period.endDate}T00:00:00Z`); date <= end; date = new Date(+date + 86400000)) {
    const key = date.toISOString().slice(0, 10);
    daily.push({ date: key.slice(5).split('-').reverse().join('/'), ...(rows.get(key) || {}), fullDate: key });
  }
  const diff = (a, b) => b > 0 ? ((a - b) / b * 100).toFixed(1) : null;
  return { ...metrics, accountName: account.clientName || account.name, objective,
    period: { start: metrics.periodStart, end: metrics.periodEnd, startShort: period.startDate, endShort: period.endDate },
    leads: metrics.conversions || 0, costPerLead: metrics.costPerConversion, costPerClick: metrics.cpc,
    reach: null, engagements: null, igProfileVisits: null,
    dailyLeads: daily.map(d => ({ date: d.fullDate.slice(5).split('-').reverse().join('/'), leads: d.conversions || 0 })),
    dailyClicks: daily.map(d => ({ date: d.fullDate.slice(5).split('-').reverse().join('/'), clicks: d.clicks || 0 })),
    diffs: Object.fromEntries(['spend', 'clicks', 'impressions', 'ctr', 'conversions', 'costPerConversion', 'cpc'].map(key => [key, previousMetrics ? diff(metrics[key], previousMetrics[key]) : null])),
  };
}
