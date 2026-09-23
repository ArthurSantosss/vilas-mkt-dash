import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useGoogleAds } from '../../contexts/GoogleAdsContext';
import { fetchGoogleAccountSpending } from '../../services/googleAdsApi';

/**
 * Gastos por conta Google no formato que o BalancesView espera.
 * `enabled` evita consultar a API quando a aba Saldos está na plataforma Meta.
 */
export function useGoogleBalances(enabled = true) {
  const { rawAccounts, hasConnection, loading: accountsLoading, error: connectionError } = useGoogleAds();
  const queryClient = useQueryClient();
  const queries = useQueries({ queries: rawAccounts.map(account => ({
    queryKey: ['googleAds', 'spending', account.accountId, account.connectionId],
    queryFn: () => fetchGoogleAccountSpending(account.accountId, account.connectionId),
    enabled: enabled && hasConnection,
    staleTime: 2 * 60 * 1000,
  })) });

  const balances = queries.flatMap((query, index) => query.data ? [{ ...query.data,
    accountId: rawAccounts[index].accountId, clientName: rawAccounts[index].name,
  }] : []);
  const failures = queries.flatMap((query, index) => query.error ? [`${rawAccounts[index].name}: ${query.error.message}`] : []);

  return {
    balances,
    loading: accountsLoading || queries.some(query => query.isLoading),
    error: failures.join(' · ') || connectionError,
    refreshData: () => queryClient.invalidateQueries({ queryKey: ['googleAds'] }),
  };
}
