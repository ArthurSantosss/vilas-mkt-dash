import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { fetchGoogleAccountSpending, formatGoogleCustomerId } from '../../services/googleAdsApi';
import { formatCurrency } from '../utils/format';

export default function GoogleAccountFunds({ account }) {
  const query = useQuery({
    queryKey: ['googleAds', 'spending', account.accountId, account.connectionId],
    queryFn: () => fetchGoogleAccountSpending(account.accountId, account.connectionId),
    staleTime: 2 * 60 * 1000,
  });
  const budgetRemaining = query.data?.balanceSource === 'account_budget' ? query.data.currentBalance : null;

  return <div className="flex flex-col items-end gap-1 text-xs leading-tight">
    {budgetRemaining !== null && <div title="Limite aprovado do orçamento da conta menos o valor já veiculado." className="flex flex-col items-end">
      <span className="font-medium text-text-primary">{formatCurrency(budgetRemaining, account.currency)}</span>
      <span className="text-[10px] text-text-secondary">Restante do orçamento da conta</span>
    </div>}
    {query.isLoading && <span className="text-text-secondary">Consultando…</span>}
    {query.isError && <span className="text-warning" title={query.error.message}>Falha ao consultar gasto mensal</span>}
    {budgetRemaining === null && !query.isLoading && <span className="text-[10px] text-text-secondary">Fundos pré-pagos: indisponíveis via API</span>}
    <a href="https://ads.google.com/aw/billing/summary" target="_blank" rel="noopener noreferrer"
      onClick={event => event.stopPropagation()}
      title={`No Google Ads, selecione a conta ${formatGoogleCustomerId(account.accountId)} e confira o faturamento.`}
      aria-label={`Verificar fundos de ${account.clientName} no Google Ads`}
      className="inline-flex items-center gap-1 text-primary-light hover:underline">
      Verificar no Google <ExternalLink size={11} />
    </a>
  </div>;
}
