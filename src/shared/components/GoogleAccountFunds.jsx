import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { formatGoogleCustomerId, googleSpendingQuery } from '../../services/googleAdsApi';
import { GOOGLE_MANUAL_BALANCES_KEY, applyManualGoogleBalance } from '../utils/googleBalance';
import { useStoredMap } from '../utils/useStoredMap';
import { formatCurrency } from '../utils/format';
import GoogleBalanceEditor from './GoogleBalanceEditor';

export default function GoogleAccountFunds({ account }) {
  const manualBalances = useStoredMap(GOOGLE_MANUAL_BALANCES_KEY);
  const manual = manualBalances[account.accountId];
  const query = useQuery(googleSpendingQuery(account, manual));
  const data = applyManualGoogleBalance(query.data, manual);
  const source = data?.balanceSource;
  const shown = source === 'account_budget' || source === 'manual' ? data.currentBalance : null;
  const color = shown === null ? '' : shown < 50 ? 'text-danger' : shown < 150 ? 'text-warning' : 'text-success';

  return <div className="flex flex-col items-end gap-1 text-xs leading-tight">
    {shown !== null && <div
      title={source === 'manual'
        ? `${formatCurrency(data.informedBalance, account.currency)} informado − ${formatCurrency(data.spentSinceBalance, account.currency)} gastos depois`
        : 'Limite aprovado do orçamento da conta menos o valor já veiculado.'}
      className="flex flex-col items-end">
      <span className={`font-medium ${color}`}>{formatCurrency(shown, account.currency)}</span>
      <span className="text-[10px] text-text-secondary">{source === 'manual' ? 'Saldo (informado − gasto)' : 'Restante do orçamento da conta'}</span>
    </div>}
    {query.isLoading && <span className="text-text-secondary">Consultando…</span>}
    {query.isError && <span className="text-warning" title={query.error.message}>Falha ao consultar gasto</span>}
    {source !== 'account_budget' && !query.isLoading && <GoogleBalanceEditor accountId={account.accountId} manual={manual} compact />}
    <a href="https://ads.google.com/aw/billing/summary" target="_blank" rel="noopener noreferrer"
      onClick={event => event.stopPropagation()}
      title={`No Google Ads, selecione a conta ${formatGoogleCustomerId(account.accountId)} e confira o faturamento.`}
      aria-label={`Verificar fundos de ${account.clientName} no Google Ads`}
      className="inline-flex items-center gap-1 text-primary-light/80 hover:underline text-[10px]">
      Ver no Google <ExternalLink size={10} />
    </a>
  </div>;
}
