import { AUTO_ALERTS_STORAGE_KEY } from '../constants/autoAlerts';

export const CLOUD_SYNC_MANIFEST_KEY = '__cloud_backup_manifest__';
export const LEGACY_SENSITIVE_KEYS = [];

// Valores persistidos como string simples no localStorage, sem JSON.
const RAW_VALUE_KEYS = new Set(['meta_provider_token']);

export const CLOUD_SYNC_KEYS = [
  'meta_provider_token',
  'account_monthly_goals',
  'account_payment_methods',
  'account_last_payments',
  'account_last_payment_sources',
  'account_billing_frequencies',
  'account_next_payment_overrides',
  'meta_balance_snapshots',
  'meta_balances',
  'custom_account_names',
  'meta_ads_column_order',
  'meta_ads_notes',
  'meta_ad_accounts',
  'disabled_ad_accounts',
  'meta_user_info',
  'google_ads_accounts',
  'google_ads_connection',
  'disabled_google_ads_accounts',
  'google_ads_column_order',
  'google_account_monthly_goals',
  'google_account_payment_methods',
  'google_account_last_payments',
  'google_account_last_payment_sources',
  'google_account_billing_frequencies',
  'client_logos',
  'agencies_list',
  'account_agencies',
  'checklist_all_tasks',
  AUTO_ALERTS_STORAGE_KEY,
];

function hasStoredValue(value) {
  return value !== null && value !== 'undefined' && value !== '';
}

export function dispatchLocalStorageMapUpdated(key, value, extraDetail = {}) {
  window.dispatchEvent(new CustomEvent('local-storage-map-updated', {
    detail: { key, value, ...extraDetail },
  }));
}

/**
 * Garante que se o token Meta estiver no .env mas ainda não no localStorage,
 * seja salvo localmente para poder ser incluído no backup.
 */
function ensureMetaTokenPopulated() {
  try {
    const current = localStorage.getItem('meta_provider_token');
    if (!hasStoredValue(current) && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      const devToken = import.meta.env.VITE_META_ACCESS_TOKEN;
      if (devToken && devToken.trim()) {
        localStorage.setItem('meta_provider_token', devToken.trim());
        return devToken.trim();
      }
    }
    return current;
  } catch {
    return null;
  }
}

/**
 * Coleta todas as chaves dinâmicas do checklist armazenadas no localStorage.
 */
function collectChecklistData() {
  const checklistData = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('checklist_')) {
        checklistData[k] = localStorage.getItem(k);
      }
    }
  } catch {
    // Ignora se localStorage indisponível
  }
  return checklistData;
}

export function readLocalCloudSnapshot(keys = CLOUD_SYNC_KEYS) {
  ensureMetaTokenPopulated();
  const snapshot = {};
  const presentKeys = [];

  for (const key of keys) {
    const rawValue = localStorage.getItem(key);
    if (!hasStoredValue(rawValue)) continue;

    if (RAW_VALUE_KEYS.has(key)) {
      snapshot[key] = rawValue;
      presentKeys.push(key);
      continue;
    }

    try {
      snapshot[key] = JSON.parse(rawValue);
      presentKeys.push(key);
    } catch {
      // Preserva strings puras
      snapshot[key] = rawValue;
      presentKeys.push(key);
    }
  }

  // Backup em lote das tarefas de checklist
  const checklistData = collectChecklistData();
  if (Object.keys(checklistData).length > 0) {
    snapshot['checklist_all_tasks'] = checklistData;
    if (!presentKeys.includes('checklist_all_tasks')) {
      presentKeys.push('checklist_all_tasks');
    }
  }

  return { snapshot, presentKeys };
}

function buildManifestValue(presentKeys, timestamp) {
  return {
    keys: presentKeys,
    updated_at: timestamp,
  };
}

function getPrefixedKey(email, key) {
  return `${email}_${key}`;
}

async function deleteLegacySensitiveKeys(supabase, email) {
  if (!email || LEGACY_SENSITIVE_KEYS.length === 0) return;

  const { error } = await supabase
    .from('app_preferences')
    .delete()
    .in('key', LEGACY_SENSITIVE_KEYS.map((key) => getPrefixedKey(email, key)));

  if (error) throw error;
}

export async function saveCloudSnapshot(supabase, email, keys = CLOUD_SYNC_KEYS) {
  if (!email) return false;

  await deleteLegacySensitiveKeys(supabase, email);

  const timestamp = new Date().toISOString();
  const { snapshot, presentKeys } = readLocalCloudSnapshot(keys);
  const presentKeySet = new Set(presentKeys);
  const keysToDelete = keys
    .filter((key) => !presentKeySet.has(key) && key !== 'meta_provider_token')
    .map((key) => getPrefixedKey(email, key));

  const rowsToUpsert = presentKeys.map((key) => ({
    key: getPrefixedKey(email, key),
    value: snapshot[key],
    updated_at: timestamp,
  }));

  rowsToUpsert.push({
    key: getPrefixedKey(email, CLOUD_SYNC_MANIFEST_KEY),
    value: buildManifestValue(presentKeys, timestamp),
    updated_at: timestamp,
  });

  const { error: upsertError } = await supabase
    .from('app_preferences')
    .upsert(rowsToUpsert, { onConflict: 'key' });

  if (upsertError) throw upsertError;

  if (keysToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('app_preferences')
      .delete()
      .in('key', keysToDelete);

    if (deleteError) throw deleteError;
  }

  return true;
}

