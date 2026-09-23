export const META_TOKENS_UPDATED_EVENT = 'meta-tokens-updated';

async function postMetaTokens(body) {
  const response = await fetch('/api/meta-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Falha ao falar com o servidor (${response.status})`);
  }
  return payload;
}

function notifyUpdate() {
  window.dispatchEvent(new Event(META_TOKENS_UPDATED_EVENT));
}

/** Metadados dos tokens de BM. O token em si nunca chega ao navegador. */
export async function getMetaTokens() {
  const payload = await postMetaTokens({ action: 'status' });
  return payload.connections || [];
}

export async function addMetaToken({ label, token, businessName }) {
  const payload = await postMetaTokens({ action: 'add', label, token, businessName });
  notifyUpdate();
  return payload.connections || [];
}

export async function refreshMetaTokens() {
  const payload = await postMetaTokens({ action: 'refresh' });
  notifyUpdate();
  return payload.connections || [];
}

export async function renameMetaToken(id, label) {
  const payload = await postMetaTokens({ action: 'rename', id, label });
  notifyUpdate();
  return payload.connections || [];
}

export async function removeMetaToken(id) {
  const payload = await postMetaTokens({ action: 'remove', id });
  notifyUpdate();
  return payload.connections || [];
}
