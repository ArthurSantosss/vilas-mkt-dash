import { formatYMD, getToday, getYesterday, PRESETS } from './dateUtils.js';

/**
 * Resolve qualquer período (preset conhecido, hoje e ontem, ou custom) para o alvo Meta Graph API:
 * preset nativo do Graph API ou time_range com datas since/until.
 */
export const resolveMetaPeriodTarget = (period) => {
  if (typeof period === 'object' && period?.type === 'custom' && period.startDate && period.endDate) {
    return { type: 'time_range', since: period.startDate, until: period.endDate };
  }
  switch (period) {
    case 'today': return { type: 'preset', preset: 'today' };
    case 'yesterday': return { type: 'preset', preset: 'yesterday' };
    case '7d': return { type: 'preset', preset: 'last_7d' };
    case '14d': return { type: 'preset', preset: 'last_14d' };
    case '30d': return { type: 'preset', preset: 'last_30d' };
    case 'month': return { type: 'preset', preset: 'this_month' };
    case 'last_month': return { type: 'preset', preset: 'last_month' };
    case 'today_yesterday': {
      return {
        type: 'time_range',
        since: formatYMD(getYesterday()),
        until: formatYMD(getToday()),
      };
    }
    default: {
      const found = PRESETS.find(p => p.id === period);
      if (found) {
        const range = found.getRange();
        return { type: 'time_range', since: range.startDate, until: range.endDate };
      }
      return { type: 'preset', preset: 'last_7d' };
    }
  }
};

export const getMetaInsightsField = (period) => {
  const target = resolveMetaPeriodTarget(period);
  if (target.type === 'preset') {
    return `insights.date_preset(${target.preset})`;
  }
  if (target.type === 'time_range') {
    return `insights.time_range({'since':'${target.since}','until':'${target.until}'})`;
  }
  return 'insights';
};

/**
 * Calcula o período anterior de mesmo tamanho para comparação de métricas.
 */
export function getPreviousPeriodRange(period) {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);

  if (typeof period === 'object' && period?.type === 'custom' && period.startDate && period.endDate) {
    const start = new Date(period.startDate + 'T00:00:00');
    const end = new Date(period.endDate + 'T00:00:00');
    const days = Math.round((end - start) / 86400000) + 1;
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    return { type: 'custom', startDate: fmt(prevStart), endDate: fmt(prevEnd) };
  }

  let days;
  switch (period) {
    case 'today': days = 1; break;
    case 'yesterday': days = 1; break;
    case '7d': days = 7; break;
    case '14d': days = 14; break;
    case '30d': days = 30; break;
    case 'today_yesterday': days = 2; break;
    case 'last_month': {
      const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevEnd = new Date(startOfLastMonth);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
      return { type: 'custom', startDate: fmt(prevStart), endDate: fmt(prevEnd) };
    }
    case 'month': {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      days = Math.round((today - firstOfMonth) / 86400000) + 1;
      break;
    }
    default: days = 7;
  }

  const currentEnd = new Date(today);
  currentEnd.setDate(currentEnd.getDate() - 1);
  const currentStart = new Date(currentEnd);
  currentStart.setDate(currentStart.getDate() - days + 1);

  const prevEnd = new Date(currentStart);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days + 1);

  return { type: 'custom', startDate: fmt(prevStart), endDate: fmt(prevEnd) };
}