function parseCloudRows(rows, email, keys = CLOUD_SYNC_KEYS) {
  const snapshot = {};
  const validKeys = new Set(keys);
  let manifestKeys = null;

  for (const row of rows || []) {
    const prefixedKey = String(row.key || '');
    const prefix = `${email}_`;
    const originalKey = prefixedKey.startsWith(prefix)
      ? prefixedKey.slice(prefix.length)
      : prefixedKey;
    if (!originalKey) continue;

    if (originalKey === CLOUD_SYNC_MANIFEST_KEY) {
      if (Array.isArray(row.value?.keys)) {
        manifestKeys = row.value.keys.filter((key) => validKeys.has(key));
      }
      continue;
    }

    if (!validKeys.has(originalKey)) continue;
    snapshot[originalKey] = row.value;
  }

  return {
    snapshot,
    presentKeys: manifestKeys || Object.keys(snapshot),
    hasManifest: manifestKeys !== null,
    hasBackup: (rows || []).length > 0,
  };
}

export function applyCloudSnapshotToLocal(snapshot, presentKeys, keys = CLOUD_SYNC_KEYS, pruneMissing = true) {
  const presentKeySet = new Set(presentKeys);
  let changedLocal = false;

  for (const key of keys) {
    const listed = presentKeySet.has(key);
    const hasValue = listed && snapshot[key] !== undefined && snapshot[key] !== null;

    // Restaura o checklist agrupado
    if (key === 'checklist_all_tasks' && hasValue && typeof snapshot[key] === 'object') {
      for (const [subKey, subVal] of Object.entries(snapshot[key])) {
        if (localStorage.getItem(subKey) !== subVal) {
          localStorage.setItem(subKey, String(subVal));
          changedLocal = true;
        }
      }
      continue;
    }

    if (hasValue) {
      const nextValue = RAW_VALUE_KEYS.has(key)
        ? String(snapshot[key])
        : JSON.stringify(snapshot[key]);
      if (localStorage.getItem(key) !== nextValue) {
        localStorage.setItem(key, nextValue);
        changedLocal = true;
      }
      continue;
    }

    // PROTEÇÃO ESSENCIAL: Nunca apagar o token Meta da máquina local se a nuvem vier sem valor!
    if (key === 'meta_provider_token') {
      continue;
    }

    if ((pruneMissing || listed) && localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      changedLocal = true;
    }
  }

  return changedLocal;
}

/**
 * Apaga chaves específicas do backup na nuvem sem reenviar o snapshot inteiro.
 */
export async function purgeCloudKeys(supabase, email, keys) {
  if (!email || !Array.isArray(keys) || keys.length === 0) return false;

  const { error } = await supabase
    .from('app_preferences')
    .delete()
    .in('key', keys.map((key) => getPrefixedKey(email, key)));

  if (error) throw error;
  return true;
}

export async function loadCloudSnapshot(supabase, email, keys = CLOUD_SYNC_KEYS) {
  if (!email) {
    return { hasBackup: false, changedLocal: false, presentKeys: [], snapshot: {} };
  }

  await deleteLegacySensitiveKeys(supabase, email);

  const { data, error } = await supabase
    .from('app_preferences')
    .select('key, value')
    .like('key', `${email}_%`);

  if (error) throw error;

  const { snapshot, presentKeys, hasManifest, hasBackup } = parseCloudRows(data, email, keys);
  if (!hasBackup) {
    return { hasBackup: false, changedLocal: false, presentKeys: [], snapshot: {} };
  }

  const changedLocal = applyCloudSnapshotToLocal(snapshot, presentKeys, keys, hasManifest);
  return { hasBackup: true, changedLocal, presentKeys, snapshot, hasManifest };
}

/**
 * Exporta backup integral em arquivo .json para download do usuário.
 */
export function exportFullBackupToFile() {
  const { snapshot, presentKeys } = readLocalCloudSnapshot(CLOUD_SYNC_KEYS);
  const backupObject = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    keys: presentKeys,
    data: snapshot,
  };

  const blob = new Blob([JSON.stringify(backupObject, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `vilasmkt-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Importa backup integral de arquivo JSON e aplica no localStorage e na nuvem.
 */
export async function importFullBackupFromFile(jsonContent, supabase, email) {
  const parsed = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
  const data = parsed.data || parsed;
  const keys = parsed.keys || Object.keys(data);

  applyCloudSnapshotToLocal(data, keys, CLOUD_SYNC_KEYS, false);

  // Notifica todos os módulos
  for (const k of keys) {
    dispatchLocalStorageMapUpdated(k, data[k]);
  }
  window.dispatchEvent(new CustomEvent('meta-token-updated'));
  window.dispatchEvent(new CustomEvent('local-storage-map-updated'));

  // Salva na nuvem se autenticado
  if (supabase && email) {
    await saveCloudSnapshot(supabase, email, CLOUD_SYNC_KEYS);
  }

  return { success: true, keysCount: keys.length };
}
