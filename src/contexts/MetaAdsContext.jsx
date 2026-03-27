import { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { fetchAdAccounts, fetchAccountInsights, fetchAccountDailyInsights, fetchCampaignsWithInsights } from '../services/metaApi';

const MetaAdsContext = createContext();

export function MetaAdsProvider({ children }) {
  const [accounts, setAccounts] = useState([]);
  const [balances, setBalances] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadMetaData = useCallback(async () => {
    // Verificar se temos token antes de tentar
    const hasToken = localStorage.getItem('meta_provider_token') || import.meta.env.VITE_META_ACCESS_TOKEN;
    if (!hasToken) {
      setLoading(false);
      setError('Nenhum token Meta encontrado. Conecte sua conta em Configurações.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const rawAccounts = await fetchAdAccounts();

      // Ler contas desativadas no painel de configurações
      let disabledAccounts = [];
      try {
        disabledAccounts = JSON.parse(localStorage.getItem('disabled_ad_accounts')) || [];
      } catch (err) {
        console.warn('Erro ao ler contas desabilitadas:', err);
      }

      // Filtrar contas: usa a seleção do usuário nas Configurações como autoridade
      // Se o usuário tem contas desabilitadas salvas, usa esse filtro
      // Senão, mostra todas as contas ativas (account_status === 1) por padrão
      let activeRawAccounts;
      if (disabledAccounts.length > 0 || localStorage.getItem('disabled_ad_accounts') !== null) {
        // Usuário já configurou quais contas quer ver — respeitar escolha
        activeRawAccounts = rawAccounts.filter(a => !disabledAccounts.includes(a.id));
      } else {
        // Sem configuração — comportamento padrão: só contas ativas
        activeRawAccounts = rawAccounts.filter(a => a.account_status === 1);
      }

      const loadedAccounts = [];
      const loadedBalances = [];
      const loadedCampaigns = [];

      const accountPromises = activeRawAccounts.map(async (account) => {
        const actId = account.id;

        try {
          const [insights, dailyInsights, accountCampaigns] = await Promise.all([
            fetchAccountInsights(actId, selectedPeriod),
            fetchAccountDailyInsights(actId, selectedPeriod),
            fetchCampaignsWithInsights(actId, selectedPeriod)
          ]);

          const getMessages = (actionsArray) => {
            if (!actionsArray) return 0;
            const msgAction = actionsArray.find(a =>
              a.action_type === 'onsite_conversion.messaging_conversation_started_7d'
            );
            return msgAction ? parseInt(msgAction.value, 10) : 0;
          };

          const formattedCampaigns = [];
          if (accountCampaigns) {
            accountCampaigns.forEach(camp => {
              const campInsights = camp.insights?.data?.[0];
              formattedCampaigns.push({
                id: camp.id,
                accountId: actId,
                name: camp.name,
                status: camp.status.toLowerCase(),
                objective: camp.objective,
                dailyBudget: parseFloat(camp.daily_budget || 0) / 100,
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

          // ── Balance calculation ──
          // Meta API fields (all in centavos for BRL):
          //   balance     = billing balance (amount owed for postpaid / remaining for prepaid)
          //   spend_cap   = total spending limit for the account (0 = no limit)
          //   amount_spent = total lifetime spend of the account
          const rawBalance = account.balance ? parseFloat(account.balance) / 100 : 0;
          const spendCap = account.spend_cap ? parseFloat(account.spend_cap) / 100 : 0;
          const amountSpent = account.amount_spent ? parseFloat(account.amount_spent) / 100 : 0;

          const todayMetric = dailyInsights.length > 0 ? dailyInsights[dailyInsights.length - 1] : null;
          const spentToday = todayMetric ? parseFloat(todayMetric.spend || 0) : 0;
          const daysToAverage = Math.min(dailyInsights.length, 7);
          const sum7d = dailyInsights.slice(-daysToAverage).reduce((sum, day) => sum + parseFloat(day.spend || 0), 0);
          const avgDailySpend7d = daysToAverage > 0 ? sum7d / daysToAverage : 0;

          // Remaining balance:
          //   If spend_cap exists → remaining = spend_cap - amount_spent (how much can still be spent)
          //   Otherwise → use raw balance from API (works for prepaid accounts)
          const remaining = spendCap > 0
            ? Math.max(0, spendCap - amountSpent)
            : rawBalance;

          const estimatedDaysRemaining = avgDailySpend7d > 0
            ? Math.max(0, remaining / avgDailySpend7d)
            : 0;

          const formattedBalance = {
            accountId: actId,
            clientName: account.name,
            currentBalance: remaining,
            creditLimit: spendCap > 0 ? spendCap : 0,
            amountSpent,
            rawBillingBalance: rawBalance,
            spentToday,
            avgDailySpend7d,
            estimatedDaysRemaining,
          };

          return { account: formattedAccount, campaigns: formattedCampaigns, balance: formattedBalance };
        } catch (accountError) {
          console.warn(`Erro ao carregar dados da conta ${account.name} (${actId}):`, accountError);
          return null;
        }
      });

      const results = await Promise.allSettled(accountPromises);

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          loadedAccounts.push(result.value.account);
          loadedCampaigns.push(...result.value.campaigns);
          loadedBalances.push(result.value.balance);
        }
      });

      setAccounts(loadedAccounts);
      setCampaigns(loadedCampaigns);
      setBalances(loadedBalances);
      setLoading(false);

    } catch (err) {
      console.error('Erro ao buscar dados do Meta:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [selectedPeriod]);

  // Carregar dados na montagem e quando o período mudar
  useEffect(() => {
    loadMetaData();
  }, [loadMetaData]);

  // Escutar mudanças no token via storage event (quando outra aba/componente salva um novo token)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'meta_provider_token' && e.newValue) {
        loadMetaData();
      }
    };
    // Custom event para mesma aba (storage event só funciona entre abas)
    const handleTokenUpdate = () => {
      console.log('[MetaAdsContext] ⚡ Evento meta-token-updated recebido! Recarregando dados...');
      loadMetaData();
    };
    const handleAccountToggle = () => {
      console.log('[MetaAdsContext] ⚡ Evento meta-accounts-toggled recebido! Recarregando dados...');
      loadMetaData();
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('meta-token-updated', handleTokenUpdate);
    window.addEventListener('meta-accounts-toggled', handleAccountToggle);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('meta-token-updated', handleTokenUpdate);
      window.removeEventListener('meta-accounts-toggled', handleAccountToggle);
    };
  }, [loadMetaData]);

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

  const value = {
    accounts,
    activeAccounts,
    balances,
    campaigns,
    selectedPeriod,
    setSelectedPeriod,
    todayTotals,
    loading,
    error,
    refreshData: loadMetaData,  // Expor para que outros componentes possam forçar refresh
  };

  return <MetaAdsContext.Provider value={value}>{children}</MetaAdsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMetaAds() {
  const ctx = useContext(MetaAdsContext);
  if (!ctx) throw new Error('useMetaAds must be used within MetaAdsProvider');
  return ctx;
}
