import { createContext, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';
import { loadCloudSnapshot, saveCloudSnapshot } from '../shared/utils/cloudBackup';

const PreferencesContext = createContext();

export function PreferencesProvider({ children }) {
  const isHydrated = useRef(false);
  const syncTimeout = useRef(null);
  const { user } = useAuth();
  const email = user?.email;

  useEffect(() => {
    let mounted = true;

    async function hydrateFromCloud() {
      if (!email) return;
      try {
        const { hasBackup, changedLocal, presentKeys } = await loadCloudSnapshot(supabase, email);
        if (!mounted) return;

        if (!hasBackup) {
          console.log('[PreferencesSync] Nenhum backup salvo na nuvem para este login');
          isHydrated.current = true;
          return;
        }

        console.log('[PreferencesSync] Backup da nuvem aplicado com', presentKeys.length, 'chaves');

        if (changedLocal) {
          console.log('[PreferencesSync] Preferências da nuvem aplicadas localmente. Notificando componentes...');
          window.dispatchEvent(new CustomEvent('meta-token-updated'));
          window.dispatchEvent(new CustomEvent('local-storage-map-updated', { detail: { fromCloud: true } }));
          window.dispatchEvent(new CustomEvent('meta-accounts-toggled'));
        }

        isHydrated.current = true;
        console.log('[PreferencesSync] Sincronização concluída');
      } catch (err) {
        console.warn('[PreferencesSync] Falha ao sincronizar com nuvem (Supabase offline?):', err);
        if (mounted) {
          isHydrated.current = true;
        }
      }
    }

    hydrateFromCloud();
    return () => { mounted = false; };
  }, [email]);

  // Escuta se alguma página modificou uma preferência. Se modificou, joga na nuvem (Debounced)
  useEffect(() => {
    if (!email) return;
    const handleStorageMapped = (e) => {
      // Ignora os eventos emitidos pela PRÓPRIA nuvem para não gerar loop infinito
      if (e?.detail?.fromCloud) return;
      if (!isHydrated.current) return;

      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      
      syncTimeout.current = setTimeout(async () => {
        try {
          await saveCloudSnapshot(supabase, email);
          console.log('[PreferencesSync] Auto-save OK');
        } catch (err) {
          console.warn('[PreferencesSync] Erro no auto-save:', err);
        }
      }, 1500); // 1.5s após a última modificação ele salva
    };

    window.addEventListener('local-storage-map-updated', handleStorageMapped);
    return () => window.removeEventListener('local-storage-map-updated', handleStorageMapped);
  }, [email]);

  return (
    <PreferencesContext.Provider value={{}}>
      {children}
    </PreferencesContext.Provider>
  );
}
