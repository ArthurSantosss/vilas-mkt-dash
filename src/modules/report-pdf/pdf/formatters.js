// Formatação para o PDF.
// Intl usa espaço não-quebrável (U+00A0) entre símbolo e número; trocamos por
// espaço comum para evitar qualquer glifo estranho na fonte embutida do PDF.

function normalizeSpaces(value) {
  return String(value).replace(/\u00A0/g, ' ');
}

export function money(value) {
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  return normalizeSpaces(
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num)
  );
}

export function count(value) {
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  return normalizeSpaces(new Intl.NumberFormat('pt-BR').format(Math.round(num)));
}

export function compact(value) {
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (Math.abs(num) >= 1000000) return `${(num / 1000000).toFixed(1).replace('.', ',').replace(',0', '')} mi`;
  if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1).replace('.', ',').replace(',0', '')} mil`;
  return count(num);
}

export function percent(value, digits = 2) {
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${num.toFixed(digits).replace('.', ',')}%`;
}

export function decimal(value, digits = 2) {
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  return num.toFixed(digits).replace('.', ',');
}

// Variação percentual entre período atual e anterior. Retorna null quando não há
// base de comparação — nesse caso o PDF omite o selo de variação.
export function variation(current, previous) {
  const currentNum = Number(current) || 0;
  const previousNum = Number(previous) || 0;
  if (!previousNum) return null;
  return ((currentNum - previousNum) / previousNum) * 100;
}

export function signedPercent(value, digits = 1) {
  const num = Number(value) || 0;
  const sign = num >= 0 ? '+' : '-';
  return `${sign}${Math.abs(num).toFixed(digits).replace('.', ',')}%`;
}

export function todayLabel() {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
}

// Corta textos longos (nomes de campanha/anúncio) preservando o começo, que é
// onde costuma estar a informação útil.
export function truncate(text, max) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
