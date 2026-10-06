import { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import { PRESETS } from '../shared/utils/dateUtils';

const STORAGE_KEY = 'vilas_analysis_selected_period';
const PERIOD_CHANGE_EVENT = 'vilas-analysis-period-changed';

const VALID_PRESET_IDS = new Set(PRESETS.map(p => p.id));

function isValidPeriod(period) {
  if (typeof period === 'string') {
    return VALID_PRESET_IDS.has(period);
  }
  if (
    period &&
    typeof period === 'object' &&
    period.type === 'custom' &&
    typeof period.startDate === 'string' &&
    typeof period.endDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(period.startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(period.endDate)
  ) {
    return true;
  }
  return false;
}

function getStoredPeriod() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return 'today';
    const parsed = JSON.parse(saved);
    if (isValidPeriod(parsed)) return parsed;
    if (typeof parsed === 'string' && VALID_PRESET_IDS.has(parsed)) return parsed;
    return 'today';
  } catch {
    return 'today';
  }
}

const AnalysisPeriodContext = createContext(null);

export function AnalysisPeriodProvider({ children }) {
  const [selectedPeriod, setSelectedPeriodState] = useState(getStoredPeriod);

  const setSelectedPeriod = useCallback((next) => {
    setSelectedPeriodState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
        window.dispatchEvent(new CustomEvent(PERIOD_CHANGE_EVENT, { detail: resolved }));
      } catch (err) {
        console.warn('Erro ao salvar selectedPeriod no localStorage:', err);
      }
      return resolved;
    });
  }, []);

  // Sincronizar em tempo real quando alterado em outra aba do navegador
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (isValidPeriod(parsed)) {
            setSelectedPeriodState(parsed);
          }
        } catch {
          // ignore
        }
      }
    };

    const handleCustomChange = (event) => {
      if (event.detail && isValidPeriod(event.detail)) {
        setSelectedPeriodState(event.detail);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(PERIOD_CHANGE_EVENT, handleCustomChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(PERIOD_CHANGE_EVENT, handleCustomChange);
    };
  }, []);

  const value = useMemo(() => ({ selectedPeriod, setSelectedPeriod }), [selectedPeriod, setSelectedPeriod]);

  return <AnalysisPeriodContext.Provider value={value}>{children}</AnalysisPeriodContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAnalysisPeriod() {
  const context = useContext(AnalysisPeriodContext);
  if (!context) throw new Error('useAnalysisPeriod must be used within AnalysisPeriodProvider');
  return context;
}

