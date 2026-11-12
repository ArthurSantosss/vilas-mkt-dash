import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useGoogleAds } from '../../contexts/GoogleAdsContext';
import { googleSpendingQuery } from '../../services/googleAdsApi';
import { GOOGLE_MANUAL_BALANCES_KEY, applyManualGoogleBalance } from '../../shared/utils/googleBalance';
import { useStoredMap } from '../../shared/utils/useStoredMap';

/**
 * Gastos e saldo por conta Google no formato que o BalancesView espera.
 * O saldo vem do orçamento de conta aprovado (API) ou do saldo informado pelo usuário,
 * descontando o gasto real feito depois da data informada.
 * `enabled` evita consultar a API quando a tela não precisa dos dados.
 */
export function useGoogleBalances(enabled = true) {
  const { rawAccounts, hasConnection, loading: accountsLoading, error: connectionError } = useGoogleAds();
  const manualBalances = useStoredMap(GOOGLE_MANUAL_BALANCES_KEY);
  const queryClient = useQueryClient();
  const queries = useQueries({ queries: rawAccounts.map(account =>
    googleSpendingQuery(account, manualBalances[account.accountId], enabled && hasConnection)) });

  const balances = queries.flatMap((query, index) => query.data ? [{
    ...applyManualGoogleBalance(query.data, manualBalances[rawAccounts[index].accountId]),
    accountId: rawAccounts[index].accountId, clientName: rawAccounts[index].name,
  }] : []);
  const failures = queries.flatMap((query, index) => query.error ? [`${rawAccounts[index].name}: ${query.error.message}`] : []);

  return {
    balances,
    loading: enabled && (accountsLoading || queries.some(query => query.isLoading)),
    error: failures.join(' · ') || connectionError,
    refreshData: () => queryClient.invalidateQueries({ queryKey: ['googleAds'] }),
  };
}
