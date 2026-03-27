import { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEYS = {
  AGENCIES: 'agencies_list',
  ACCOUNT_AGENCIES: 'account_agencies',
};

const AgencyContext = createContext();

export function AgencyProvider({ children }) {
  const [agencies, setAgencies] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.AGENCIES)) || []; } catch { return []; }
  });

  const [accountAgencies, setAccountAgencies] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ACCOUNT_AGENCIES)) || {}; } catch { return {}; }
  });

  const addAgency = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAgencies(prev => {
      if (prev.includes(trimmed)) return prev;
      const updated = [...prev, trimmed];
      localStorage.setItem(STORAGE_KEYS.AGENCIES, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeAgency = useCallback((name) => {
    setAgencies(prev => {
      const updated = prev.filter(a => a !== name);
      localStorage.setItem(STORAGE_KEYS.AGENCIES, JSON.stringify(updated));
      return updated;
    });
    setAccountAgencies(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(id => {
        if (updated[id] === name) delete updated[id];
      });
      localStorage.setItem(STORAGE_KEYS.ACCOUNT_AGENCIES, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const setAccountAgency = useCallback((accountId, agencyName) => {
    setAccountAgencies(prev => {
      const updated = { ...prev };
      if (!agencyName) {
        delete updated[accountId];
      } else {
        updated[accountId] = agencyName;
      }
      localStorage.setItem(STORAGE_KEYS.ACCOUNT_AGENCIES, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const getAccountAgency = useCallback((accountId) => {
    return accountAgencies[accountId] || '';
  }, [accountAgencies]);

  return (
    <AgencyContext.Provider value={{ agencies, accountAgencies, addAgency, removeAgency, setAccountAgency, getAccountAgency }}>
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
