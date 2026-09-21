export const AUTOMATIC_REPORTS_KEY = 'automatic_slack_reports';
export const REPORT_TIME_ZONE = 'America/Sao_Paulo';
export const REPORT_HOUR = 5;
export const REPORT_RULES = [
  { id: 'tagb', label: 'TAGB', weekday: 1, dayLabel: 'Segunda-feira', format: 'visual' },
  { id: 'gdm', label: 'GDM', weekday: 1, dayLabel: 'Segunda-feira', format: 'text' },
  { id: 'vilasmkt', label: 'VilasMKT', weekday: 5, dayLabel: 'Sexta-feira', format: 'visual' },
];
export const DEFAULT_REPORT_SETTINGS = { enabled: { tagb: true, gdm: true, vilasmkt: true } };

export function validateReportSettings(value) {
  if (!value?.enabled || REPORT_RULES.some(rule => typeof value.enabled[rule.id] !== 'boolean')) {
    throw new Error('Configuração de relatórios inválida. Revise as agências habilitadas.');
  }
  return { enabled: Object.fromEntries(REPORT_RULES.map(rule => [rule.id, value.enabled[rule.id]])) };
}

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

export function reportIsDue(rule, settings, now = new Date()) {
  const date = new Date(`${reportLocalDate(now)}T12:00:00Z`);
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: REPORT_TIME_ZONE, hour: '2-digit', hourCycle: 'h23',
  }).format(now));
  return settings.enabled[rule.id] && hour === REPORT_HOUR && date.getUTCDay() === rule.weekday;
}

export function getReportPeriod(now = new Date()) {
  const end = new Date(`${reportLocalDate(now)}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { since: start.toISOString().slice(0, 10), until: end.toISOString().slice(0, 10) };
}
