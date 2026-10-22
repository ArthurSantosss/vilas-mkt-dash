async function request(action, params = {}) {
  const query = new URLSearchParams({ action, ...params });
  const res = await fetch(`/api/instagram?${query}`, { credentials: 'include' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.details || json.error || `HTTP ${res.status}`);
  return json;
}

export const fetchInstagramAccounts = ({ refresh = false } = {}) =>
  request('accounts', refresh ? { refresh: '1' } : {});

export const fetchInstagramOverview = ({ igId, start, end, refresh = false }) =>
  request('overview', { igId, inicio: start, fim: end, ...(refresh ? { refresh: '1' } : {}) });
