export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function formatPercent(value) {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0;
  return `${num.toFixed(2)}%`;
}

export function formatDate(dateStr) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(dateStr));
}

export function formatDateTime(dateStr) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(dateStr));
}

export function formatTime(dateStr) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(dateStr));
}

export function getStatusColor(status) {
  const colors = {
    active: 'text-success bg-success/10 border-success/20',
    paused: 'text-warning bg-warning/10 border-warning/20',
    problem: 'text-danger bg-danger/10 border-danger/20',
    onboarding: 'text-info bg-info/10 border-info/20',
    churned: 'text-text-secondary bg-text-secondary/10 border-text-secondary/20',
    defaulting: 'text-danger bg-danger/10 border-danger/20'
  };
  return colors[status] || 'text-text-secondary bg-text-secondary/10';
}

export function getStatusLabel(status) {
  const labels = {
    active: 'Ativa',
    paused: 'Pausada',
    problem: 'Problema',
    onboarding: 'Onboarding',
    churned: 'Churned',
    defaulting: 'Inadimplente'
  };
  return labels[status] || status;
}

export function getCostColor(value, thresholds = { good: 5, warning: 10 }) {
  if (value === 0) return 'text-text-secondary';
  if (value < thresholds.good) return 'text-success';
  if (value <= thresholds.warning) return 'text-warning';
  return 'text-danger';
}

export function getPacingColor(pct) {
  if (pct >= 90 && pct <= 110) return 'bg-success';
  if ((pct >= 80 && pct < 90) || (pct > 110 && pct <= 120)) return 'bg-warning';
  return 'bg-danger';
}

export function getPacingStatus(pct) {
  if (pct > 120) return 'Acima do ritmo';
  if (pct > 110) return 'Levemente acima';
  if (pct >= 90) return 'No ritmo';
  if (pct >= 80) return 'Levemente abaixo';
  return 'Abaixo do ritmo';
}
