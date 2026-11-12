import { useState, useMemo, useEffect, useCallback } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { formatCurrency } from '../../shared/utils/format';
import { isCreditCardPaymentMethod, getAccountPaymentMethod } from '../../shared/utils/paymentMethod';
import { billingFrequencyOptions, getNextPaymentDate, getDaysUntil, parseDateInput } from '../../shared/utils/nextPayment';
import { splitBalanceUntil, GOOGLE_MANUAL_BALANCES_KEY } from '../../shared/utils/googleBalance';
import { useStoredMap } from '../../shared/utils/useStoredMap';
import NextPaymentEditor from '../../shared/components/NextPaymentEditor';
import GoogleBalanceEditor from '../../shared/components/GoogleBalanceEditor';
import { GoogleAdsIcon, MetaIcon } from '../../shared/components/PlatformIcons';
import { supabase } from '../../services/supabase';
import { Wallet, AlertTriangle, Clock, CreditCard, ArrowUpDown, RefreshCw, CalendarClock, Repeat, Divide } from 'lucide-react';
import { FILTER_FIELD, FILTER_LABEL, FILTER_CONTROL } from '../../shared/constants/filterStyles';

const sortOptions = [
  { value: 'balance_asc', label: 'Menor saldo primeiro' },
  { value: 'balance_desc', label: 'Maior saldo primeiro' },
  { value: 'name', label: 'Nome (A-Z)' },
  { value: 'days', label: 'Dias restantes' },
  { value: 'spend_desc', label: 'Maior gasto mensal' },
];

const paymentMethodOptions = [
  { value: 'credit_card', label: 'Cartão' },
  { value: 'pix', label: 'Pix' },
  { value: 'boleto', label: 'Boleto' },
];

function formatDateInput(dateObj = new Date()) {
  const localDate = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function buildBalanceSnapshot(balance) {
  return {
    observedAt: new Date().toISOString(),
    observedDate: formatDateInput(),
    currentBalance: roundMoney(balance.currentBalance),
    rawBillingBalance: roundMoney(balance.rawBillingBalance),
    creditLimit: roundMoney(balance.creditLimit),
    amountSpent: roundMoney(balance.amountSpent),
    avgDailySpend7d: roundMoney(balance.avgDailySpend7d),
    hasReliableBalance: balance.hasReliableBalance !== false,
  };
}

function hasSnapshotChanged(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot) return true;
  return (
    previousSnapshot.currentBalance !== nextSnapshot.currentBalance ||
    previousSnapshot.rawBillingBalance !== nextSnapshot.rawBillingBalance ||
    previousSnapshot.creditLimit !== nextSnapshot.creditLimit ||
    previousSnapshot.amountSpent !== nextSnapshot.amountSpent ||
    previousSnapshot.avgDailySpend7d !== nextSnapshot.avgDailySpend7d ||
    previousSnapshot.hasReliableBalance !== nextSnapshot.hasReliableBalance
  );
}

function getDetectionThreshold(previousSnapshot, currentSnapshot) {
  const referenceSpend = Math.max(
    Number(previousSnapshot?.avgDailySpend7d || 0),
    Number(currentSnapshot?.avgDailySpend7d || 0)
  );

  return Math.max(5, Math.min(250, referenceSpend * 0.5));
}

function detectLastPayment(previousSnapshot, currentSnapshot) {
  if (!previousSnapshot || !currentSnapshot) return null;
  if (!previousSnapshot.hasReliableBalance || !currentSnapshot.hasReliableBalance) return null;

  const threshold = getDetectionThreshold(previousSnapshot, currentSnapshot);
  const currentBalanceIncrease = currentSnapshot.currentBalance - previousSnapshot.currentBalance;
  if (currentBalanceIncrease >= threshold) {
    return { date: currentSnapshot.observedDate, source: 'auto', reason: 'balance_increase' };
  }

  const previousBillingBalance = Number(previousSnapshot.rawBillingBalance || 0);
  const currentBillingBalance = Number(currentSnapshot.rawBillingBalance || 0);
  const billingDrop = previousBillingBalance - currentBillingBalance;
  if (previousBillingBalance > 0 && billingDrop >= threshold) {
    return { date: currentSnapshot.observedDate, source: 'auto', reason: 'billing_drop' };
  }

  return null;
}

