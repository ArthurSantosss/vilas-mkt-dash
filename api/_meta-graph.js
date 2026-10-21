/* global process */

// Leitura da Graph API para os links públicos de relatório. O token nunca sai do
// servidor: é escolhido aqui, na mesma ordem usada pelo painel.

import { META_API_BASE, readMetaConnectionsSafe, resolveConnectionForAccount } from './_meta-tokens.js';
import { createReportStore } from './_automatic-reports.js';

export async function metaGet(path, params, token) {
  const url = path.startsWith('http') ? new URL(path) : new URL(`${META_API_BASE}${path}`);
  url.searchParams.set('access_token', token);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25_000) });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) {
    const error = new Error(data.error?.message || `Meta API ${res.status}`);
    error.metaError = data.error || null;
    throw error;
  }
  return data;
}

/** Segue `paging.next` até o fim (com teto para não travar a função). */
export async function metaGetAll(path, params, token, maxPages = 40) {
  const rows = [];
  let page = await metaGet(path, params, token);
  rows.push(...(page.data || []));
  let pages = 1;
  while (page.paging?.next && pages < maxPages) {
    const next = new URL(page.paging.next);
    next.searchParams.delete('access_token');
    page = await metaGet(next.toString(), {}, token);
    rows.push(...(page.data || []));
    pages += 1;
  }
  return rows;
}

// Token sem validade ou sem acesso ao objeto: vale tentar o próximo candidato.
export function isRetryableTokenError(error) {
  const metaError = error?.metaError || {};
  const code = Number(metaError.code);
  const subcode = Number(metaError.error_subcode);
  if ([3, 10, 102, 190, 200, 803].includes(code)) return true;
  if ([458, 459, 460, 463, 464, 466, 467, 492].includes(subcode)) return true;
  return /access token|session|permission|unsupported get request/i.test(String(error?.message || ''));
}

async function readSavedProfileToken() {
  try {
    return await createReportStore().get('meta_provider_token');
  } catch {
    return null;
  }
}

/** Candidatos na ordem do painel: BM que cobre a conta → perfil salvo → env → demais BMs. */
export async function listTokenCandidates(accountId = null) {
  const [connections, savedToken] = await Promise.all([readMetaConnectionsSafe(), readSavedProfileToken()]);
  const matched = accountId ? resolveConnectionForAccount(connections, accountId) : null;
  return [...new Set([
    matched?.token,
    savedToken,
    process.env.META_ACCESS_TOKEN,
    process.env.VITE_META_ACCESS_TOKEN,
    ...connections.map(connection => connection.token),
  ].filter(token => typeof token === 'string' && token.trim()).map(token => token.trim()))];
}

/**
 * Devolve o primeiro token que consegue ler `objectId` (conta de anúncio ou
 * conta do Instagram), junto com os campos pedidos na sondagem.
 */
export async function resolveWorkingToken(objectId, { fields = 'name', accountId = objectId } = {}) {
  const candidates = await listTokenCandidates(accountId);
  if (!candidates.length) throw new Error('Nenhum token Meta configurado no servidor.');

  let lastError;
  for (const token of candidates) {
    try {
      const object = await metaGet(`/${objectId}`, { fields }, token);
      return { token, object, accountName: object?.name || null };
    } catch (error) {
      lastError = error;
      if (!isRetryableTokenError(error)) throw error;
    }
  }
  const error = new Error('Nenhuma conexão Meta válida conseguiu acessar esta conta. Reconecte a conta ou revise os tokens das Business Managers em Configurações.');
  error.cause = lastError;
  throw error;
}
