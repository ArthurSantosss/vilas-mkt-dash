import { AUTO_ALERTS_STORAGE_KEY } from '../constants/autoAlerts';

export const CLOUD_SYNC_MANIFEST_KEY = '__cloud_backup_manifest__';
export const LEGACY_SENSITIVE_KEYS = ['meta_provider_token'];

export const CLOUD_SYNC_KEYS = [
  'account_monthly_goals',
  'account_payment_methods',
  'account_last_payments',
  'account_last_payment_sources',
  'account_billing_frequencies',
  'account_next_payment_overrides',
  'meta_balance_snapshots',
  'custom_account_names',
  'meta_ads_column_order',
  'meta_ads_notes',
  'meta_ad_accounts',
  'disabled_ad_accounts',
  'meta_user_info',
  'google_ads_accounts',
  'google_ads_connection',
  'client_logos',
  'agencies_list',
  'account_agencies',
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

export function readLocalCloudSnapshot(keys = CLOUD_SYNC_KEYS) {
  const snapshot = {};
  const presentKeys = [];

  for (const key of keys) {
    const rawValue = localStorage.getItem(key);
    if (!hasStoredValue(rawValue)) continue;

    try {
      snapshot[key] = JSON.parse(rawValue);
      presentKeys.push(key);
    } catch {
      // Ignore invalid payloads instead of corrupting the remote backup.
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
    .filter((key) => !presentKeySet.has(key))
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
    if (presentKeySet.has(key)) {
      const nextValue = JSON.stringify(snapshot[key]);
      if (localStorage.getItem(key) !== nextValue) {
        localStorage.setItem(key, nextValue);
        changedLocal = true;
      }
      continue;
    }

    if (pruneMissing && localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      changedLocal = true;
    }
  }

  return changedLocal;
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
