export const AUTOMATIC_REPORTS_KEY = 'automatic_slack_reports';
export const REPORT_TIME_ZONE = 'America/Sao_Paulo';
export const REPORT_RULES = [
  { id: 'tagb', label: 'TAGB', format: 'visual' },
  { id: 'gdm', label: 'GDM', format: 'text' },
  { id: 'vilasmkt', label: 'VilasMKT', format: 'visual', includeText: true },
];

export function matchReportAgency(name) {
  const normalized = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^agencia/, '');
  if (['tag', 'tagb'].includes(normalized)) return 'tagb';
  if (normalized === 'gdm') return 'gdm';
  if (normalized === 'vilasmkt') return 'vilasmkt';
  return null;
}

export function reportLocalDate(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function getReportPeriod(now = new Date()) {
  const end = new Date(`${reportLocalDate(now)}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { since: start.toISOString().slice(0, 10), until: end.toISOString().slice(0, 10) };
}

export function validateReportPeriod(value, now = new Date()) {
  const { since, until } = value || {};
  if (![since, until].every(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date)) {
    throw new Error('Selecione datas válidas para o período.');
  }
  const days = Math.round((Date.parse(`${until}T12:00:00Z`) - Date.parse(`${since}T12:00:00Z`)) / 86400000) + 1;
  if (days < 1 || days > 31) throw new Error('Selecione um período de 1 a 31 dias.');
  if (until >= reportLocalDate(now)) throw new Error('O período deve terminar antes de hoje.');
  return { since, until };
}
