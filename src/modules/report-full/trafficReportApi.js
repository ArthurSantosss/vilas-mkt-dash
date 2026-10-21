// Chamadas do painel para /api/traffic-report (todas exigem login).

async function request(action, { method = 'GET', params = {}, body } = {}) {
  const query = new URLSearchParams({ action, ...params });
  const res = await fetch(`/api/traffic-report?${query}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.details || json.error || `HTTP ${res.status}`);
  return json;
}

export const listTrafficConfigs = () => request('configs').then(json => json.configs || []);
export const fetchTrafficOptions = (params) => request('options', { params });
export const saveTrafficConfig = (config) => request('save-config', { method: 'POST', body: { config } }).then(json => json.config);
export const deleteTrafficConfig = (id) => request('delete-config', { method: 'POST', body: { id } });
export const shareTrafficConfig = (id, slug) => request('share', { method: 'POST', body: { id, slug } }).then(json => json.share);

const SHARE_BASE_URL = (import.meta.env.VITE_PUBLIC_SHARE_BASE_URL || '').trim();

/** Mesma regra dos links atuais: slug no domínio de compartilhamento, senão /r/:id. */
export function buildShareUrl(share) {
  if (!share) return '';
  const base = SHARE_BASE_URL ? SHARE_BASE_URL.replace(/\/+$/, '') : window.location.origin;
  if (SHARE_BASE_URL && share.public_slug) return `${base}/${encodeURIComponent(share.public_slug)}`;
  return `${base}/r/${share.id}`;
}
