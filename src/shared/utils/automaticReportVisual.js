import { formatCurrency, formatNumber } from './format.js';

const xml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
const text = (x, y, value, size = 20, color = '#ffffff', weight = 400, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}">${xml(value)}</text>`;

export function buildAutomaticReportSvg(report, assets = {}) {
  const m = report.metrics;
  const accent = '#22d3ee';
  const period = `${report.period.since.split('-').reverse().join('/')} a ${report.period.until.split('-').reverse().join('/')}`;
  const agencyLogo = assets.agencyLogo || (report.agency === 'tagb' ? '/logotag.png' : '/favicon.png');
  const metaLogo = assets.metaLogo || '/meta-ads-logo.png';
  const kpis = [
    ['INVESTIMENTO', formatCurrency(m.spend), accent],
    ['CONVERSAS', formatNumber(m.conversations), '#38bdf8'],
    ['CUSTO / CONVERSA', m.conversations ? formatCurrency(m.costPerConversation) : '—', '#fbbf24'],
    ['ALCANCE', formatNumber(m.reach), '#c4b5fd'],
    ['CTR', `${Number(m.ctr).toFixed(2).replace('.', ',')}%`, '#34d399'],
  ].map(([label, value, color], i) => {
    const x = 48 + i * 223;
    return `<rect x="${x}" y="224" width="211" height="116" rx="16" fill="#121d30" stroke="#24324a"/>
      ${text(x + 16, 259, label, 13, '#94a3b8', 700)}
      ${text(x + 16, 305, value, value.length > 12 ? 23 : 28, color, 700)}`;
  }).join('');
  const stages = [['Impressões', m.impressions, 350], ['Alcance', m.reach, 295], ['Cliques no link', m.clicks, 230], ['Conversas', m.conversations, 165]];
  const funnel = stages.map(([label, value, width], i) => {
    const x = 276 - width / 2; const y = 431 + i * 68;
    return `<rect x="${x}" y="${y}" width="${width}" height="58" rx="10" fill="${['#164263', '#12618a', '#087ea4', '#039bbd'][i]}"/>
      ${text(276, y + 21, label.toUpperCase(), 12, '#dbeafe', 700, 'middle')}
      ${text(276, y + 46, formatNumber(value), 22, '#ffffff', 700, 'middle')}`;
  }).join('');
  const max = Math.max(1, ...report.daily.map(day => day.messages));
  const bars = report.daily.map((day, i) => {
    const x = 555 + i * 80;
    const height = day.messages / max * 210;
    return `<rect x="${x}" y="${686 - height}" width="46" height="${Math.max(2, height)}" rx="5" fill="url(#bar)"/>
      ${text(x + 23, 674 - height, formatNumber(day.messages), 15, '#e2e8f0', 700, 'middle')}
      ${text(x + 23, 713, day.date.slice(5).split('-').reverse().join('/'), 13, '#94a3b8', 400, 'middle')}`;
  }).join('');
  const account = report.accountName;
  const nameLines = account.length <= 65 ? [account] : [account.slice(0, 65), account.slice(65, 128) + (account.length > 128 ? '…' : '')];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="866" viewBox="0 0 1200 866">
    <defs>
      <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#0c1526"/><stop offset="1" stop-color="#060b15"/></linearGradient>
      <linearGradient id="bar" x2="0" y2="1"><stop stop-color="#22d3ee"/><stop offset="1" stop-color="#0284c7"/></linearGradient>
    </defs>
    <rect width="1200" height="866" rx="24" fill="url(#bg)"/>
    <g font-family="Lato, sans-serif">
      <image href="${xml(agencyLogo)}" x="48" y="36" width="156" height="58" preserveAspectRatio="xMinYMid meet"/>
      ${text(240, 61, report.agencyLabel.toUpperCase(), 16, '#94a3b8', 700)}
      ${text(240, 87, 'RELATÓRIO DE DESEMPENHO', 21, '#ffffff', 700)}
      <image href="${xml(metaLogo)}" x="996" y="46" width="54" height="38" preserveAspectRatio="xMidYMid meet"/>
      ${text(1062, 73, 'Meta Ads', 17, '#e2e8f0', 700)}
      <line x1="48" x2="1152" y1="114" y2="114" stroke="#233149"/>
      ${nameLines.map((line, i) => text(48, 153 + i * 28, line, 26, '#ffffff', 700)).join('')}
      ${text(48, 205, `PERÍODO  ${period}  •  Últimos 7 dias completos`, 16, '#94a3b8')}
      ${kpis}
      <rect x="48" y="368" width="456" height="392" rx="18" fill="#101a2b" stroke="#24324a"/>
      ${text(276, 406, 'FUNIL DE RESULTADOS', 14, '#94a3b8', 700, 'middle')}
      ${funnel}
      <rect x="524" y="368" width="628" height="392" rx="18" fill="#101a2b" stroke="#24324a"/>
      ${text(552, 406, 'CONVERSAS POR DIA', 14, '#94a3b8', 700)}
      <line x1="550" y1="686" x2="1126" y2="686" stroke="#2c3c55"/>
      ${bars}
      ${text(48, 806, `Engajamentos: ${formatNumber(m.engagements)}   •   CPM: ${formatCurrency(m.cpm)}   •   Frequência: ${Number(m.frequency).toFixed(2).replace('.', ',')}`, 17, '#94a3b8')}
      ${text(1152, 835, `${report.agencyLabel} • Relatório automático`, 13, '#64748b', 400, 'end')}
    </g>
  </svg>`;
}