function useLocalStorageMap(key, defaultValue = {}) {
  const [map, setMap] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const update = useCallback((id, value) => {
    setMap(prev => {
      const next = { ...prev, [id]: value };
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('local-storage-map-updated', {
        detail: { key, value: next },
      }));
      return next;
    });
  }, [key]);

  const merge = useCallback((partial) => {
    if (!partial || Object.keys(partial).length === 0) return;
    setMap(prev => {
      const next = { ...prev, ...partial };
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('local-storage-map-updated', {
        detail: { key, value: next },
      }));
      return next;
    });
  }, [key]);

  return [map, update, merge];
}

function BalanceCard({
  balance,
  paymentMethods,
  setPaymentMethod,
  lastPayments,
  setLastPayment,
  lastPaymentSources,
  setLastPaymentSource,
  billingFrequencies,
  setBillingFrequency,
  nextPaymentOverrides,
  setNextPaymentOverride,
  platform = 'meta',
  manualBalance,
}) {
  const isGoogle = platform === 'google';
  const selectedPaymentMethod = getAccountPaymentMethod(paymentMethods, balance.accountId) || 'credit_card';
  // Orçamento de conta Google é faturado, então o restante aparece mesmo com cartão selecionado.
  const isAccountBudget = balance.balanceSource === 'account_budget';
  const isCreditCard = !isAccountBudget && isCreditCardPaymentMethod(selectedPaymentMethod);
  const ignoresLastPayment = isCreditCard;
  const lastPaymentDate = lastPayments[balance.accountId] || '';
  const lastPaymentSource = lastPaymentSources[balance.accountId] || (lastPaymentDate ? 'manual' : '');
  const selectedFrequency = billingFrequencies[balance.accountId] || 'monthly';
  const showFrequency = selectedPaymentMethod === 'pix' || selectedPaymentMethod === 'boleto';
  const computedNextPayment = showFrequency && !ignoresLastPayment ? getNextPaymentDate(lastPaymentDate, selectedFrequency) : null;
  const overrideNextPayment = showFrequency ? parseDateInput(nextPaymentOverrides?.[balance.accountId] || '') : null;
  const nextPaymentDate = overrideNextPayment || computedNextPayment;
  const daysUntilPayment = getDaysUntil(nextPaymentDate);
  const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 2;
  const isPaymentOverdue = daysUntilPayment !== null && daysUntilPayment < 0;
  const hasReliableBalance = balance.hasReliableBalance !== false;
  const isManualBalance = balance.balanceSource === 'manual';
  // Google sem orçamento de conta: o saldo pré-pago é informado pelo usuário.
  const canInformBalance = isGoogle && !isAccountBudget && !isCreditCard;
  const split = showFrequency && nextPaymentDate && hasReliableBalance && balance.currentBalance > 0
    ? splitBalanceUntil(balance.currentBalance, daysUntilPayment)
    : null;
  const splitOverBudget = split && Number(balance.avgDailySpend7d || 0) > split.daily;
  const shouldShowAvailableBalance = hasReliableBalance && !isCreditCard;
  const shouldShowUnavailableBalance = !hasReliableBalance;

  const pct = shouldShowAvailableBalance && balance.creditLimit > 0 ? (balance.currentBalance / balance.creditLimit) * 100 : 0;
  const isUrgent = shouldShowAvailableBalance && balance.estimatedDaysRemaining > 0 && balance.estimatedDaysRemaining < 2;
  const isZero = shouldShowAvailableBalance && balance.currentBalance <= 0;
  const isCritical = shouldShowAvailableBalance && !isZero && balance.currentBalance < 50;
  const isWarning = shouldShowAvailableBalance && balance.currentBalance >= 50 && balance.currentBalance <= 100;

  let borderClass = 'border-border';
  if (isZero) borderClass = 'border-danger/60 shadow-[0_0_15px_rgba(239,68,68,0.15)]';
  else if (isCritical) borderClass = 'border-warning/40';
  else if (isWarning) borderClass = 'border-orange-500/40';

  let barColor = 'bg-success';
  if (isZero) barColor = 'bg-danger';
  else if (isCritical) barColor = 'bg-warning';
  else if (isWarning) barColor = 'bg-orange-500';

  return (
    <div className={`card-hover bg-surface rounded-2xl border ${borderClass} p-5 transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isGoogle ? <GoogleAdsIcon size={14} /> : <MetaIcon size={14} />}
            <h3 className="text-sm font-semibold text-text-primary truncate">{balance.clientName}</h3>
          </div>
          <p className="text-[11px] text-text-secondary/60 mt-0.5 font-mono">ID: {balance.accountId}</p>
        </div>
        {(isUrgent || isZero) && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-danger bg-danger/10 px-2.5 py-1 rounded-full animate-pulse shrink-0 ml-2 border border-danger/20">
            <AlertTriangle size={11} /> URGENTE
          </span>
        )}
      </div>

      {/* Balance summary */}
      {isCreditCard && hasReliableBalance ? (
        <div className="mb-3 rounded-lg border border-border/60 bg-bg/20 px-3 py-2">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-text-secondary">Saldo disponível</span>
            <span className="font-medium text-text-secondary">Oculto para cartão</span>
          </div>
        </div>
      ) : shouldShowAvailableBalance ? (
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span
              className="text-text-secondary"
              title={isAccountBudget
                ? 'Limite aprovado do orçamento da conta menos o valor já veiculado.'
                : isManualBalance
                  ? `${formatCurrency(balance.informedBalance)} informado − ${formatCurrency(balance.spentSinceBalance)} gastos depois`
                  : undefined}
            >
              {isAccountBudget ? 'Restante do orçamento da conta' : isManualBalance ? 'Saldo (informado − gasto)' : 'Saldo'}
            </span>
            <span className={`font-bold ${isZero ? 'text-danger' : isCritical ? 'text-warning' : isWarning ? 'text-orange-500' : 'text-success'}`}>
              {formatCurrency(balance.currentBalance)}
            </span>
          </div>
          {balance.creditLimit > 0 && (
            <>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <div className="flex justify-end text-xs text-text-secondary mt-1">
                <span>{pct.toFixed(0)}%</span>
              </div>
            </>
          )}
          {canInformBalance && <GoogleBalanceEditor accountId={balance.accountId} manual={manualBalance} />}
        </div>
      ) : shouldShowUnavailableBalance ? (
        <div className="mb-3 rounded-lg border border-border/60 bg-bg/20 px-3 py-2">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-text-secondary">Saldo disponível</span>
            {balance.balanceError
              ? <span className="font-medium text-danger">Erro ao consultar</span>
              : <span className="font-medium text-text-secondary">{canInformBalance ? 'Não informado' : 'Não disponível via API'}</span>}
          </div>
          {canInformBalance && <GoogleBalanceEditor accountId={balance.accountId} manual={manualBalance} />}
          {balance.balanceError && (
            <p role="alert" className="text-[11px] text-danger/80 mt-1">{balance.balanceError}</p>
          )}
          {balance.amountDue > 0 && (
            <p className="text-[11px] text-text-secondary mt-1">
              Em cobrança: {formatCurrency(balance.amountDue)}
            </p>
          )}
        </div>
      ) : null}

      {/* Spend metrics */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-text-secondary">Gasto no mês</span>
          <span className="font-medium text-text-primary">{formatCurrency(balance.spentThisMonth || 0, balance.currency)}</span>
        </div>
      </div>

      {/* Extra fields: days remaining, payment method, last payment */}
      <div className="space-y-2 text-sm mt-3 pt-3 border-t border-border">
        {!isCreditCard && balance.amountDue > 0 && (
          <div className="flex justify-between">
            <span className="text-text-secondary">Em cobrança</span>
            <span className="font-medium text-warning">{formatCurrency(balance.amountDue)}</span>
          </div>
        )}
        {!ignoresLastPayment && hasReliableBalance && (
          <div className="flex justify-between">
            <span className="text-text-secondary flex items-center gap-1"><Clock size={12} /> Dias restantes</span>
            <span className={`font-bold ${balance.estimatedDaysRemaining < 2 ? 'text-danger' : balance.estimatedDaysRemaining < 4 ? 'text-warning' : 'text-success'}`}>
              {balance.estimatedDaysRemaining > 0 ? `${balance.estimatedDaysRemaining.toFixed(1)} dias` : '—'}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-text-secondary flex items-center gap-1"><CreditCard size={12} /> Pagamento</span>
          <select
            value={selectedPaymentMethod}
            onChange={e => setPaymentMethod(balance.accountId, e.target.value)}
            className="bg-bg border border-border rounded px-2 py-0.5 text-xs text-text-primary focus:outline-none focus:border-primary"
          >
            {paymentMethodOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Frequência de cobrança — só para Pix e Boleto */}
        {showFrequency && (
          <div className="flex justify-between items-center">
            <span className="text-text-secondary flex items-center gap-1"><Repeat size={12} /> Frequência</span>
            <select
              value={selectedFrequency}
              onChange={e => setBillingFrequency(balance.accountId, e.target.value)}
              className="bg-bg border border-border rounded px-2 py-0.5 text-xs text-text-primary focus:outline-none focus:border-primary"
            >
              {billingFrequencyOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {!ignoresLastPayment && (
          <>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Último pagamento</span>
              <div className="flex items-center gap-2">
                {lastPaymentSource === 'auto' && (
                  <span className="text-[10px] font-medium text-primary-light bg-primary/10 border border-primary/20 rounded-full px-1.5 py-0.5">
                    Auto
                  </span>
                )}
                <input
                  type="date"
                  value={lastPaymentDate}
                  onChange={e => {
                    const value = e.target.value;
                    setLastPayment(balance.accountId, value);
                    setLastPaymentSource(balance.accountId, value ? 'manual' : '');
                  }}
                  className="bg-bg border border-border rounded px-2 py-0.5 text-xs text-text-primary focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            {!lastPaymentDate && hasReliableBalance && (
              <p className="text-[10px] text-text-secondary/80">
                A data ser&aacute; preenchida automaticamente quando o sistema detectar recarga ou quita&ccedil;&atilde;o.
              </p>
            )}
          </>
        )}

        {/* Próximo pagamento — Pix/Boleto: último pagamento + frequência, ou data definida à mão */}
        {showFrequency && (
          <div className={`flex justify-between items-center rounded-lg px-2.5 py-1.5 -mx-1 ${isPaymentOverdue ? 'bg-danger/10 border border-danger/30' : isPaymentSoon ? 'bg-warning/10 border border-warning/30' : 'bg-primary/5 border border-primary/20'}`}>
            <span className={`flex items-center gap-1 text-xs font-medium ${isPaymentOverdue ? 'text-danger' : isPaymentSoon ? 'text-warning' : 'text-text-secondary'}`}>
              <CalendarClock size={12} /> Próximo pagamento
            </span>
            <NextPaymentEditor
              accountId={balance.accountId}
              computedDate={computedNextPayment}
              overrideDate={overrideNextPayment}
              onSave={setNextPaymentOverride}
            />
          </div>
        )}

        {/* Saldo dividido pelos dias até o próximo pagamento */}
        {showFrequency && (
          <div className="flex justify-between items-center">
            <span className="text-text-secondary flex items-center gap-1"><Divide size={12} /> Disponível/dia até pgto</span>
            {split ? (
              <span
                className={`text-right leading-tight font-bold ${splitOverBudget ? 'text-danger' : split.overdue ? 'text-warning' : 'text-success'}`}
                title={split.overdue
                  ? `Pagamento atrasado — saldo ${formatCurrency(balance.currentBalance)} dividido por 1 dia`
                  : `${formatCurrency(balance.currentBalance)} ÷ ${split.divisor} dia${split.divisor === 1 ? '' : 's'} · gasto médio ${formatCurrency(balance.avgDailySpend7d || 0)}/dia`}
              >
                {formatCurrency(split.daily)}
                <span className="block text-[10px] font-normal opacity-70">
                  {split.overdue ? 'Atrasado' : split.days === 0 ? 'Hoje' : `÷ ${split.days} dia${split.days === 1 ? '' : 's'}`}
                </span>
              </span>
            ) : (
              <span className="text-xs text-text-secondary/70">
                {!nextPaymentDate ? 'Defina o pagamento' : canInformBalance && !hasReliableBalance ? 'Informe o saldo' : '—'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MetaBalances() {
  const data = useMetaAds();
  return <BalancesView data={data} platform="meta" />;
}

const PLATFORM_LABELS = { meta: 'Meta Ads', google: 'Google Ads' };

/**
 * Saldos de uma plataforma. Cada plataforma guarda as próprias preferências
 * (Google usa as chaves com prefixo `google_`).
 */
function PlatformBalances({ platform, data, sortBy, selectedAgency, showTitle }) {
  const { balances, loading, error } = data;
  const isGoogle = platform === 'google';
  const preferenceKey = key => isGoogle ? `google_${key}` : key;
  const { accountAgencies } = useAgency();
  const [paymentMethods, setPaymentMethodLocal] = useLocalStorageMap(preferenceKey('account_payment_methods'));

  // Sync payment method to Supabase for cron usage
  const setPaymentMethod = useCallback((accountId, value) => {
    setPaymentMethodLocal(accountId, value);
    if (isGoogle) return;
    supabase.from('account_configs')
      .upsert({ account_id: accountId, payment_method: value, updated_at: new Date().toISOString() }, { onConflict: 'account_id' })
      .then(({ error: err }) => { if (err) console.warn('[MetaBalances] Erro ao sincronizar payment method:', err); });
  }, [setPaymentMethodLocal, isGoogle]);
  const [lastPayments, setLastPayment, mergeLastPayments] = useLocalStorageMap(preferenceKey('account_last_payments'));
  const [lastPaymentSources, setLastPaymentSource, mergeLastPaymentSources] = useLocalStorageMap(preferenceKey('account_last_payment_sources'));
  const [billingFrequencies, setBillingFrequency] = useLocalStorageMap(preferenceKey('account_billing_frequencies'));
  const [nextPaymentOverrides, setNextPaymentOverrideRaw] = useLocalStorageMap(preferenceKey('account_next_payment_overrides'));
  const setNextPaymentOverride = useCallback((accountId, value) => setNextPaymentOverrideRaw(accountId, value || null), [setNextPaymentOverrideRaw]);
  const [balanceSnapshots, , mergeBalanceSnapshots] = useLocalStorageMap(preferenceKey('meta_balance_snapshots'));
  const manualBalances = useStoredMap(GOOGLE_MANUAL_BALANCES_KEY);

  useEffect(() => {
    if (isGoogle || balances.length === 0) return;

    const nextSnapshotUpdates = {};
    const nextPaymentUpdates = {};
    const nextSourceUpdates = {};

    balances.forEach(balance => {
      const accountId = balance.accountId;
      const previousSnapshot = balanceSnapshots[accountId];
      const currentSnapshot = buildBalanceSnapshot(balance);
      const selectedPaymentMethod = getAccountPaymentMethod(paymentMethods, accountId) || 'credit_card';

      if (hasSnapshotChanged(previousSnapshot, currentSnapshot)) {
        nextSnapshotUpdates[accountId] = currentSnapshot;
      }

      if (isCreditCardPaymentMethod(selectedPaymentMethod)) {
        return;
      }

      const detectedPayment = detectLastPayment(previousSnapshot, currentSnapshot);
      const existingLastPayment = lastPayments[accountId];
      const existingSource = lastPaymentSources[accountId] || (existingLastPayment ? 'manual' : '');
      const canAutoReplace = !existingLastPayment || existingSource === 'auto';

      if (detectedPayment && canAutoReplace && existingLastPayment !== detectedPayment.date) {
        nextPaymentUpdates[accountId] = detectedPayment.date;
        nextSourceUpdates[accountId] = detectedPayment.source;
      }
    });

    if (Object.keys(nextSnapshotUpdates).length > 0) {
      mergeBalanceSnapshots(nextSnapshotUpdates);
    }

    if (Object.keys(nextPaymentUpdates).length > 0) {
      mergeLastPayments(nextPaymentUpdates);
      mergeLastPaymentSources(nextSourceUpdates);
    }
  }, [isGoogle, balances, balanceSnapshots, paymentMethods, lastPayments, lastPaymentSources, mergeBalanceSnapshots, mergeLastPayments, mergeLastPaymentSources]);

  const sorted = useMemo(() => {
    const filtered = selectedAgency === 'all'
      ? balances
      : balances.filter(b => accountAgencies[b.accountId] === selectedAgency);
    const list = [...filtered];
    const reliable = b => b.hasReliableBalance !== false;
    const compareReliableFirst = (a, b) => {
      if (reliable(a) === reliable(b)) return 0;
      return reliable(a) ? -1 : 1;
    };
    const num = value => Number(value || 0);
    switch (sortBy) {
      case 'balance_asc': return list.sort((a, b) => compareReliableFirst(a, b) || num(a.currentBalance) - num(b.currentBalance));
      case 'balance_desc': return list.sort((a, b) => compareReliableFirst(a, b) || num(b.currentBalance) - num(a.currentBalance));
      case 'name': return list.sort((a, b) => a.clientName.localeCompare(b.clientName));
      case 'spend_desc': return list.sort((a, b) => num(b.spentThisMonth) - num(a.spentThisMonth));
      case 'days': return list.sort((a, b) => compareReliableFirst(a, b) || num(a.estimatedDaysRemaining) - num(b.estimatedDaysRemaining));
      default: return list;
    }
  }, [balances, sortBy, selectedAgency, accountAgencies]);

  return (
    <section className="space-y-3">
      {showTitle && (
        <div className="flex items-center gap-2">
          {isGoogle ? <GoogleAdsIcon size={18} /> : <MetaIcon size={18} />}
          <h2 className="text-base font-semibold text-text-primary">{PLATFORM_LABELS[platform]}</h2>
          {!loading && <span className="text-xs text-text-secondary">{sorted.length} conta{sorted.length === 1 ? '' : 's'}</span>}
        </div>
      )}
      {isGoogle && (
        <p className="text-sm text-text-secondary">
          A API do Google não informa o saldo pré-pago (Pix/boleto): clique em <strong>Informar saldo</strong> e digite o valor que aparece no Google. O painel desconta sozinho o gasto dos dias seguintes. Contas com orçamento de conta aprovado mostram o restante do limite automaticamente.
        </p>
      )}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-text-secondary">Carregando dados de saldos...</div>
      ) : (
        <>
          {error && <p role="alert" className="text-sm text-warning">{balances.length ? error : `Erro ao carregar os dados de saldos: ${error}`}</p>}
          {!balances.length && !error && <p className="text-sm text-text-secondary">Nenhuma conta disponível. Confira as conexões em Configurações.</p>}
          {balances.length > 0 && !sorted.length && <p className="text-sm text-text-secondary">Nenhuma conta desta agência.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map(balance => (
              <BalanceCard
                key={balance.accountId}
                balance={balance}
                platform={platform}
                paymentMethods={paymentMethods}
                setPaymentMethod={setPaymentMethod}
                lastPayments={lastPayments}
                setLastPayment={setLastPayment}
                lastPaymentSources={lastPaymentSources}
                setLastPaymentSource={setLastPaymentSource}
                billingFrequencies={billingFrequencies}
                setBillingFrequency={setBillingFrequency}
                nextPaymentOverrides={nextPaymentOverrides}
                setNextPaymentOverride={setNextPaymentOverride}
                manualBalance={isGoogle ? manualBalances[balance.accountId] : undefined}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * `sections`: [{ platform, data }]. Com `onPlatformChange`, vira a aba unificada
 * "Saldos" com o seletor de plataforma (Todas, Meta ou Google) no cabeçalho.
 */
export function BalancesView({ sections, data, platform = 'meta', onPlatformChange }) {
  const list = sections || [{ platform, data }];
  const unified = typeof onPlatformChange === 'function';
  const heading = unified ? 'Saldos' : `Saldos ${PLATFORM_LABELS[list[0].platform]}`;
  const { agencies } = useAgency();
  const [sortBy, setSortBy] = useState('balance_asc');
  const [selectedAgency, setSelectedAgency] = useState('all');
  const loading = list.some(section => section.data.loading);
  const refreshAll = () => list.forEach(section => section.data.refreshData?.());

  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="relative z-10 rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-5 lg:p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>

        <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
              <Wallet size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-text-primary tracking-tight">{heading}</h1>
            </div>
          </div>

          {/* Filters & Actions */}
          <div className="grid grid-cols-1 min-[560px]:grid-cols-2 sm:flex sm:flex-wrap items-end gap-3 sm:gap-4 w-full lg:w-auto">
            {unified && (
              <div className={FILTER_FIELD}>
                <label className={FILTER_LABEL}>Plataforma</label>
                <select
                  value={platform}
                  onChange={e => onPlatformChange(e.target.value)}
                  className={FILTER_CONTROL}
                >
                  <option value="all">Todas</option>
                  <option value="meta">Meta Ads</option>
                  <option value="google">Google Ads</option>
                </select>
              </div>
            )}

            {agencies.length > 0 && (
              <div className={FILTER_FIELD}>
                <label className={FILTER_LABEL}>Agência</label>
                <select
                  value={selectedAgency}
                  onChange={e => setSelectedAgency(e.target.value)}
                  className={FILTER_CONTROL}
                >
                  <option value="all">Todas</option>
                  {agencies.map(ag => (
                    <option key={ag} value={ag}>{ag}</option>
                  ))}
                </select>
              </div>
            )}

            <div className={FILTER_FIELD}>
              <label className={FILTER_LABEL}><ArrowUpDown size={12} /> Ordenar</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className={FILTER_CONTROL}
              >
                {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <button
              onClick={refreshAll}
              disabled={loading}
              className="group relative inline-flex items-center justify-center gap-2 px-5 rounded-xl font-semibold text-sm
                bg-gradient-to-r from-primary to-primary-light text-white shadow-lg shadow-primary/25
                hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
                transition-all duration-300 ease-out h-[42px] col-span-1 min-[560px]:col-span-2 sm:col-span-1"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
              {loading ? 'Atualizando...' : 'Atualizar'}
              <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          </div>
        </div>
      </div>

      {list.map(section => (
        <PlatformBalances
          key={section.platform}
          platform={section.platform}
          data={section.data}
          sortBy={sortBy}
          selectedAgency={selectedAgency}
          showTitle={list.length > 1}
        />
      ))}
    </div>
  );
}
