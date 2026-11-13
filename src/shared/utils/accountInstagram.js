// Vínculo conta de anúncio (Meta `act_…` ou Google, 10 dígitos) → perfil do Instagram.
// Fica no localStorage, entra no backup na nuvem (app_preferences) e o servidor lê de lá
// para colocar seguidores e dados do perfil nos relatórios.

export const ACCOUNT_INSTAGRAM_KEY = 'account_instagram';

export function readAccountInstagram() {
  try {
    const stored = JSON.parse(localStorage.getItem(ACCOUNT_INSTAGRAM_KEY));
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

/** Cada perfil do Instagram fica ligado a uma conta só: vincular aqui solta o vínculo anterior. */
export function saveAccountInstagram(accountId, igId) {
  const links = readAccountInstagram();
  if (igId) {
    for (const [otherId, linked] of Object.entries(links)) {
      if (otherId !== accountId && String(linked) === String(igId)) delete links[otherId];
    }
    links[accountId] = String(igId);
  } else delete links[accountId];
  try { localStorage.setItem(ACCOUNT_INSTAGRAM_KEY, JSON.stringify(links)); } catch { /* sem armazenamento */ }
  window.dispatchEvent(new CustomEvent('local-storage-map-updated', {
    detail: { key: ACCOUNT_INSTAGRAM_KEY, value: links },
  }));
  return links;
}
