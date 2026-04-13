import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { formatCurrency } from '../../shared/utils/format';
import { isCreditCardPaymentMethod, getAccountPaymentMethod } from '../../shared/utils/paymentMethod';
import { supabase } from '../../services/supabase';
import { Wallet, AlertTriangle, Clock, CreditCard, ArrowUpDown, RefreshCw, Edit3, Target, CalendarClock, Repeat } from 'lucide-react';

const sortOptions = [
  { value: 'balance_asc', label: 'Menor saldo primeiro' },
  { value: 'balance_desc', label: 'Maior saldo primeiro' },
  { value: 'name', label: 'Nome (A-Z)' },
  { value: 'days', label: 'Dias restantes' },
];

const paymentMethodOptions = [
  { value: 'credit_card', label: 'Cartão' },
  { value: 'pix', label: 'Pix' },
  { value: 'boleto', label: 'Boleto' },
];

const billingFrequencyOptions = [
  { value: 'weekly', label: 'Semanal', days: 7 },
  { value: 'biweekly', label: 'Quinzenal', days: 15 },
  { value: 'monthly', label: 'Mensal', days: 30 },
];

/**
 * Calcula a próxima data de pagamento com base na última data e frequência.
 */
function getNextPaymentDate(lastPaymentStr, frequency) {
  if (!lastPaymentStr) return null;
  const freqObj = billingFrequencyOptions.find(f => f.value === frequency);
  if (!freqObj) return null;

  const last = new Date(lastPaymentStr + 'T00:00:00');
  if (isNaN(last.getTime())) return null;

  const next = new Date(last);
  if (frequency === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else {
    next.setDate(next.getDate() + freqObj.days);
  }
  return next;
}

function getDaysUntil(dateObj) {
  if (!dateObj) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((dateObj - today) / 86400000);
  return diff;
}

function formatDateBR(dateObj) {
  if (!dateObj) return '—';
  return dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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

function MonthlyGoalInput({ accountId, goals, setGoal }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const value = goals[accountId] || 0;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const save = () => {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed >= 0) {
      setGoal(accountId, parsed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min="0"
        step="100"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        className="w-24 bg-background border border-primary/40 rounded px-2 py-0.5 text-sm text-text-primary text-right focus:outline-none focus:border-primary"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="flex items-center gap-1 text-text-primary hover:text-primary transition-colors"
    >
      <span className="text-sm">{value > 0 ? formatCurrency(value) : 'Definir'}</span>
      <Edit3 size={10} className="text-text-secondary" />
    </button>
  );
}


function SpendProgressBar({ balance, monthlyGoal }) {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentMonthSpend = balance.spentThisMonth || 0;
  const estimatedMonthSpend = dayOfMonth > 0 ? (currentMonthSpend / dayOfMonth) * daysInMonth : 0;
  const remainingDaysInMonth = Math.max(daysInMonth - dayOfMonth, 1);

  if (!monthlyGoal || monthlyGoal <= 0) {
    return (
      <div className="text-xs text-text-secondary italic">Defina uma meta mensal para ver o progresso</div>
    );
  }

  const pct = Math.min((currentMonthSpend / monthlyGoal) * 100, 100);
  const projectedPct = Math.min((estimatedMonthSpend / monthlyGoal) * 100, 150);
  const isOver = projectedPct > 100;
  const remainingToGoal = Math.max(monthlyGoal - currentMonthSpend, 0);
  const recommendedDailySpend = remainingToGoal > 0 ? remainingToGoal / remainingDaysInMonth : 0;

  let barColor = 'bg-success';
  if (pct > 90) barColor = 'bg-danger';
  else if (pct > 70) barColor = 'bg-warning';

  return (
    <div>
      <div className="flex justify-between text-xs text-text-secondary mb-1">
        <span>Gasto no mês: {formatCurrency(currentMonthSpend)}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-text-secondary mt-0.5">
        <span>Meta: {formatCurrency(monthlyGoal)}</span>
        {isOver && <span className="text-danger font-medium">Projeção: {projectedPct.toFixed(0)}%</span>}
      </div>
      <div className="flex justify-between text-[10px] mt-0.5">
        <span className="text-text-secondary">Restante</span>
        <span className={`font-medium ${remainingToGoal > 0 ? 'text-text-primary' : 'text-success'}`}>
          {remainingToGoal > 0 ? formatCurrency(remainingToGoal) : 'Meta atingida'}
        </span>
      </div>
      <div className="flex justify-between text-[10px] mt-1">
        <span className="text-text-secondary">Recomendado por dia</span>
        <span className={`font-medium ${recommendedDailySpend > 0 ? 'text-primary-light' : 'text-success'}`}>
          {recommendedDailySpend > 0 ? formatCurrency(recommendedDailySpend) : 'Meta atingida'}
        </span>
      </div>
    </div>
  );
}

function BalanceCard({
  balance,
  goals,
  setGoal,
  paymentMethods,
  setPaymentMethod,
  lastPayments,
  setLastPayment,
  lastPaymentSources,
  setLastPaymentSource,
  billingFrequencies,
  setBillingFrequency,
}) {
  const monthlyGoal = goals[balance.accountId] || 0;
  const selectedPaymentMethod = getAccountPaymentMethod(paymentMethods, balance.accountId) || 'credit_card';
  const isCreditCard = isCreditCardPaymentMethod(selectedPaymentMethod);
  const ignoresLastPayment = isCreditCard;
  const lastPaymentDate = lastPayments[balance.accountId] || '';
  const lastPaymentSource = lastPaymentSources[balance.accountId] || (lastPaymentDate ? 'manual' : '');
  const selectedFrequency = billingFrequencies[balance.accountId] || 'monthly';
  const showFrequency = selectedPaymentMethod === 'pix' || selectedPaymentMethod === 'boleto';
  const nextPaymentDate = showFrequency && !ignoresLastPayment ? getNextPaymentDate(lastPaymentDate, selectedFrequency) : null;
  const daysUntilPayment = getDaysUntil(nextPaymentDate);
  const isPaymentSoon = daysUntilPayment !== null && daysUntilPayment <= 2;
  const isPaymentOverdue = daysUntilPayment !== null && daysUntilPayment < 0;
  const hasReliableBalance = balance.hasReliableBalance !== false;
  const shouldShowAvailableBalance = hasReliableBalance && !isCreditCard;
  const shouldShowUnavailableBalance = !hasReliableBalance && !isCreditCard;

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
      {isCreditCard ? (
        <div className="mb-3 rounded-lg border border-border/60 bg-bg/20 px-3 py-2">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-text-secondary">Saldo disponível</span>
            <span className="font-medium text-text-secondary">Oculto para cartão</span>
          </div>
        </div>
      ) : shouldShowAvailableBalance ? (
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-text-secondary">Saldo</span>
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
        </div>
      ) : shouldShowUnavailableBalance ? (
        <div className="mb-3 rounded-lg border border-border/60 bg-bg/20 px-3 py-2">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-text-secondary">Saldo disponível</span>
            <span className="font-medium text-text-secondary">Não disponível via API</span>
          </div>
          {balance.amountDue > 0 && (
            <p className="text-[11px] text-text-secondary mt-1">
              Em cobrança: {formatCurrency(balance.amountDue)}
            </p>
          )}
        </div>
      ) : null}

      {/* Spend metrics (both modes) */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-text-secondary flex items-center gap-1"><Target size={12} /> Meta mensal</span>
          <MonthlyGoalInput accountId={balance.accountId} goals={goals} setGoal={setGoal} />
        </div>
      </div>

      {/* Monthly goal progress bar (both modes) */}
      <div className="mt-3">
        <SpendProgressBar balance={balance} monthlyGoal={monthlyGoal} />
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

        {/* Próximo pagamento — só para Pix/Boleto quando há data e frequência */}
        {showFrequency && nextPaymentDate && (
          <div className={`flex justify-between items-center rounded-lg px-2.5 py-1.5 -mx-1 ${isPaymentOverdue ? 'bg-danger/10 border border-danger/30' : isPaymentSoon ? 'bg-warning/10 border border-warning/30' : 'bg-primary/5 border border-primary/20'}`}>
            <span className={`flex items-center gap-1 text-xs font-medium ${isPaymentOverdue ? 'text-danger' : isPaymentSoon ? 'text-warning' : 'text-text-secondary'}`}>
              <CalendarClock size={12} /> Próximo pagamento
            </span>
            <div className="text-right">
              <span className={`text-xs font-bold ${isPaymentOverdue ? 'text-danger' : isPaymentSoon ? 'text-warning' : 'text-primary-light'}`}>
                {formatDateBR(nextPaymentDate)}
              </span>
              <span className={`block text-[10px] ${isPaymentOverdue ? 'text-danger/80' : isPaymentSoon ? 'text-warning/80' : 'text-text-secondary'}`}>
                {isPaymentOverdue
                  ? `Atrasado ${Math.abs(daysUntilPayment)} dia${Math.abs(daysUntilPayment) !== 1 ? 's' : ''}`
                  : daysUntilPayment === 0
                    ? 'Hoje'
                    : daysUntilPayment === 1
                      ? 'Amanhã'
                      : `Em ${daysUntilPayment} dias`
                }
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MetaBalances() {
  const { balances, loading, error, refreshData } = useMetaAds();
  const { agencies, accountAgencies } = useAgency();
  const [sortBy, setSortBy] = useState('balance_asc');
  const [selectedAgency, setSelectedAgency] = useState('all');
  const [goals, setGoal] = useLocalStorageMap('account_monthly_goals');
  const [paymentMethods, setPaymentMethodLocal] = useLocalStorageMap('account_payment_methods');

  // Sync payment method to Supabase for cron usage
  const setPaymentMethod = useCallback((accountId, value) => {
    setPaymentMethodLocal(accountId, value);
    supabase.from('account_configs')
      .upsert({ account_id: accountId, payment_method: value, updated_at: new Date().toISOString() }, { onConflict: 'account_id' })
      .then(({ error: err }) => { if (err) console.warn('[MetaBalances] Erro ao sincronizar payment method:', err); });
  }, [setPaymentMethodLocal]);
  const [lastPayments, setLastPayment, mergeLastPayments] = useLocalStorageMap('account_last_payments');
  const [lastPaymentSources, setLastPaymentSource, mergeLastPaymentSources] = useLocalStorageMap('account_last_payment_sources');
  const [billingFrequencies, setBillingFrequency] = useLocalStorageMap('account_billing_frequencies');
  const [balanceSnapshots, , mergeBalanceSnapshots] = useLocalStorageMap('meta_balance_snapshots');

  useEffect(() => {
    if (balances.length === 0) return;

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
  }, [balances, balanceSnapshots, paymentMethods, lastPayments, lastPaymentSources, mergeBalanceSnapshots, mergeLastPayments, mergeLastPaymentSources]);

  const sorted = useMemo(() => {
    const filtered = selectedAgency === 'all'
      ? balances
      : balances.filter(b => accountAgencies[b.accountId] === selectedAgency);
    const list = [...filtered];
    const compareReliableFirst = (a, b) => {
      if (a.hasReliableBalance === b.hasReliableBalance) return 0;
      return a.hasReliableBalance ? -1 : 1;
    };
    switch (sortBy) {
      case 'balance_asc': return list.sort((a, b) => compareReliableFirst(a, b) || a.currentBalance - b.currentBalance);
      case 'balance_desc': return list.sort((a, b) => compareReliableFirst(a, b) || b.currentBalance - a.currentBalance);
      case 'name': return list.sort((a, b) => a.clientName.localeCompare(b.clientName));
      case 'days': return list.sort((a, b) => compareReliableFirst(a, b) || a.estimatedDaysRemaining - b.estimatedDaysRemaining);
      default: return list;
    }
  }, [balances, sortBy, selectedAgency, accountAgencies]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-meta/10">
              <Wallet size={24} className="text-meta" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Saldos Meta Ads</h1>
              <p className="text-sm text-text-secondary">Saldo e crédito de todas as contas</p>
            </div>
          </div>
          <button
            disabled
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border text-text-secondary opacity-50"
          >
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm font-medium">Atualizando...</span>
          </button>
        </div>
        <div className="flex items-center justify-center h-64 text-text-secondary">
          Carregando dados de saldos...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-meta/10">
              <Wallet size={24} className="text-meta" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Saldos Meta Ads</h1>
              <p className="text-sm text-text-secondary">Saldo e crédito de todas as contas</p>
            </div>
          </div>
          <button
            onClick={refreshData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-primary hover:border-primary/40 transition-all"
          >
            <RefreshCw size={16} />
            <span className="text-sm font-medium">Atualizar Dados</span>
          </button>
        </div>
        <div className="flex items-center justify-center h-64 text-danger">
          Erro ao carregar os dados de saldos: {error}
        </div>
      </div>
    );
  }

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
              <h1 className="text-xl lg:text-2xl font-bold text-text-primary tracking-tight">Saldos Meta Ads</h1>
              <p className="text-xs lg:text-sm text-text-secondary">Saldo e crédito de todas as contas</p>
            </div>
          </div>

          {/* Filters & Actions inline */}
          <div className="flex flex-wrap items-end gap-3 lg:gap-4 w-full lg:w-auto">
            {agencies.length > 0 && (
              <div className="flex flex-col gap-1 w-[180px] flex-grow lg:flex-grow-0">
                <label className="text-[10px] font-medium text-text-secondary uppercase tracking-wider">Agência</label>
                <select
                  value={selectedAgency}
                  onChange={e => setSelectedAgency(e.target.value)}
                  className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-lg px-3 py-2 text-xs font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer h-[36px]"
                >
                  <option value="all">Todas as agências</option>
                  {agencies.map(ag => (
                    <option key={ag} value={ag}>{ag}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1 w-[200px] flex-grow lg:flex-grow-0">
              <label className="text-[10px] font-medium text-text-secondary flex items-center gap-1 uppercase tracking-wider"><ArrowUpDown size={10} /> Ordenar por</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-lg px-3 py-2 text-xs font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer h-[36px]"
              >
                {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <button
              onClick={refreshData}
              disabled={loading}
              className="group relative inline-flex items-center justify-center gap-2 px-5 rounded-lg font-semibold text-xs
                bg-gradient-to-r from-primary to-primary-light text-white shadow-lg shadow-primary/25
                hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
                transition-all duration-300 ease-out h-[36px] flex-grow lg:flex-grow-0"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
              {loading ? 'Atualizando...' : 'Atualizar Dados'}
              <div className="absolute inset-0 rounded-lg bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map(balance => (
          <BalanceCard
            key={balance.accountId}
            balance={balance}
            goals={goals}
            setGoal={setGoal}
            paymentMethods={paymentMethods}
            setPaymentMethod={setPaymentMethod}
            lastPayments={lastPayments}
            setLastPayment={setLastPayment}
            lastPaymentSources={lastPaymentSources}
            setLastPaymentSource={setLastPaymentSource}
            billingFrequencies={billingFrequencies}
            setBillingFrequency={setBillingFrequency}
          />
        ))}
      </div>
    </div>
  );
}
