import { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdAccounts,
  fetchAccountInsights,
  fetchAccountDailyInsights,
  fetchCampaignsWithInsights,
} from '../services/metaApi';
import { calculateMetaBalance } from '../shared/utils/metaBalance';

const MetaAdsContext = createContext();

export function MetaAdsProvider({ children }) {
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [hasToken, setHasToken] = useState(
    () => !!localStorage.getItem('meta_provider_token') || true // Assume true inicialmente, proxy resolve
  );

  // Escutar mudanças no token (login oauth)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'meta_provider_token') {
        setHasToken(!!e.newValue);
        queryClient.invalidateQueries({ queryKey: ['meta'] });
      }
    };
    const handleTokenUpdate = () => {
      setHasToken(true);
      queryClient.invalidateQueries({ queryKey: ['meta'] });
    };
    const handleAccountToggle = () => {
      queryClient.invalidateQueries({ queryKey: ['meta', 'adAccounts'] });
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('meta-token-updated', handleTokenUpdate);
    window.addEventListener('meta-accounts-toggled', handleAccountToggle);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('meta-token-updated', handleTokenUpdate);
      window.removeEventListener('meta-accounts-toggled', handleAccountToggle);
    };
  }, [queryClient]);

  // 1. Buscar contas de anúncios
  const {
    data: rawAccounts = [],
    isLoading: loadingAccounts,
    error: accountsError,
  } = useQuery({
    queryKey: ['meta', 'adAccounts'],
    queryFn: fetchAdAccounts,
    enabled: hasToken,
    staleTime: 5 * 60 * 1000,
  });

  const activeRawAccounts = useMemo(() => {
    if (!rawAccounts.length) return [];
    let disabledAccounts = [];
    try {
      disabledAccounts = JSON.parse(localStorage.getItem('disabled_ad_accounts')) || [];
    } catch {
      // ignora payload inválido em localStorage
    }
    if (disabledAccounts.length > 0 || localStorage.getItem('disabled_ad_accounts') !== null) {
      return rawAccounts.filter(a => !disabledAccounts.includes(a.id));
    }
    return rawAccounts.filter(a => a.account_status === 1);
  }, [rawAccounts]);

  // 2. Criar queries para cada conta
  const accountQueries = useQueries({
    queries: activeRawAccounts.map(account => ({
      queryKey: ['meta', 'accountData', account.id, selectedPeriod],
      queryFn: async () => {
        const actId = account.id;
        const [insights, dailyInsights, accountCampaigns, monthInsights] = await Promise.all([
          fetchAccountInsights(actId, selectedPeriod),
          fetchAccountDailyInsights(actId, selectedPeriod),
          fetchCampaignsWithInsights(actId, selectedPeriod),
          fetchAccountInsights(actId, 'month'),
        ]);

        return { account, insights, dailyInsights, accountCampaigns, monthInsights };
      },
      enabled: hasToken,
      staleTime: 2 * 60 * 1000, // Dados expiram em 2 min
    })),
  });

  // 3. Processar resultados (Agregação não bloqueante - exibe o que já carregou)
  const { accounts, balances, campaigns } = useMemo(() => {
    const getMessages = (actionsArray) => {
      if (!actionsArray) return 0;
      const msgAction = actionsArray.find(a =>
        a.action_type === 'onsite_conversion.messaging_conversation_started_7d'
      );
      return msgAction ? parseInt(msgAction.value, 10) : 0;
    };

    const accs = [];
    const bals = [];
    let camps = [];

    accountQueries.forEach(query => {
      if (!query.data) return; // Se não carregou ainda, pula

      const { account, insights, dailyInsights, accountCampaigns, monthInsights } = query.data;
      const actId = account.id;

      const formattedCampaigns = [];
      if (accountCampaigns) {
        accountCampaigns.forEach(camp => {
          const campInsights = camp.insights?.data?.[0];
          formattedCampaigns.push({
            id: camp.id,
            platform: 'meta',
            accountId: actId,
            name: camp.name,
            status: camp.status.toLowerCase(),
            objective: camp.objective,
            dailyBudget: parseFloat(camp.daily_budget || 0) / 100,
            adsets: camp.adsets?.data?.map(a => ({
              status: a.status?.toLowerCase() || '',
              dailyBudget: parseFloat(a.daily_budget || 0) / 100
            })) || [],
            metrics: {
              spend: parseFloat(campInsights?.spend || 0),
              impressions: parseInt(campInsights?.impressions || 0, 10),
              cpc: parseFloat(campInsights?.cpc || 0),
              cpm: parseFloat(campInsights?.cpm || 0),
              ctr: parseFloat(campInsights?.ctr || 0),
              reach: parseInt(campInsights?.reach || 0, 10),
              frequency: parseFloat(campInsights?.frequency || 0),
              messages: getMessages(campInsights?.actions),
              costPerMessage: getMessages(campInsights?.actions) ? parseFloat(campInsights?.spend || 0) / getMessages(campInsights?.actions) : 0,
              roas: parseFloat(campInsights?.purchase_roas?.[0]?.value || 0)
            }
          });
        });
      }

      const formattedAccount = {
        id: actId,
        platform: 'meta',
        clientId: `client_${actId}`,
        clientName: account.name,
        accountId: account.account_id,
        status: account.account_status === 1 ? 'active' : 'paused',
        niche: 'Geral',
        monthlyBudget: 0,
        metrics: {
          spend: parseFloat(insights?.spend || 0),
          impressions: parseInt(insights?.impressions || 0, 10),
          cpm: parseFloat(insights?.cpm || 0),
          linkClicks: parseInt(insights?.inline_link_clicks || 0, 10),
          cpc: parseFloat(insights?.cpc || 0),
          messagingConversationsStarted: getMessages(insights?.actions),
          costPerMessage: getMessages(insights?.actions) ? parseFloat(insights?.spend || 0) / getMessages(insights?.actions) : 0,
          ctr: parseFloat(insights?.ctr || 0),
          reach: parseInt(insights?.reach || 0, 10),
          frequency: parseFloat(insights?.frequency || 0)
        },
        dailyMetrics: dailyInsights.map(d => ({
          date: d.date_start,
          spend: parseFloat(d.spend || 0),
          messages: getMessages(d.actions),
          impressions: parseInt(d.impressions || 0, 10)
        }))
      };

      const {
        rawBillingBalance, spendCap, amountSpent, amountDue,
        currentBalance, hasReliableBalance, balanceSource, isPrepayAccount,
      } = calculateMetaBalance(account);

      const todayMetric = dailyInsights.length > 0 ? dailyInsights[dailyInsights.length - 1] : null;
      const spentToday = todayMetric ? parseFloat(todayMetric.spend || 0) : 0;
      const spentThisMonth = monthInsights ? parseFloat(monthInsights.spend || 0) : 0;
      const daysToAverage = Math.min(dailyInsights.length, 7);
      const sum7d = dailyInsights.slice(-daysToAverage).reduce((sum, day) => sum + parseFloat(day.spend || 0), 0);
      const avgDailySpend7d = daysToAverage > 0 ? sum7d / daysToAverage : 0;
      const estimatedDaysRemaining = hasReliableBalance && avgDailySpend7d > 0
        ? Math.max(0, currentBalance / avgDailySpend7d) : 0;

      const formattedBalance = {
        platform: 'meta',
        accountId: actId,
        clientName: account.name,
        currentBalance,
        creditLimit: spendCap > 0 ? spendCap : 0,
        amountSpent,
        rawBillingBalance,
        amountDue,
        spentToday,
        spentThisMonth,
        avgDailySpend7d,
        estimatedDaysRemaining,
        hasReliableBalance,
        balanceSource,
        isPrepayAccount,
      };

      accs.push(formattedAccount);
      bals.push(formattedBalance);
      camps = camps.concat(formattedCampaigns);
    });

    // Manter a ordem original
    const accountOrder = activeRawAccounts.map(a => a.id);
    accs.sort((a, b) => accountOrder.indexOf(a.id) - accountOrder.indexOf(b.id));
    bals.sort((a, b) => accountOrder.indexOf(a.accountId) - accountOrder.indexOf(b.accountId));

    return { accounts: accs, balances: bals, campaigns: camps };
  }, [accountQueries, activeRawAccounts]);

  const loading = !hasToken ? false : loadingAccounts || accountQueries.some(q => q.isLoading);
  const error = !hasToken ? 'Nenhum token Meta encontrado. Conecte sua conta em Configurações.' : 
                accountsError?.message || accountQueries.find(q => q.error)?.error?.message || null;

  const activeAccounts = useMemo(() => accounts.filter(a => a.status === 'active'), [accounts]);

  const todayTotals = useMemo(() => {
    return activeAccounts.reduce((acc, account) => {
      const todayMetric = account.dailyMetrics?.at(-1);
      return {
        spend: acc.spend + (todayMetric?.spend || 0),
        messages: acc.messages + (todayMetric?.messages || 0),
        impressions: acc.impressions + (todayMetric?.impressions || 0)
      };
    }, { spend: 0, messages: 0, impressions: 0 });
  }, [activeAccounts]);

  const refreshData = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['meta'] });
  }, [queryClient]);

  const value = useMemo(() => ({
    accounts,
    activeAccounts,
    balances,
    campaigns,
    selectedPeriod,
    setSelectedPeriod,
    todayTotals,
    loading,
    error,
    refreshData,
  }), [
    accounts,
    activeAccounts,
    balances,
    campaigns,
    selectedPeriod,
    todayTotals,
    loading,
    error,
    refreshData,
  ]);

  return <MetaAdsContext.Provider value={value}>{children}</MetaAdsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMetaAds() {
  const ctx = useContext(MetaAdsContext);
  if (!ctx) throw new Error('useMetaAds must be used within MetaAdsProvider');
  return ctx;
}
