/* global process */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getConfiguredAuth } from './_auth.js';

const TABLE = 'meta_token_connections';
export const META_API_BASE = 'https://graph.facebook.com/v22.0';

const AD_ACCOUNT_FIELDS =
  'id,account_id,name,account_status,currency,balance,amount_spent,spend_cap,is_prepay_account,funding_source_details';

export function isRegistryConfigured() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  return Boolean(url && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor e aplique a migração dos tokens Meta.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function owner() {
  const { authorizedEmail } = getConfiguredAuth();
  if (!authorizedEmail) throw new Error('AUTH_EMAIL não configurado no servidor.');
  return authorizedEmail;
}

/**
 * Lê as conexões do dono logado. Lança se o registro estiver quebrado — use
 * readMetaConnectionsSafe quando a ausência do registro não puder derrubar o fluxo.
 */
export async function readMetaConnections() {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select('*')
    .eq('owner_email', owner())
    .order('priority')
    .order('created_at');
  if (error) {
    throw new Error('Não foi possível ler os tokens da Meta. Aplique a migração meta_token_connections no Supabase.');
  }
  return data || [];
}

/**
 * Versão tolerante: sem Supabase configurado, sem migração aplicada ou sem sessão,
 * o painel segue funcionando apenas com o token de perfil, como antes.
 */
export async function readMetaConnectionsSafe() {
  if (!isRegistryConfigured()) return [];
  try {
    return await readMetaConnections();
  } catch (error) {
    console.warn('[meta-tokens] Registro indisponível, usando somente o token de perfil:', error.message);
    return [];
  }
}

export async function writeMetaConnection(connection) {
  const { error } = await getSupabaseClient().from(TABLE).upsert(connection, { onConflict: 'owner_email,id' });
  if (error) throw new Error('Não foi possível salvar o token da Meta.');
}

export async function deleteMetaConnection(id) {
  const { error } = await getSupabaseClient().from(TABLE).delete().eq('owner_email', owner()).eq('id', id);
  if (error) throw new Error('Não foi possível remover o token da Meta.');
}

export function newConnectionId() {
  return crypto.randomUUID();
}

async function metaGet(path, token, params = {}) {
  const url = new URL(`${META_API_BASE}${path}`);
  url.searchParams.set('access_token', token);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.href, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Erro da Meta API (${response.status})`);
  }
  return payload;
}

export async function fetchMetaProfile(token) {
  return metaGet('/me', token, { fields: 'id,name' });
}

export async function fetchMetaAdAccounts(token) {
  const payload = await metaGet('/me/adaccounts', token, { fields: AD_ACCOUNT_FIELDS, limit: 500 });
  return payload.data || [];
}

/**
 * Descobre validade do token. Um token de usuário do sistema tem expires_at = 0
 * (nunca expira), que é justamente o motivo de cadastrá-lo aqui.
 */
export async function inspectMetaToken(token) {
  try {
    const payload = await metaGet('/debug_token', token, { input_token: token });
    const info = payload.data || {};
    const expiresAt = Number(info.expires_at || 0);
    return {
      neverExpires: expiresAt === 0,
      expiresAt: expiresAt > 0 ? new Date(expiresAt * 1000).toISOString() : null,
      kind: info.type === 'USER' && expiresAt === 0 ? 'system_user' : String(info.type || 'user').toLowerCase(),
    };
  } catch {
    // debug_token exige permissões que nem todo app concede; não é motivo para recusar o token.
    return { neverExpires: false, expiresAt: null, kind: 'system_user' };
  }
}

/** Metadados seguros para o navegador: o token em si nunca sai do servidor. */
export function publicMetaTokenSnapshot(connections) {
  return {
    success: true,
    connections: (connections || []).map((connection) => ({
      id: connection.id,
      label: connection.label,
      kind: connection.kind,
      metaUserName: connection.meta_user_name || null,
      metaUserId: connection.meta_user_id || null,
      neverExpires: Boolean(connection.never_expires),
      expiresAt: connection.expires_at || null,
      warning: connection.warning || null,
      createdAt: connection.created_at || null,
      updatedAt: connection.updated_at || null,
      accountCount: (connection.accounts || []).length,
      accounts: (connection.accounts || []).map((account) => ({
        id: account.id,
        name: account.name || account.id,
      })),
    })),
  };
}

export function normalizeAdAccountId(value) {
  const raw = String(value || '').trim();
  if (/^act_\d+$/.test(raw)) return raw;
  if (/^\d+$/.test(raw)) return `act_${raw}`;
  return null;
}

/**
 * Token de BM que cobre a conta, seguindo a ordem de prioridade do registro.
 * Sem cobertura, devolve null e o chamador cai para o token de perfil.
 */
export function resolveConnectionForAccount(connections, accountId) {
  const normalized = normalizeAdAccountId(accountId);
  if (!normalized) return null;
  return (connections || []).find((connection) =>
    (connection.accounts || []).some((account) => normalizeAdAccountId(account.id) === normalized)
  ) || null;
}

/** Contas de anúncio de todos os tokens do registro, sem repetir. */
export function collectRegistryAccounts(connections) {
  const accounts = new Map();
  for (const connection of connections || []) {
    for (const account of connection.accounts || []) {
      const id = normalizeAdAccountId(account.id);
      if (id && !accounts.has(id)) accounts.set(id, account);
    }
  }
  return [...accounts.values()];
}
