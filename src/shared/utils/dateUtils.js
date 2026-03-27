export const formatYMD = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const parseYMD = (dateString) => {
  if (!dateString) return null;
  const [y, m, d] = dateString.split('-');
  return new Date(y, m - 1, d);
};

export const getToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const getYesterday = () => {
  const d = getToday();
  d.setDate(d.getDate() - 1);
  return d;
};

export const subDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
};

export const PRESETS = [
  { id: 'today', label: 'Hoje', getRange: () => ({ startDate: formatYMD(getToday()), endDate: formatYMD(getToday()) }) },
  { id: 'yesterday', label: 'Ontem', getRange: () => ({ startDate: formatYMD(getYesterday()), endDate: formatYMD(getYesterday()) }) },
  { id: '7d', label: 'Últimos 7 dias', getRange: () => ({ startDate: formatYMD(subDays(getYesterday(), 6)), endDate: formatYMD(getYesterday()) }) },
  { id: 'today_yesterday', label: 'Hoje e ontem', getRange: () => ({ startDate: formatYMD(getYesterday()), endDate: formatYMD(getToday()) }) },
  { id: '14d', label: 'Últimos 14 dias', getRange: () => ({ startDate: formatYMD(subDays(getYesterday(), 13)), endDate: formatYMD(getYesterday()) }) },
  { id: '30d', label: 'Últimos 30 dias', getRange: () => ({ startDate: formatYMD(subDays(getYesterday(), 29)), endDate: formatYMD(getYesterday()) }) },
  { id: 'month', label: 'Este mês', getRange: () => {
      const yesterday = getYesterday();
      const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
      return { startDate: formatYMD(start), endDate: formatYMD(yesterday) };
    }
  },
  { id: 'last_month', label: 'Mês passado', getRange: () => {
      const today = getToday();
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startDate: formatYMD(start), endDate: formatYMD(end) };
    }
  }
];

export const isSameDay = (d1, d2) => d1 && d2 && d1.getTime() === d2.getTime();

export const isDateInRange = (date, startStr, endStr) => {
  if (!startStr || !endStr) return false;
  const d = date.getTime();
  const s = parseYMD(startStr).getTime();
  const e = parseYMD(endStr).getTime();
  // Allow inverse selection ranges safely
  return d >= Math.min(s, e) && d <= Math.max(s, e);
};

export const getMonthDays = (year, month) => {
  const date = new Date(year, month, 1);
  const days = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

export const getFirstDayPadding = (year, month) => {
  const date = new Date(year, month, 1);
  // Get day of week (0-6) where 0 is Sunday.
  // We want Monday (1) to be the first column (0), so:
  // Sun(0)->6, Mon(1)->0, Tue(2)->1, Wed(3)->2, Thu(4)->3, Fri(5)->4, Sat(6)->5
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
};

export const formatSelectedRangeForDisplay = (startStr, endStr) => {
  if (!startStr || !endStr) return 'Selecionar período...';
  
  const start = parseYMD(startStr);
  const end = parseYMD(endStr);
  
  const formatter = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
  const s = formatter.format(start).replace(/ de /g, ' de ').replace('.', '');
  const e = formatter.format(end).replace(/ de /g, ' de ').replace('.', '');
  
  return `${s} - ${e}`;
};

export const getPresetLabelById = (id, defaultLabel = 'Personalizado') => {
  const preset = PRESETS.find(p => p.id === id);
  return preset ? preset.label : defaultLabel;
};
