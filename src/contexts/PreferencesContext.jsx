import { createContext, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { AUTO_ALERTS_STORAGE_KEY } from '../shared/constants/autoAlerts';

// Chaves do localStorage que serão espelhadas e sincronizadas na Nuvem (Supabase)
const CLOUD_KEYS = [
  'account_monthly_goals',
  'account_payment_methods',
  'account_last_payments',
  'account_last_payment_sources',
  'account_billing_frequencies',
  'meta_balance_snapshots',
  'custom_account_names',
  'meta_ads_column_order',
  'meta_ad_accounts',
  'disabled_ad_accounts',
  'meta_provider_token',
  'meta_user_info',
  'client_logos',
  AUTO_ALERTS_STORAGE_KEY,
];

export const PreferencesContext = createContext();

export function PreferencesProvider({ children }) {
  const isHydrated = useRef(false);
  const syncTimeout = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function hydrateFromCloud() {
      try {
        const { data, error } = await supabase.from('app_preferences').select('key, value');
        if (error) {
          console.error('[PreferencesSync] Erro ao ler app_preferences:', error.message, error.hint || '');
          throw error;
        }
        if (!mounted) return;

        console.log('[PreferencesSync] Nuvem tem', (data || []).length, 'preferências salvas');

        let changedLocal = false;
        const cloudMap = {};
        for (const row of data || []) {
          cloudMap[row.key] = row.value;
        }

        const upserts = [];

        for (const key of CLOUD_KEYS) {
          const localStr = localStorage.getItem(key);
          const hasLocal = localStr !== null && localStr !== 'undefined' && localStr !== '';
          let localParsed;
          if (hasLocal) {
            try {
              localParsed = key === 'meta_provider_token' ? localStr : JSON.parse(localStr);
            } catch {
              localParsed = null;
            }
          }

          if (cloudMap[key] !== undefined) {
             const cloudVal = cloudMap[key];
             const strToSave = key === 'meta_provider_token' ? cloudVal : JSON.stringify(cloudVal);

             if (localStorage.getItem(key) !== strToSave) {
               localStorage.setItem(key, strToSave);
               changedLocal = true;
               console.log('[PreferencesSync] ↓ Nuvem → Local:', key);
             }
          } else if (localParsed !== null && localParsed !== undefined) {
             upserts.push({
               key,
               value: localParsed,
               updated_at: new Date().toISOString()
             });
          }
        }

        if (upserts.length > 0) {
           const { error: upsertErr } = await supabase.from('app_preferences').upsert(upserts, { onConflict: 'key' });
           if (upsertErr) {
             console.error('[PreferencesSync] Erro ao enviar para nuvem:', upsertErr.message, upsertErr.hint || '');
           } else {
             console.log('[PreferencesSync] ↑ Local → Nuvem:', upserts.map(u => u.key).join(', '));
           }
        }

        if (changedLocal) {
          console.log('[PreferencesSync] Recarregando página para aplicar preferências da nuvem...');
          window.location.reload();
        }

        isHydrated.current = true;
        console.log('[PreferencesSync] Sincronização concluída');
      } catch (err) {
        console.warn('[PreferencesSync] Falha ao sincronizar com nuvem (Supabase offline?):', err);
      }
    }

    hydrateFromCloud();
    return () => { mounted = false; };
  }, []);

  // Escuta se alguma página modificou uma preferência. Se modificou, joga na nuvem (Debounced)
  useEffect(() => {
    const handleStorageMapped = (e) => {
      // Ignora os eventos emitidos pela PRÓPRIA nuvem para não gerar loop infinito
      if (e?.detail?.fromCloud) return;
      if (!isHydrated.current) return;

      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      
      syncTimeout.current = setTimeout(async () => {
        const upserts = [];
        for (const key of CLOUD_KEYS) {
          const localStr = localStorage.getItem(key);
          if (localStr !== null && localStr !== 'undefined' && localStr !== '') {
             try {
               const localParsed = key === 'meta_provider_token' ? localStr : JSON.parse(localStr);
               upserts.push({ key, value: localParsed, updated_at: new Date().toISOString() });
             } catch { /* skip unparseable */ }
          }
        }
        if (upserts.length > 0) {
           try {
             const { error: saveErr } = await supabase.from('app_preferences').upsert(upserts, { onConflict: 'key' });
             if (saveErr) {
               console.warn('[PreferencesSync] Erro no auto-save:', saveErr.message);
             } else {
               console.log('[PreferencesSync] Auto-save OK:', upserts.map(u => u.key).join(', '));
             }
           } catch (err) {
             console.warn('[PreferencesSync] Erro no auto-save:', err);
           }
        }
      }, 1500); // 1.5s após a última modificação ele salva
    };

    window.addEventListener('local-storage-map-updated', handleStorageMapped);
    return () => window.removeEventListener('local-storage-map-updated', handleStorageMapped);
  }, []);

  return (
    <PreferencesContext.Provider value={{}}>
      {children}
    </PreferencesContext.Provider>
  );
}
