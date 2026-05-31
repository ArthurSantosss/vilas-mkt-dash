/* global process */

const META_API_BASE = 'https://graph.facebook.com/v22.0';

const LEAD_ACTION_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
];

const ENGAGEMENT_ACTION_TYPES = ['post_engagement', 'page_engagement'];

const IG_PROFILE_VISIT_ACTION_TYPES = [
  'onsite_conversion.ig_profile_visit_total',
  'ig_profile_visit',
  'omni_profile_visit',
  'profile_visit',
];

function getActionValue(actions, actionType) {
  if (!actions || !Array.isArray(actions)) return 0;
  const found = actions.find(a => a.action_type === actionType);
  return found ? parseInt(found.value, 10) || 0 : 0;
}

function getActionValueMulti(actions, actionTypes) {
  for (const t of actionTypes) {
    const v = getActionValue(actions, t);
    if (v > 0) return v;
  }
  return 0;
}

function fmtYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getYesterday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d;
}

function subDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

// Resolve a "period" (preset id OR { type:'custom', startDate, endDate }) into a concrete range.
function resolveRange(period) {
  if (typeof period === 'object' && period?.type === 'custom' && period.startDate && period.endDate) {
    return { startDate: period.startDate, endDate: period.endDate };
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = getYesterday();
  switch (period) {
    case 'today': return { startDate: fmtYMD(today), endDate: fmtYMD(today) };
    case 'yesterday': return { startDate: fmtYMD(yesterday), endDate: fmtYMD(yesterday) };
    case '7d': return { startDate: fmtYMD(subDays(yesterday, 6)), endDate: fmtYMD(yesterday) };
    case 'today_yesterday': return { startDate: fmtYMD(yesterday), endDate: fmtYMD(today) };
    case '14d': return { startDate: fmtYMD(subDays(yesterday, 13)), endDate: fmtYMD(yesterday) };
    case '30d': return { startDate: fmtYMD(subDays(yesterday, 29)), endDate: fmtYMD(yesterday) };
    case 'month': {
      const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
      return { startDate: fmtYMD(start), endDate: fmtYMD(yesterday) };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startDate: fmtYMD(start), endDate: fmtYMD(end) };
    }
    default: return { startDate: fmtYMD(subDays(yesterday, 6)), endDate: fmtYMD(yesterday) };
  }
}

function timeRangeParam(range) {
  return JSON.stringify({ since: range.startDate, until: range.endDate });
}

async function metaGet(path, params, token) {
  const url = new URL(`${META_API_BASE}${path}`);
  url.searchParams.append('access_token', token);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.append(k, v);
  }
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error?.message || `Meta API ${res.status}`);
  return data;
}

async function fetchAccountInsights(accountId, range, token) {
  const data = await metaGet(`/${accountId}/insights`, {
    fields: 'spend,impressions,cpm,inline_link_clicks,cpc,actions,ctr,reach,frequency',
    level: 'account',
    time_range: timeRangeParam(range),
  }, token);
  return data.data?.[0] || null;
}

async function fetchAccountName(accountId, token) {
  try {
    const data = await metaGet(`/${accountId}`, { fields: 'name' }, token);
    return data?.name || null;
  } catch {
    return null;
  }
}

async function fetchCampaignsWithInsights(accountId, range, token) {
  const insightsField = `insights.time_range({'since':'${range.startDate}','until':'${range.endDate}'})`;
  const data = await metaGet(`/${accountId}/campaigns`, {
    fields: `id,name,status,objective,${insightsField}{spend,impressions,inline_link_clicks,actions,reach}`,
    limit: 50,
  }, token);
  return data.data || [];
}

async function fetchCampaignDailyInsights(campaignId, range, token) {
  const data = await metaGet(`/${campaignId}/insights`, {
    fields: 'spend,impressions,inline_link_clicks,actions',
    time_increment: 1,
    time_range: timeRangeParam(range),
  }, token);
  return data.data || [];
}

function aggregateCampaigns(campaigns) {
  const sum = { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, engagements: 0, igProfileVisits: 0 };
  for (const c of campaigns) {
    const ins = c.insights?.data?.[0];
    if (!ins) continue;
    const actions = ins.actions || [];
    sum.spend += parseFloat(ins.spend || 0);
    sum.impressions += parseInt(ins.impressions || 0, 10);
    sum.reach += parseInt(ins.reach || 0, 10);
    sum.clicks += parseInt(ins.inline_link_clicks || 0, 10);
    sum.leads += getActionValueMulti(actions, LEAD_ACTION_TYPES);
    sum.engagements += getActionValueMulti(actions, ENGAGEMENT_ACTION_TYPES);
    sum.igProfileVisits += getActionValueMulti(actions, IG_PROFILE_VISIT_ACTION_TYPES);
  }
  return sum;
}

