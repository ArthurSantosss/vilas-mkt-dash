import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { fetchGoogleAccountSpending, formatGoogleCustomerId } from '../../services/googleAdsApi';
import { formatCurrency } from '../utils/format';

export default function GoogleAccountFunds({ account, monthlyGoal }) {
  const goal = Number(monthlyGoal);
  const query = useQuery({
    queryKey: ['googleAds', 'spending', account.accountId, account.connectionId],
    queryFn: () => fetchGoogleAccountSpending(account.accountId, account.connectionId),
    enabled: goal > 0,
    staleTime: 2 * 60 * 1000,
  });
  const spent = query.data?.spentThisMonth;
  const remaining = goal > 0 && !query.isError && Number.isFinite(spent)
    ? Math.max(0, goal - spent) : null;
  const color = remaining < 50 ? 'text-danger' : remaining < 150 ? 'text-warning' : 'text-success';

  return <div className="flex flex-col items-end gap-1 text-xs leading-tight">
    {remaining !== null && <div title="Meta mensal menos gasto do mês. Não representa fundos depositados na conta." className="flex flex-col items-end">
      <span className={`font-medium ${color}`}>{formatCurrency(remaining, account.currency)}</span>
      <span className="text-[10px] text-text-secondary">Restante da meta mensal</span>
    </div>}
    {goal > 0 && query.isLoading && <span className="text-text-secondary">Consultando meta…</span>}
    {goal > 0 && query.isError && <span className="text-warning" title={query.error.message}>Falha ao consultar gasto mensal</span>}
    <span className="text-[10px] text-text-secondary">Fundos: indisponíveis via API</span>
    <a href="https://ads.google.com/aw/billing/summary" target="_blank" rel="noopener noreferrer"
      onClick={event => event.stopPropagation()}
      title={`No Google Ads, selecione a conta ${formatGoogleCustomerId(account.accountId)} e confira o faturamento.`}
      aria-label={`Verificar fundos de ${account.clientName} no Google Ads`}
      className="inline-flex items-center gap-1 text-primary-light hover:underline">
      Verificar no Google <ExternalLink size={11} />
    </a>
  </div>;
}
