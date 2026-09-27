import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useMetaAds } from './MetaAdsContext';
import { useAgency } from './AgencyContext';
import { fetchAccountDailyInsights } from '../services/metaApi';
import { readSavedPaymentMethods } from '../shared/utils/paymentMethod';
import { generateAutomaticAlerts } from '../shared/utils/automaticAlerts';
import { AUTO_ALERTS_STORAGE_KEY, normalizeAutoAlertThresholds } from '../shared/constants/autoAlerts';

const AlertsContext = createContext();

function readThresholds() {
  try {
    return normalizeAutoAlertThresholds(JSON.parse(localStorage.getItem(AUTO_ALERTS_STORAGE_KEY)));
  } catch {
    return normalizeAutoAlertThresholds();
  }
}

export function AlertsProvider({ children }) {
  const { accounts, balances, campaigns } = useMetaAds();
  const { accountAgencies } = useAgency();
  const [readIds, setReadIds] = useState(new Set());
  const [paymentMethods, setPaymentMethods] = useState(readSavedPaymentMethods);
  const [thresholds, setThresholds] = useState(readThresholds);

  // Alertas de hoje independem do período escolhido para analisar desempenho.
  const dailyQueries = useQueries({
    queries: accounts.map(account => ({
      queryKey: ['meta', 'alertToday', account.id],
      queryFn: () => fetchAccountDailyInsights(account.id, 'today'),
      enabled: account.status === 'active',
      staleTime: 60_000,
    })),
  });
  const todayAccounts = accounts.map((account, index) => ({
    ...account,
    dailyMetrics: (dailyQueries[index]?.data || []).map(day => ({
      date: day.date_start,
      spend: Number(day.spend || 0),
      messages: Number(day.actions?.find(action => action.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0),
    })),
  }));

  useEffect(() => {
    const sync = () => {
      setPaymentMethods(readSavedPaymentMethods());
      setThresholds(readThresholds());
    };
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('local-storage-map-updated', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('local-storage-map-updated', sync);
    };
  }, []);

  const automaticAlerts = generateAutomaticAlerts({ accounts: todayAccounts, balances, accountAgencies, paymentMethodsMap: paymentMethods, thresholds })
    .map(alert => ({ ...alert, category: alert.type, type: alert.severity === 'danger' ? 'critical' : alert.severity, platform: 'meta', href: ['payment_error', 'balance_low'].includes(alert.type) ? '/saldos' : '/meta-ads' }));
  const campaignAlerts = campaigns.flatMap(campaign => {
    const common = { platform: 'meta', accountId: campaign.accountId, accountName: campaign.name, agency: accountAgencies[campaign.accountId], type: 'warning', category: 'delivery', href: '/meta-ads', detail: 'No período selecionado' };
    const alerts = [];
    if (campaign.status === 'active' && campaign.metrics?.spend === 0) {
      alerts.push({ ...common, id: `delivery-${campaign.id}`, message: 'Campanha ativa sem gasto. Verifique saldo, orçamento ou aprovação.' });
    }
    if (campaign.metrics?.frequency > 3 && campaign.metrics?.spend > 0) {
      alerts.push({ ...common, id: `frequency-${campaign.id}`, message: `Frequência alta (${campaign.metrics.frequency.toFixed(1)}). Revise criativos e audiência.` });
    }
    return alerts;
  });
  const priority = { critical: 0, warning: 1, info: 2 };
  const generatedAlerts = [...automaticAlerts, ...campaignAlerts].sort((a, b) => priority[a.type] - priority[b.type]);
  // A leitura pertence à condição e à gravidade, nunca à posição na lista.
  const alerts = generatedAlerts.map(alert => ({ ...alert, readKey: `${alert.id}:${alert.type}`, read: readIds.has(`${alert.id}:${alert.type}`) }));
  const unreadCount = alerts.filter(alert => !alert.read).length;
  const criticalCount = alerts.filter(alert => alert.type === 'critical' && !alert.read).length;
  const markAsRead = useCallback(readKey => setReadIds(previous => new Set([...previous, readKey])), []);
  const markAllAsRead = () => setReadIds(new Set(alerts.map(alert => alert.readKey)));
  const loading = dailyQueries.some(query => query.isLoading);
  const error = dailyQueries.some(query => query.isError) ? 'Alguns avisos de hoje não puderam ser atualizados.' : null;
  const updateThreshold = (key, value) => {
    if (!Number.isFinite(value) || value < 0) return;
    const next = normalizeAutoAlertThresholds({ ...thresholds, [key]: value });
    localStorage.setItem(AUTO_ALERTS_STORAGE_KEY, JSON.stringify(next));
    setThresholds(next);
    window.dispatchEvent(new CustomEvent('local-storage-map-updated', { detail: { key: AUTO_ALERTS_STORAGE_KEY, value: next } }));
  };
  const value = { updateThreshold, alerts, unreadCount, criticalCount, markAsRead, markAllAsRead, thresholds, loading, error };
  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAlerts() {
  const ctx = useContext(AlertsContext);
  if (!ctx) throw new Error('useAlerts must be used within AlertsProvider');
  return ctx;
}
