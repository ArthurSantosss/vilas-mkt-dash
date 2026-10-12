import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAgency } from './AgencyContext';
import { getStoredMetaToken } from '../services/metaTokenGuard';
import { generateAutomaticAlerts } from '../shared/utils/automaticAlerts';
import { AUTO_ALERTS_STORAGE_KEY, normalizeAutoAlertThresholds } from '../shared/constants/autoAlerts';

const AlertsContext = createContext();
function readThresholds() {
  try { return normalizeAutoAlertThresholds(JSON.parse(localStorage.getItem(AUTO_ALERTS_STORAGE_KEY))); }
  catch { return normalizeAutoAlertThresholds(); }
}
export function AlertsProvider({ children }) {
  const { accountAgencies } = useAgency();
  const [readIds, setReadIds] = useState(new Set());
  const [thresholds, setThresholds] = useState(readThresholds);
  const query = useQuery({
    queryKey: ['briefing'],
    queryFn: async () => {
      const token = getStoredMetaToken();
      const response = await fetch('/api/alerts/briefing', { headers: token ? { 'x-meta-token': token } : {} });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao atualizar avisos.');
      return data;
    },
    staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, retry: 1,
  });
  useEffect(() => {
    const sync = () => setThresholds(readThresholds());
    window.addEventListener('storage', sync);
    window.addEventListener('local-storage-map-updated', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('local-storage-map-updated', sync);
    };
  }, []);
  const data = query.data;
  const generated = data ? generateAutomaticAlerts({ ...data, thresholds, accountAgencies, now: new Date(data.generatedAt) }) : [];
  const alerts = generated.map(alert => {
    const readKey = `${alert.id}:${alert.severity}`;
    return { ...alert, category: alert.type, type: alert.severity === 'danger' ? 'critical' : alert.severity, readKey, read: readIds.has(readKey), href: ['payment_error', 'balance_low'].includes(alert.type) ? '/saldos' : alert.platform === 'google' ? '/google-ads' : '/meta-ads' };
  });
  const markAsRead = useCallback(key => setReadIds(previous => new Set([...previous, key])), []);
  const updateThreshold = (key, value) => {
    if (!Number.isFinite(value) || value < 0) return;
    const next = normalizeAutoAlertThresholds({ ...thresholds, [key]: value });
    localStorage.setItem(AUTO_ALERTS_STORAGE_KEY, JSON.stringify(next));
    setThresholds(next);
    window.dispatchEvent(new CustomEvent('local-storage-map-updated', { detail: { key: AUTO_ALERTS_STORAGE_KEY, value: next } }));
  };
  const error = query.error?.message || (data?.issues?.length ? `${data.issues.length} pendência(s) na coleta: ${data.issues.map(issue => issue.message).join(' • ')}` : null);
  return <AlertsContext.Provider value={{ alerts, thresholds, updateThreshold, monitoredCount: data?.accounts?.length || 0, unreadCount: alerts.filter(a => !a.read).length, criticalCount: alerts.filter(a => a.type === 'critical' && !a.read).length, markAsRead, markAllAsRead: () => setReadIds(new Set(alerts.map(a => a.readKey))), loading: query.isFetching, error }}>{children}</AlertsContext.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useAlerts() {
  const context = useContext(AlertsContext);
  if (!context) throw new Error('useAlerts must be used within AlertsProvider');
  return context;
}
