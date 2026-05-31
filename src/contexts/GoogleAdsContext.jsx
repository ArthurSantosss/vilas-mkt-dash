import { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  fetchGoogleAdsAccountOverview,
  loadStoredGoogleAdsConnection,
  syncGoogleAdsAccounts,
  GOOGLE_ADS_STORAGE_KEYS,
} from '../services/googleAdsApi';

const GoogleAdsContext = createContext();

function normalizeGoogleAccount(rawAccount, overview) {
  const campaigns = overview.campaigns || [];
  const totals = overview.totals || {};
  const dailyMetrics = overview.dailyMetrics || [];
  const hasActiveCampaign = campaigns.some((campaign) => campaign.status === 'active');

  return {
    id: rawAccount.id || rawAccount.accountId,
    platform: 'google_ads',
    clientId: `google_${rawAccount.accountId}`,
    clientName: rawAccount.name,
    accountId: rawAccount.accountId,
    currency: rawAccount.currency || 'BRL',
    loginCustomerId: rawAccount.loginCustomerId || null,
    source: rawAccount.source || 'direct',
    status: hasActiveCampaign ? 'active' : 'paused',
    metrics: {
      spend: totals.spend || 0,
      impressions: totals.impressions || 0,
      cpm: totals.cpm || 0,
      linkClicks: totals.clicks || 0,
      clicks: totals.clicks || 0,
      cpc: totals.cpc || 0,
      ctr: totals.ctr || 0,
      reach: 0,
      frequency: 0,
      messagingConversationsStarted: totals.conversions || 0,
      costPerMessage: totals.costPerConversion || 0,
      conversions: totals.conversions || 0,
      conversionsValue: totals.conversionsValue || 0,
      costPerConversion: totals.costPerConversion || 0,
    },
    dailyMetrics: dailyMetrics.map((day) => ({
      date: day.date,
      spend: day.spend || 0,
      messages: day.conversions || 0,
      conversions: day.conversions || 0,
      impressions: day.impressions || 0,
      clicks: day.clicks || 0,
      costPerConversion: day.costPerConversion || 0,
    })),
  };
}

function normalizeGoogleCampaigns(rawAccount, overview) {
  return (overview.campaigns || []).map((campaign) => ({
    ...campaign,
    platform: 'google_ads',
    accountId: rawAccount.accountId,
    metrics: {
      ...campaign.metrics,
      messages: campaign.metrics?.conversions || 0,
      costPerMessage: campaign.metrics?.costPerConversion || 0,
      reach: 0,
      frequency: 0,
      roas: 0,
    },
  }));
}

export function GoogleAdsProvider({ children }) {
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [hasConnection, setHasConnection] = useState(() => !!loadStoredGoogleAdsConnection());

  useEffect(() => {
    const handleStorageChange = (event) => {
      if (
        event.key === GOOGLE_ADS_STORAGE_KEYS.CONNECTION ||
        event.key === GOOGLE_ADS_STORAGE_KEYS.ACCOUNTS
      ) {
        setHasConnection(Boolean(loadStoredGoogleAdsConnection()));
        queryClient.invalidateQueries({ queryKey: ['googleAds'] });
      }
    };

    const handleGoogleAdsUpdate = () => {
      setHasConnection(Boolean(loadStoredGoogleAdsConnection()));
      queryClient.invalidateQueries({ queryKey: ['googleAds'] });
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('google-ads-updated', handleGoogleAdsUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('google-ads-updated', handleGoogleAdsUpdate);
    };
  }, [queryClient]);

  const {
    data: rawAccounts = [],
    isLoading: loadingAccounts,
    error: accountsError,
  } = useQuery({
    queryKey: ['googleAds', 'accounts'],
    queryFn: syncGoogleAdsAccounts,
    enabled: hasConnection,
    staleTime: 5 * 60 * 1000,
  });

  const accountQueries = useQueries({
    queries: rawAccounts.map((account) => ({
      queryKey: ['googleAds', 'accountData', account.accountId, account.loginCustomerId || 'direct', selectedPeriod],
      queryFn: () => fetchGoogleAdsAccountOverview(account.accountId, selectedPeriod, account.loginCustomerId),
      enabled: hasConnection,
      staleTime: 2 * 60 * 1000,
    })),
  });

  const { accounts, campaigns } = useMemo(() => {
    const nextAccounts = [];
    let nextCampaigns = [];

    accountQueries.forEach((query, index) => {
      if (!query.data) return;

      const rawAccount = rawAccounts[index];
      if (!rawAccount) return;

      nextAccounts.push(normalizeGoogleAccount(rawAccount, query.data));
      nextCampaigns = nextCampaigns.concat(normalizeGoogleCampaigns(rawAccount, query.data));
    });

    const order = rawAccounts.map((account) => account.accountId);
    nextAccounts.sort((left, right) => order.indexOf(left.accountId) - order.indexOf(right.accountId));

    return { accounts: nextAccounts, campaigns: nextCampaigns };
  }, [accountQueries, rawAccounts]);

  const loading = hasConnection ? loadingAccounts || accountQueries.some((query) => query.isLoading) : false;
  const error = !hasConnection
    ? null
    : accountsError?.message || accountQueries.find((query) => query.error)?.error?.message || null;

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === 'active'),
    [accounts]
  );

  const todayTotals = useMemo(() => {
    return activeAccounts.reduce((acc, account) => {
      const todayMetric = account.dailyMetrics?.at(-1);
      return {
        spend: acc.spend + (todayMetric?.spend || 0),
        messages: acc.messages + (todayMetric?.messages || 0),
        impressions: acc.impressions + (todayMetric?.impressions || 0),
      };
    }, { spend: 0, messages: 0, impressions: 0 });
  }, [activeAccounts]);

  const refreshData = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['googleAds'] });
  }, [queryClient]);

  const value = useMemo(() => ({
    accounts,
    activeAccounts,
    campaigns,
    selectedPeriod,
    setSelectedPeriod,
    todayTotals,
    loading,
    error,
    hasConnection,
    refreshData,
  }), [
    accounts,
    activeAccounts,
    campaigns,
    selectedPeriod,
    todayTotals,
    loading,
    error,
    hasConnection,
    refreshData,
  ]);

  return <GoogleAdsContext.Provider value={value}>{children}</GoogleAdsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGoogleAds() {
  const context = useContext(GoogleAdsContext);
  if (!context) throw new Error('useGoogleAds must be used within GoogleAdsProvider');
  return context;
}
