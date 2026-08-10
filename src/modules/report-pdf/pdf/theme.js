// Paleta e medidas do relatório PDF.
// Capa escura para impacto de abertura, miolo claro para leitura e impressão.

export const COLORS = {
  primary: '#0FA5AE',
  primaryLight: '#20CFCF',
  primaryDark: '#0B7B85',

  // Fundos escuros (capa e faixas de destaque)
  ink: '#0A0D14',
  inkSoft: '#141A26',
  inkLine: 'rgba(255,255,255,0.12)',
  onInk: '#FFFFFF',
  onInkSoft: 'rgba(255,255,255,0.62)',

  // Miolo claro
  page: '#FFFFFF',
  surface: '#F8FAFC',
  surfaceAlt: '#F1F5F9',
  line: '#E2E8F0',
  lineSoft: '#EFF3F8',

  text: '#0F172A',
  textSoft: '#475569',
  textMuted: '#94A3B8',

  positive: '#0F9D58',
  negative: '#DC2626',
  neutral: '#64748B',
};

// Sequência usada em gráficos categóricos (público, plataformas, posicionamentos).
export const CHART_SERIES = ['#0FA5AE', '#20CFCF', '#0B7B85', '#38BDF8', '#818CF8', '#F59E0B', '#94A3B8'];

export const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 44,
  marginTop: 40,
  marginBottom: 52,
};

export const CONTENT_WIDTH = PAGE.width - PAGE.marginX * 2;

export const FONT = 'Helvetica';
