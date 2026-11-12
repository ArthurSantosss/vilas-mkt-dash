export const AUTOMATIC_REPORTS_KEY = 'automatic_slack_reports';
export const REPORT_TIME_ZONE = 'America/Sao_Paulo';
export const REPORT_RULES = [
  { id: 'tagb', label: 'TAGB' },
  { id: 'gdm', label: 'GDM' },
  { id: 'vilasmkt', label: 'VilasMKT' },
];

export const REPORT_FORMATS = [
  { id: 'visual', label: 'Visual' },
  { id: 'text', label: 'Texto' },
];

export const REPORT_PLATFORMS = {
  meta: {
    label: 'Meta Ads',
    objectives: [
      { id: 'engagements', label: 'Engajamento' },
      { id: 'clicks', label: 'Cliques no link' },
      { id: 'messages', label: 'Mensagens' },
    ],
  },
  google: {
    label: 'Google Ads',
    objectives: [
      { id: 'clicks', label: 'Cliques' },
      { id: 'conversions', label: 'Conversões' },
    ],
  },
};

/**
 * Confere plataforma e, para cada conta marcada, o modelo e o formato escolhidos só para ela.
 * Entrada: { platform, accounts: [{ id, objective, format }] }.
 * Saída: { platform, accounts, accountIds, choices: { [id]: { objective, format } } }.
 */
export function validateReportSelection(value) {
  const { platform, accounts } = value || {};
  const config = REPORT_PLATFORMS[platform];
  if (!config) throw new Error('Selecione Meta Ads ou Google Ads.');
  if (!Array.isArray(accounts) || !accounts.length) throw new Error('Selecione ao menos uma conta.');
  if (accounts.length > 200) throw new Error('Seleção de contas inválida.');
  const pattern = platform === 'meta' ? /^act_\d+$/ : /^\d{10}$/;
  const choices = {};
  for (const account of accounts) {
    const id = String(account?.id || '').trim();
    if (!pattern.test(id) || choices[id]) throw new Error('Seleção de contas inválida.');
    if (!config.objectives.some(item => item.id === account.objective)) throw new Error('Escolha o modelo de cada conta marcada.');
    if (!REPORT_FORMATS.some(item => item.id === account.format)) throw new Error('Escolha o formato de cada conta marcada.');
    choices[id] = { objective: account.objective, format: account.format };
  }
  const accountIds = Object.keys(choices);
  return { platform, accounts: accountIds.map(id => ({ id, ...choices[id] })), accountIds, choices };
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