function getPreviousRange(range) {
  const start = new Date(range.startDate + 'T00:00:00');
  const end = new Date(range.endDate + 'T00:00:00');
  const days = Math.round((end - start) / 86400000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days + 1);
  return { startDate: fmtYMD(prevStart), endDate: fmtYMD(prevEnd) };
}

function calcDiff(current, previous) {
  if (!previous || previous === 0) return null;
  return Number(((current - previous) / previous * 100).toFixed(1));
}

function fmtBR(d) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtShort(d) {
  const [, m, day] = d.split('-');
  return `${day}-${m}`;
}

async function fetchShare(shareId, supabaseUrl, supabaseAnonKey) {
  const url = `${supabaseUrl}/rest/v1/rpc/get_shared_report`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_id: shareId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase RPC ${res.status}: ${text}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchClientLogo(accountId, supabaseUrl, supabaseAnonKey) {
  try {
    const email = (process.env.VITE_AUTH_EMAIL || '').trim().toLowerCase();
    const prefixedKey = email ? `${email}_client_logos` : '';
    const keysToTry = prefixedKey ? [prefixedKey, 'client_logos'] : ['client_logos'];
    const inParam = keysToTry.map(k => encodeURIComponent(k)).join(',');
    const url = `${supabaseUrl}/rest/v1/app_preferences?select=key,value&key=in.(${inParam})`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const found = data.find(row => row.key === prefixedKey) || data[0];
      const logosMap = found?.value || {};
      return logosMap[accountId] || null;
    }
    return null;
  } catch (err) {
    console.error('[public-report API] Error fetching client logo:', err);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const shareId = req.query?.shareId || (req.url && new URL(req.url, 'http://x').searchParams.get('shareId'));
  if (!shareId) return res.status(400).json({ error: 'shareId obrigatório' });

  const periodRaw = req.query?.period;
  let period;
  if (typeof periodRaw === 'string' && periodRaw.startsWith('{')) {
    try { period = JSON.parse(periodRaw); } catch { period = '7d'; }
  } else {
    period = periodRaw || '7d';
  }

  const metaToken = process.env.META_ACCESS_TOKEN || process.env.VITE_META_ACCESS_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!metaToken) return res.status(500).json({ error: 'META_ACCESS_TOKEN not configured' });
  if (!supabaseUrl || !supabaseAnonKey) return res.status(500).json({ error: 'Supabase env missing' });

  try {
    const share = await fetchShare(shareId, supabaseUrl, supabaseAnonKey);
    if (!share) return res.status(404).json({ error: 'Relatório não encontrado' });

    const range = resolveRange(period);
    const prevRange = getPreviousRange(range);
    const objective = share.objective || 'messages';
    const campaignFilter = Array.isArray(share.campaign_ids) && share.campaign_ids.length > 0
      ? new Set(share.campaign_ids)
      : null;

    let metrics;
    let prevMetrics;
    let campaignsForDaily = [];
    let selectedCampaignNames = [];

    if (campaignFilter) {
      const [curCampaigns, prevCampaigns] = await Promise.all([
        fetchCampaignsWithInsights(share.account_id, range, metaToken),
        fetchCampaignsWithInsights(share.account_id, prevRange, metaToken),
      ]);
      const filteredCur = curCampaigns.filter(c => campaignFilter.has(c.id));
      const filteredPrev = prevCampaigns.filter(c => campaignFilter.has(c.id));

      if (!filteredCur.length) {
        return res.status(200).json({ empty: true, message: 'Nenhuma das campanhas selecionadas teve dados no período.' });
      }

      metrics = aggregateCampaigns(filteredCur);
      prevMetrics = aggregateCampaigns(filteredPrev);
      campaignsForDaily = filteredCur;
      selectedCampaignNames = filteredCur.map(c => c.name);
    } else {
      const [insights, prevInsights, allCampaigns] = await Promise.all([
        fetchAccountInsights(share.account_id, range, metaToken),
        fetchAccountInsights(share.account_id, prevRange, metaToken),
        fetchCampaignsWithInsights(share.account_id, range, metaToken),
      ]);

      if (!insights) {
        return res.status(200).json({ empty: true, message: 'Sem dados para o período selecionado.' });
      }

      const actions = insights.actions || [];
      const prevActions = prevInsights?.actions || [];

      metrics = {
        spend: parseFloat(insights.spend || 0),
        impressions: parseInt(insights.impressions || 0, 10),
        reach: parseInt(insights.reach || 0, 10),
        clicks: parseInt(insights.inline_link_clicks || 0, 10),
        leads: getActionValueMulti(actions, LEAD_ACTION_TYPES),
        engagements: getActionValueMulti(actions, ENGAGEMENT_ACTION_TYPES),
        igProfileVisits: getActionValueMulti(actions, IG_PROFILE_VISIT_ACTION_TYPES),
      };
      prevMetrics = {
        spend: parseFloat(prevInsights?.spend || 0),
        impressions: parseInt(prevInsights?.impressions || 0, 10),
        reach: parseInt(prevInsights?.reach || 0, 10),
        clicks: parseInt(prevInsights?.inline_link_clicks || 0, 10),
        leads: getActionValueMulti(prevActions, LEAD_ACTION_TYPES),
        engagements: getActionValueMulti(prevActions, ENGAGEMENT_ACTION_TYPES),
        igProfileVisits: getActionValueMulti(prevActions, IG_PROFILE_VISIT_ACTION_TYPES),
      };
      campaignsForDaily = allCampaigns;
    }

    const costPerLead = metrics.leads > 0 ? metrics.spend / metrics.leads : 0;
    const costPerEngagement = metrics.engagements > 0 ? metrics.spend / metrics.engagements : 0;
    const costPerClick = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0;
    const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;

    const prevCostPerLead = prevMetrics.leads > 0 ? prevMetrics.spend / prevMetrics.leads : 0;
    const prevCostPerEngagement = prevMetrics.engagements > 0 ? prevMetrics.spend / prevMetrics.engagements : 0;
    const prevCostPerClick = prevMetrics.clicks > 0 ? prevMetrics.spend / prevMetrics.clicks : 0;
    const prevCtr = prevMetrics.impressions > 0 ? (prevMetrics.clicks / prevMetrics.impressions) * 100 : 0;

    let dailyLeads = [];
    let dailyClicks = [];
    let dailyEngagements = [];
    if (campaignsForDaily.length > 0) {
      try {
        const allDaily = await Promise.all(
          campaignsForDaily.map(c => fetchCampaignDailyInsights(c.id, range, metaToken).catch(() => []))
        );
        const dayMap = {};
        for (const daily of allDaily) {
          for (const d of daily) {
            const date = d.date_start;
            if (!dayMap[date]) dayMap[date] = { date, leads: 0, clicks: 0, engagements: 0 };
            dayMap[date].leads += getActionValueMulti(d.actions || [], LEAD_ACTION_TYPES);
            dayMap[date].clicks += parseInt(d.inline_link_clicks || 0, 10);
            dayMap[date].engagements += getActionValueMulti(d.actions || [], ENGAGEMENT_ACTION_TYPES);
          }
        }
        const sorted = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
        const formatDay = (date) => `${date.split('-')[2]}/${date.split('-')[1]}`;
        dailyLeads = sorted.map(d => ({ date: formatDay(d.date), leads: d.leads }));
        dailyClicks = sorted.map(d => ({ date: formatDay(d.date), clicks: d.clicks }));
        dailyEngagements = sorted.map(d => ({ date: formatDay(d.date), engagements: d.engagements }));
      } catch { /* ignore — daily is optional */ }
    }

    const accountName = share.client_label || (await fetchAccountName(share.account_id, metaToken)) || 'Conta';
    const clientLogoUrl = await fetchClientLogo(share.account_id, supabaseUrl, supabaseAnonKey);

    return res.status(200).json({
      empty: false,
      accountName,
      clientLogoUrl,
      agency: share.agency || null,
      objective,
      hasCampaignFilter: Boolean(campaignFilter),
      filteredCampaignCount: campaignFilter ? campaignFilter.size : 0,
      selectedCampaignNames,
      period: {
        start: fmtBR(range.startDate),
        end: fmtBR(range.endDate),
        startShort: fmtShort(range.startDate),
        endShort: fmtShort(range.endDate),
      },
      ...metrics,
      costPerLead, costPerEngagement, costPerClick, ctr,
      diffs: {
        spend: calcDiff(metrics.spend, prevMetrics.spend),
        reach: calcDiff(metrics.reach, prevMetrics.reach),
        clicks: calcDiff(metrics.clicks, prevMetrics.clicks),
        leads: calcDiff(metrics.leads, prevMetrics.leads),
        ctr: calcDiff(ctr, prevCtr),
        costPerLead: calcDiff(costPerLead, prevCostPerLead),
        costPerClick: calcDiff(costPerClick, prevCostPerClick),
        engagements: calcDiff(metrics.engagements, prevMetrics.engagements),
        costPerEngagement: calcDiff(costPerEngagement, prevCostPerEngagement),
        igProfileVisits: calcDiff(metrics.igProfileVisits, prevMetrics.igProfileVisits),
      },
      dailyLeads, dailyClicks, dailyEngagements,
    });
  } catch (err) {
    console.error('[public-report] Error:', err);
    return res.status(500).json({ error: 'Internal error', details: String(err.message || err) });
  }
}
