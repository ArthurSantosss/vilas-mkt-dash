/**
 * Fetches client data from the Google Sheets spreadsheet.
 *
 * Two modes:
 * 1. Google Sheets API v4 with API key (VITE_GOOGLE_API_KEY) — works with shared spreadsheets
 * 2. Public gviz/tq CSV endpoint — works only with "published to web" spreadsheets
 *
 * Spreadsheet: ARTHUR VILAS
 * Sheets: TAG, GDM, LAQUILA
 */

const SPREADSHEET_ID = '1b1vjzOhpMsBI77mRp2luV0NJySR-RQMjP-Rzw8qFiWs';

const SHEET_CONFIGS = [
  { name: 'TAG', valueColumn: 'VALOR DO PIX', range: 'TAG!A1:Z200' },
  { name: 'GDM', valueColumn: 'VALOR DIA', range: 'GDM!A1:Z200' },
  { name: 'LAQUILA', valueColumn: null, skipFirstRow: true, range: 'LAQUILA!A1:Z200' },
];

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCSV(csv) {
  return csv.split('\n')
    .map(parseCSVLine)
    .filter(row => row.length > 1);
}

function normalizeStatus(value) {
  if (!value) return 'inactive';
  const v = value.toUpperCase().trim();
  if (v === 'OK') return 'active';
  if (v.includes('SEM VERBA') || v.includes('DESATIV')) return 'paused';
  if (v) return 'note';
  return 'inactive';
}

function parseRowsToClients(rows, config) {
  let headerIndex = 0;
  if (config.skipFirstRow) {
    headerIndex = rows.findIndex(r => r.some(c => (c || '').toUpperCase().includes('CLIENTE')));
    if (headerIndex === -1) headerIndex = 1;
  }

  const header = rows[headerIndex];
  if (!header) return [];

  const dataRows = rows.slice(headerIndex + 1).filter(r => r[1]);

  return dataRows.map(row => {
    const colMap = {};
    header.forEach((h, i) => { colMap[(h || '').toUpperCase().trim()] = i; });

    const facebookIdx = colMap['FACEBOOK'] ?? -1;
    const googleIdx = colMap['GOOGLE'] ?? -1;
    const verbaIdx = colMap['VERBA'] ?? colMap['CONSULTORIAS'] ?? -1;
    const nichoIdx = colMap['NICHO'] ?? colMap['TESE'] ?? -1;

    let valorIdx = -1;
    if (config.valueColumn) {
      valorIdx = colMap[config.valueColumn.toUpperCase()] ?? -1;
    }
    if (valorIdx === -1) {
      valorIdx = colMap['VALOR DO PIX'] ?? colMap['VALOR DIA'] ?? -1;
      if (valorIdx === -1 && row.length > 6) valorIdx = 6;
    }

    return {
      agency: config.name,
      name: row[1] || '',
      facebook: row[facebookIdx] || '',
      facebookStatus: normalizeStatus(row[facebookIdx]),
      google: row[googleIdx] || '',
      googleStatus: normalizeStatus(row[googleIdx]),
      verba: row[verbaIdx] || '',
      valor: row[valorIdx] || '',
      nicho: row[nichoIdx] || '',
    };
  }).filter(c => c.name);
}

/**
 * Fetch via Google Sheets API v4 (requires VITE_GOOGLE_API_KEY)
 */
async function fetchSheetViaAPI(config, apiKey) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(config.range)}?key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${response.status}: ${body.substring(0, 100)}`);
  }
  const data = await response.json();
  return data.values || [];
}

/**
 * Fetch via gviz/tq CSV endpoint (requires published spreadsheet)
 */
async function fetchSheetViaCSV(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CSV ${response.status}`);
  const csv = await response.text();
  return parseCSV(csv);
}

export async function fetchAllSheetClients() {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  const results = [];

  for (const config of SHEET_CONFIGS) {
    try {
      let rows;
      if (apiKey) {
        rows = await fetchSheetViaAPI(config, apiKey);
      } else {
        rows = await fetchSheetViaCSV(config.name);
      }
      const clients = parseRowsToClients(rows, config);
      results.push(...clients);
    } catch (err) {
      console.warn(`[GoogleSheets] Erro ao buscar aba ${config.name}:`, err.message);
    }
  }

  if (results.length === 0 && !apiKey) {
    throw new Error('GOOGLE_API_KEY_MISSING');
  }

  return results;
}
