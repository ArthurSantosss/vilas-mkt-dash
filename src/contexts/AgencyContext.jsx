import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { dispatchLocalStorageMapUpdated } from '../shared/utils/cloudBackup';

const STORAGE_KEYS = {
  AGENCIES: 'agencies_list',
  ACCOUNT_AGENCIES: 'account_agencies',
};

const AgencyContext = createContext();

function readLocalAgencies() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.AGENCIES)) || []; } catch { return []; }
}

function readLocalAccountAgencies() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ACCOUNT_AGENCIES)) || {}; } catch { return {}; }
}

function persistLocalAgencies(list) {
  try {
    localStorage.setItem(STORAGE_KEYS.AGENCIES, JSON.stringify(list));
    dispatchLocalStorageMapUpdated(STORAGE_KEYS.AGENCIES, list);
  } catch {
    /* ignore */
  }
}

function persistLocalAccountAgencies(map) {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCOUNT_AGENCIES, JSON.stringify(map));
    dispatchLocalStorageMapUpdated(STORAGE_KEYS.ACCOUNT_AGENCIES, map);
  } catch {
    /* ignore */
  }
}

export function AgencyProvider({ children }) {
  const [agencies, setAgencies] = useState(readLocalAgencies);
  const [accountAgencies, setAccountAgencies] = useState(readLocalAccountAgencies);
  const useSupabaseRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const hasLocalSnapshot =
        localStorage.getItem(STORAGE_KEYS.AGENCIES) !== null ||
        localStorage.getItem(STORAGE_KEYS.ACCOUNT_AGENCIES) !== null;

      if (hasLocalSnapshot) {
        useSupabaseRef.current = true;
        return;
      }

      try {
        const [{ data: agencyRows, error: agencyErr }, { data: mapRows, error: mapErr }] = await Promise.all([
          supabase.from('agencies').select('name').order('name', { ascending: true }),
          supabase.from('account_agencies').select('account_id, agency_name'),
        ]);

        if (agencyErr) throw agencyErr;
        if (mapErr) throw mapErr;
        if (cancelled) return;

        const remoteAgencyNames = (agencyRows || []).map(r => r.name);
        const remoteMap = {};
        (mapRows || []).forEach(row => { remoteMap[row.account_id] = row.agency_name; });

        setAgencies(remoteAgencyNames);
        setAccountAgencies(remoteMap);

        if (remoteAgencyNames.length > 0) {
          persistLocalAgencies(remoteAgencyNames);
        }
        if (mapRows?.length > 0) {
          persistLocalAccountAgencies(remoteMap);
        }

        useSupabaseRef.current = true;
      } catch (err) {
        console.warn('[Agency] Supabase indisponível, usando localStorage:', err?.message);
        useSupabaseRef.current = false;
      }
    }

    hydrate();
    return () => { cancelled = true; };
  }, []);

  const addAgency = useCallback(async (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;

    setAgencies(prev => {
      if (prev.includes(trimmed)) return prev;
      const updated = [...prev, trimmed];
      persistLocalAgencies(updated);
      return updated;
    });

    if (useSupabaseRef.current) {
      const { error } = await supabase
        .from('agencies')
        .upsert({ name: trimmed }, { onConflict: 'name', ignoreDuplicates: true });
      if (error) console.warn('[Agency] Falha ao salvar agência no Supabase:', error.message);
    }
  }, []);

  const removeAgency = useCallback(async (name) => {
    setAgencies(prev => {
      const updated = prev.filter(a => a !== name);
      persistLocalAgencies(updated);
      return updated;
    });
    setAccountAgencies(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(id => {
        if (updated[id] === name) delete updated[id];
      });
      persistLocalAccountAgencies(updated);
      return updated;
    });

    if (useSupabaseRef.current) {
      const [{ error: agencyErr }, { error: mapErr }] = await Promise.all([
        supabase.from('agencies').delete().eq('name', name),
        supabase.from('account_agencies').delete().eq('agency_name', name),
      ]);
      if (agencyErr) console.warn('[Agency] Falha ao remover agência:', agencyErr.message);
      if (mapErr) console.warn('[Agency] Falha ao limpar vínculos:', mapErr.message);
    }
  }, []);

  const setAccountAgency = useCallback(async (accountId, agencyName) => {
    if (!accountId) return;

    setAccountAgencies(prev => {
      const updated = { ...prev };
      if (!agencyName) {
        delete updated[accountId];
      } else {
        updated[accountId] = agencyName;
      }
      persistLocalAccountAgencies(updated);
      return updated;
    });

    if (useSupabaseRef.current) {
      if (!agencyName) {
        const { error } = await supabase.from('account_agencies').delete().eq('account_id', accountId);
        if (error) console.warn('[Agency] Falha ao remover vínculo:', error.message);
      } else {
        const { error } = await supabase
          .from('account_agencies')
          .upsert(
            { account_id: accountId, agency_name: agencyName, updated_at: new Date().toISOString() },
            { onConflict: 'account_id' }
          );
        if (error) console.warn('[Agency] Falha ao salvar vínculo:', error.message);
      }
    }
  }, []);

  const getAccountAgency = useCallback((accountId) => {
    return accountAgencies[accountId] || '';
  }, [accountAgencies]);

  const value = useMemo(() => ({
    agencies,
    accountAgencies,
    addAgency,
    removeAgency,
    setAccountAgency,
    getAccountAgency,
  }), [agencies, accountAgencies, addAgency, removeAgency, setAccountAgency, getAccountAgency]);

  return (
    <AgencyContext.Provider value={value}>
      {children}
    </AgencyContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAgency() {
  const ctx = useContext(AgencyContext);
  if (!ctx) throw new Error('useAgency must be used within AgencyProvider');
  return ctx;
}
