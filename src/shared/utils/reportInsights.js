// Formatadores usados pelos relatórios em texto. A leitura positiva fica em positiveReading.js.

export function formatPercentValue(value, digits = 2) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

export function formatFrequency(value) {
  return Number(value || 0).toFixed(1).replace('.', ',');
}
