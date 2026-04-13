import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { formatCurrency, formatNumber, formatPercent, getCostColor } from '../../shared/utils/format';
import { readSavedPaymentMethods, isCreditCardPaymentMethod, getAccountPaymentMethod } from '../../shared/utils/paymentMethod';

import { Megaphone, Power, ChevronDown, ChevronRight, Loader2, RefreshCw, Settings2, Wallet, AlertTriangle, Clock, DollarSign, Check, X, ChevronUp, Info, Image, Pencil, CreditCard, GripVertical } from 'lucide-react';
import { updateCampaignStatus, updateCampaignBudget, fetchAdSetsForCampaign, updateAdSetBudget, updateAdSetStatus, updateAdStatus, fetchAdsForAdSet } from '../../services/metaApi';
import PeriodSelector from '../../shared/components/PeriodSelector';

const ALL_COLUMNS = [
  { key: 'name', label: 'Conta / Cliente', align: 'left' },
  { key: 'budget', label: 'Orçamento', align: 'center' },
  { key: 'spend', label: 'Gasto', align: 'right' },
  { key: 'balance', label: 'Saldo', align: 'right' },
  { key: 'cpm', label: 'CPM', align: 'right' },
  { key: 'clicks', label: 'Cliques', align: 'right' },
  { key: 'cpc', label: 'CPC', align: 'right' },
  { key: 'messages', label: 'Mensagens', align: 'right' },
  { key: 'costPerMsg', label: 'Custo/Msg', align: 'right' },
  { key: 'ctr', label: 'CTR', align: 'right' },
  { key: 'frequency', label: 'Frequência', align: 'right' },
  { key: 'reach', label: 'Alcance', align: 'right' },
];
const DEFAULT_COLUMN_ORDER = ALL_COLUMNS.map(c => c.key);

function normalizeColumnOrder(savedOrder) {
  const validKeys = new Set(DEFAULT_COLUMN_ORDER);
  const sanitized = Array.isArray(savedOrder)
    ? savedOrder.filter(key => validKeys.has(key))
    : [];

  const missing = DEFAULT_COLUMN_ORDER.filter(key => !sanitized.includes(key));
  return [...sanitized, ...missing];
}

function readSavedMonthlyGoals() {
  try {
    return JSON.parse(localStorage.getItem('account_monthly_goals') || '{}');
  } catch {
    return {};
  }
}

function readCustomAccountNames() {
  try {
    return JSON.parse(localStorage.getItem('custom_account_names') || '{}');
  } catch {
    return {};
  }
}

// ── Account Name Editor ──
function AccountNameEditor({ accountId, defaultName, customNames, setCustomNames }) {
  const [editing, setEditing] = useState(false);
  const currentName = customNames[accountId] || defaultName;
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleOpen = (e) => {
    e.stopPropagation();
    setDraft(currentName);
    setEditing(true);
  };

  const handleSave = (e) => {
    e?.stopPropagation();
    const newNames = { ...customNames, [accountId]: draft.trim() };
    if (!draft.trim()) {
      delete newNames[accountId];
    }
    setCustomNames(newNames);
    localStorage.setItem('custom_account_names', JSON.stringify(newNames));
    window.dispatchEvent(new CustomEvent('local-storage-map-updated', { detail: { key: 'custom_account_names', value: newNames } }));
    setEditing(false);
  };

  const handleCancel = (e) => {
    e?.stopPropagation();
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          className="w-40 bg-bg border border-primary/40 rounded px-1.5 py-0.5 text-xs text-text-primary focus:outline-none focus:border-primary"
        />
        <button onClick={handleSave} className="p-0.5 rounded hover:bg-success/20 text-success transition-colors" title="Salvar">
          <Check size={12} />
        </button>
        <button onClick={handleCancel} className="p-0.5 rounded hover:bg-danger/20 text-danger transition-colors" title="Cancelar">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2">
      <span className="font-medium text-text-primary">{currentName}</span>
      <button
        onClick={handleOpen}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-surface-hover rounded text-text-secondary hover:text-primary transition-all"
        title="Editar nome"
      >
        <Pencil size={12} />
      </button>
    </div>
  );
}

// ── Meta-style Toggle Switch ──
function MetaToggle({ isActive, isToggling, onToggle, size = 'md', title }) {
  const sizes = {
    sm: { w: 'w-8', h: 'h-[18px]', dot: 'w-3.5 h-3.5', translate: 'translate-x-[14px]' },
    md: { w: 'w-10', h: 'h-[22px]', dot: 'w-[18px] h-[18px]', translate: 'translate-x-[18px]' },
  };
  const s = sizes[size] || sizes.md;

  return (
    <button
      onClick={onToggle}
      disabled={isToggling}
      title={title}
      className={`relative inline-flex items-center ${s.w} ${s.h} rounded-full transition-all duration-300 ease-in-out flex-shrink-0 ${
        isToggling
          ? 'bg-border cursor-wait'
          : isActive
            ? 'bg-[#0FA5AE] shadow-[0_0_8px_rgba(15,165,174,0.3)]'
            : 'bg-[#333845] hover:bg-[#3d4252]'
      }`}
    >
      {isToggling ? (
        <Loader2 size={10} className="animate-spin text-text-secondary absolute left-1/2 -translate-x-1/2" />
      ) : (
        <span
          className={`${s.dot} rounded-full bg-white shadow-md transform transition-transform duration-300 ease-in-out absolute top-[2px] ${
            isActive ? s.translate : 'translate-x-[2px]'
          }`}
        />
      )}
    </button>
  );
}

// ── Budget Edit Inline Component ──
function BudgetEditor({ currentBudget, onSave, saving }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleOpen = (e) => {
    e.stopPropagation();
    setDraft(currentBudget > 0 ? String(currentBudget.toFixed(2)) : '');
    setEditing(true);
  };

  const handleSave = (e) => {
    e?.stopPropagation();
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed > 0) {
      onSave(parsed);
    }
    setEditing(false);
  };

  const handleCancel = (e) => {
    e?.stopPropagation();
    setEditing(false);
  };

  if (saving) {
    return (
      <span className="flex items-center gap-1 text-xs text-text-secondary">
        <Loader2 size={12} className="animate-spin" /> Salvando...
      </span>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <span className="text-xs text-text-secondary">R$</span>
        <input
          ref={inputRef}
          type="number"
          min="1"
          step="0.01"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          className="w-20 bg-bg border border-primary/40 rounded px-1.5 py-0.5 text-xs text-text-primary text-right focus:outline-none focus:border-primary"
        />
        <button onClick={handleSave} className="p-0.5 rounded hover:bg-success/20 text-success transition-colors" title="Salvar">
          <Check size={12} />
        </button>
        <button onClick={handleCancel} className="p-0.5 rounded hover:bg-danger/20 text-danger transition-colors" title="Cancelar">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleOpen}
      title="Editar orçamento diário"
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-border bg-bg/50 hover:border-primary/40 hover:bg-primary/5 text-text-secondary hover:text-primary transition-all"
    >
      <DollarSign size={11} />
      {currentBudget > 0 ? formatCurrency(currentBudget) : 'Definir'}
    </button>
  );
}

// ── Budget Source Info Badge ──
function BudgetSourceBadge({ type, label }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-primary/8 text-primary-light border border-primary/15" title={label}>
      <Info size={9} />
      {type === 'campaign' ? 'Orç. na Campanha' : 'Orç. no Conjunto'}
    </span>
  );
}

// ── Balance Summary Cards ──
function BalanceSummaryCards({ balances, filteredAccountIds, monthlyGoals }) {
  const relevantBalances = useMemo(() => {
    const withGoals = balances.filter((b) => {
      const goal = monthlyGoals?.[b.accountId] || 0;
      return goal > 0;
    });
    if (!filteredAccountIds) return withGoals;
    return withGoals.filter(b => filteredAccountIds.includes(b.accountId));
  }, [balances, filteredAccountIds, monthlyGoals]);

  const totalGoal = useMemo(() =>
    relevantBalances.reduce((sum, b) => sum + (monthlyGoals?.[b.accountId] || 0), 0),
    [relevantBalances, monthlyGoals]
  );

  const totalSpent = useMemo(() =>
    relevantBalances.reduce((sum, b) => sum + (b.spentThisMonth || 0), 0),
    [relevantBalances]
  );

  const totalRemaining = Math.max(0, totalGoal - totalSpent);
  const pctUsed = totalGoal > 0 ? (totalSpent / totalGoal) * 100 : 0;

  const totalAvgDaily = useMemo(() =>
    relevantBalances.reduce((sum, b) => sum + (b.avgDailySpend7d || 0), 0),
    [relevantBalances]
  );

  const estimatedDays = totalAvgDaily > 0 ? totalRemaining / totalAvgDaily : 0;

  const urgentCount = relevantBalances.filter(b => {
    const goal = monthlyGoals?.[b.accountId] || 0;
    const spent = b.spentThisMonth || 0;
    return goal > 0 && (spent / goal) >= 0.9;
  }).length;

  if (relevantBalances.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Gasto no Mês */}
      <div className="bg-surface rounded-xl border border-border p-4 hover:bg-surface-hover transition-all">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-meta/10">
            <Wallet size={16} className="text-meta" />
          </div>
          <span className="text-xs text-text-secondary font-medium">Gasto no Mês</span>
        </div>
        <p className="text-xl font-bold text-text-primary">{formatCurrency(totalSpent)}</p>
        <p className="text-[11px] text-text-secondary mt-1">Meta total: {formatCurrency(totalGoal)}</p>
      </div>

      {/* Dias Estimados */}
      <div className="bg-surface rounded-xl border border-border p-4 hover:bg-surface-hover transition-all">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-info/10">
            <Clock size={16} className="text-info" />
          </div>
          <span className="text-xs text-text-secondary font-medium">Dias até Meta</span>
        </div>
        <p className={`text-xl font-bold ${estimatedDays < 3 ? 'text-danger' : estimatedDays < 7 ? 'text-warning' : 'text-text-primary'}`}>
          {estimatedDays > 0 ? `${estimatedDays.toFixed(1)} dias` : '—'}
        </p>
        <p className="text-[11px] text-text-secondary mt-1">Baseado na média de gasto</p>
      </div>

      {/* Alertas */}
      <div className={`bg-surface rounded-xl border p-4 hover:bg-surface-hover transition-all ${urgentCount > 0 ? 'border-danger/40' : 'border-border'}`}>
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-1.5 rounded-lg ${urgentCount > 0 ? 'bg-danger/10' : 'bg-success/10'}`}>
            <AlertTriangle size={16} className={urgentCount > 0 ? 'text-danger' : 'text-success'} />
          </div>
          <span className="text-xs text-text-secondary font-medium">Alertas de Meta</span>
        </div>
        <p className={`text-xl font-bold ${urgentCount > 0 ? 'text-danger' : 'text-success'}`}>
          {urgentCount > 0 ? `${urgentCount} conta${urgentCount !== 1 ? 's' : ''}` : 'Tudo ok'}
        </p>
        <p className="text-[11px] text-text-secondary mt-1">{urgentCount > 0 ? 'Acima de 90% da meta' : 'Todas dentro da meta'}</p>
      </div>
    </div>
  );
}

// ── Individual Account Balance Badges ──
function AccountBalanceBadge({ balance, monthlyGoal }) {
  if (!balance) return null;

  const spentThisMonth = balance.spentThisMonth || 0;
  const hasGoal = monthlyGoal && monthlyGoal > 0;
  const hasBalance = balance.hasReliableBalance !== false && balance.currentBalance > 0;

  if (!hasGoal && !hasBalance) return null;

  return (
    <span className="inline-flex items-center gap-1.5 ml-2">
      {/* Saldo disponível em conta */}
      {hasBalance && (
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
          balance.currentBalance < 50 ? 'bg-danger/10 text-danger border border-danger/20' :
          balance.currentBalance < 150 ? 'bg-warning/10 text-warning border border-warning/20' :
          'bg-success/10 text-success border border-success/20'
        }`} title={`Saldo em conta: ${formatCurrency(balance.currentBalance)}`}>
          <Wallet size={10} />
          {formatCurrency(balance.currentBalance)}
        </span>
      )}
    </span>
  );
}

// ── Helper: get total daily budget for an account's campaigns ──
function getTotalBudget(accountCampaigns) {
  let total = 0;
  for (const c of accountCampaigns) {
    total += c.dailyBudget || 0;
  }
  return total;
}

// ── Helper: determine budget source ──
function getCampaignBudgetSource(campaign) {
  // Campaign has daily_budget > 0 means budget is at campaign level (CBO)
  return (campaign.dailyBudget && campaign.dailyBudget > 0) ? 'campaign' : 'adset';
}

export default function MetaAdsOverview() {
  const { accounts, balances, campaigns, selectedPeriod, setSelectedPeriod, loading, error, refreshData } = useMetaAds();
  const { agencies, accountAgencies } = useAgency();
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [selectedAgency, setSelectedAgency] = useState('all');
  const [expandedAccount, setExpandedAccount] = useState(null);
  const [expandedCampaign, setExpandedCampaign] = useState(null);
  const [expandedAdSet, setExpandedAdSet] = useState(null);
  const [adSets, setAdSets] = useState({});
  const [adSetsLoading, setAdSetsLoading] = useState({});
  const [ads, setAds] = useState({});
  const [adsLoading, setAdsLoading] = useState({});
  const [togglingCampaigns, setTogglingCampaigns] = useState({});
  const [togglingAdSets, setTogglingAdSets] = useState({});
  const [togglingAds, setTogglingAds] = useState({});
  const [savingBudgets, setSavingBudgets] = useState({});
  const [monthlyGoals, setMonthlyGoals] = useState(() => readSavedMonthlyGoals());
  const [paymentMethods, setPaymentMethods] = useState(() => readSavedPaymentMethods());
  const [customNames, setCustomNames] = useState(() => readCustomAccountNames());
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('meta_ads_column_order'));
      if (!saved || !saved.includes('name')) return DEFAULT_COLUMN_ORDER;
      return normalizeColumnOrder(saved);
    } catch { return DEFAULT_COLUMN_ORDER; }
  });
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [draggedColumnKey, setDraggedColumnKey] = useState(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState(null);

  useEffect(() => {
    const syncAll = () => {
      setMonthlyGoals(readSavedMonthlyGoals());
      setPaymentMethods(readSavedPaymentMethods());
      setCustomNames(readCustomAccountNames());
    };
    const handleLocalStorageMapUpdated = (event) => {
      if (event?.detail?.key === 'account_monthly_goals') {
        setMonthlyGoals(event.detail.value || {});
      } else if (event?.detail?.key === 'account_payment_methods') {
        setPaymentMethods(event.detail.value || {});
      } else if (event?.detail?.key === 'custom_account_names') {
        setCustomNames(event.detail.value || {});
      }
    };
    window.addEventListener('storage', syncAll);
    window.addEventListener('focus', syncAll);
    window.addEventListener('local-storage-map-updated', handleLocalStorageMapUpdated);
    return () => {
      window.removeEventListener('storage', syncAll);
      window.removeEventListener('focus', syncAll);
      window.removeEventListener('local-storage-map-updated', handleLocalStorageMapUpdated);
    };
  }, []);

  const getSpendValue = useCallback((item) => {
    return Number(item?.metrics?.spend || 0);
  }, []);

  const orderedColumns = columnOrder.map(key => ALL_COLUMNS.find(c => c.key === key)).filter(Boolean);
  const showBudgetColumn = expandedAccount !== null;

  const persistColumnOrder = useCallback((nextOrder) => {
    const normalized = normalizeColumnOrder(nextOrder);
    setColumnOrder(normalized);
    localStorage.setItem('meta_ads_column_order', JSON.stringify(normalized));
  }, []);

  const moveColumn = useCallback((key, direction) => {
    const currentIndex = columnOrder.indexOf(key);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + direction;
    if (newIndex < 0 || newIndex >= columnOrder.length) return;

    const newOrder = [...columnOrder];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];
    persistColumnOrder(newOrder);
  }, [columnOrder, persistColumnOrder]);

  const moveColumnToIndex = useCallback((key, targetIndex) => {
    const currentIndex = columnOrder.indexOf(key);
    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= columnOrder.length || currentIndex === targetIndex) return;

    const newOrder = [...columnOrder];
    const [movedColumn] = newOrder.splice(currentIndex, 1);
    newOrder.splice(targetIndex, 0, movedColumn);
    persistColumnOrder(newOrder);
  }, [columnOrder, persistColumnOrder]);

  const handleColumnDragStart = useCallback((event, key) => {
    setDraggedColumnKey(key);
    setDragOverColumnKey(key);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', key);
    }
  }, []);

  const handleColumnDragOver = useCallback((event, key) => {
    event.preventDefault();
    if (dragOverColumnKey !== key) {
      setDragOverColumnKey(key);
    }
  }, [dragOverColumnKey]);

  const handleColumnDrop = useCallback((targetKey) => {
    if (!draggedColumnKey || draggedColumnKey === targetKey) {
      setDraggedColumnKey(null);
      setDragOverColumnKey(null);
      return;
    }

    const targetIndex = columnOrder.indexOf(targetKey);
    if (targetIndex !== -1) {
      moveColumnToIndex(draggedColumnKey, targetIndex);
    }

    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
  }, [columnOrder, draggedColumnKey, moveColumnToIndex]);

  const handleColumnDragEnd = useCallback(() => {
    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
  }, []);

  const resetColumnOrder = () => {
    persistColumnOrder(DEFAULT_COLUMN_ORDER);
  };

  // ── Cell Renderers ──
  const getMessages = (actions) => {
    if (!actions) return 0;
    const msg = actions.find(a => a.action_type === 'onsite_conversion.messaging_conversation_started_7d');
    return msg ? parseInt(msg.value, 10) : 0;
  };

  const renderAccountCell = (col, account, { balance, monthlyGoal, totalBudget } = {}) => {
    const m = account.metrics;
    const accountId = account.id || account.accountId;
    const paymentMethod = getAccountPaymentMethod(paymentMethods, account.id, account.accountId, accountId) || 'credit_card';
    const isCreditCard = isCreditCardPaymentMethod(paymentMethod);

    switch (col.key) {
      case 'spend': return formatCurrency(m?.spend || 0);
      case 'balance': {
        if (isCreditCard) {
          return <span className="flex items-center gap-1 text-text-secondary font-medium"><CreditCard size={12} /> Cartão</span>;
        }
        if (!balance || balance.hasReliableBalance === false || balance.currentBalance <= 0) return '—';
        const val = balance.currentBalance;
        const color = val < 50 ? 'text-danger' : val < 150 ? 'text-warning' : 'text-success';
        return <span className={`font-medium ${color}`}>{formatCurrency(val)}</span>;
      }
      case 'cpm': return formatCurrency(m?.cpm || 0);
      case 'clicks': return formatNumber(m?.linkClicks || 0);
      case 'cpc': return formatCurrency(m?.cpc || 0);
      case 'messages': return formatNumber(m?.messagingConversationsStarted || 0);
      case 'costPerMsg': return m?.costPerMessage > 0 ? formatCurrency(m.costPerMessage) : '—';
      case 'ctr': return m?.ctr > 0 ? formatPercent(m.ctr) : '—';
      case 'frequency': return m?.frequency ? formatNumber(m.frequency) : '—';
      case 'reach': return m?.reach ? formatNumber(m.reach) : '—';
      default: return '—';
    }
  };

  const renderCampaignCell = (col, campaign) => {
    const m = campaign.metrics;
    switch (col.key) {
      case 'spend': return formatCurrency(m?.spend || 0);
      case 'dailyBudget': return campaign.dailyBudget > 0 ? formatCurrency(campaign.dailyBudget) : '—';
      case 'cpm': return m?.cpm > 0 ? formatCurrency(m.cpm) : '—';
      case 'clicks': return '—';
      case 'cpc': return m?.cpc > 0 ? formatCurrency(m.cpc) : '—';
      case 'messages': return formatNumber(m?.messages || 0);
      case 'costPerMsg': return m?.costPerMessage > 0 ? formatCurrency(m.costPerMessage) : '—';
      case 'ctr': return m?.ctr > 0 ? formatPercent(m.ctr) : '—';
      case 'frequency': return m?.frequency || '—';
      case 'reach': return '—';
      default: return '—';
    }
  };

  const renderAdSetCell = (col, adSet) => {
    const ins = adSet.insights?.data?.[0];
    const spend = parseFloat(ins?.spend || 0);
    const messages = getMessages(ins?.actions);
    const clicks = parseInt(ins?.inline_link_clicks || 0, 10);

    switch (col.key) {
      case 'spend': return formatCurrency(spend);
      case 'cpm': return ins?.cpm ? formatCurrency(parseFloat(ins.cpm)) : '—';
      case 'clicks': return clicks > 0 ? formatNumber(clicks) : '—';
      case 'cpc': return ins?.cpc ? formatCurrency(parseFloat(ins.cpc)) : '—';
      case 'messages': return formatNumber(messages);
      case 'costPerMsg': return messages > 0 ? formatCurrency(spend / messages) : '—';
      case 'ctr': return ins?.ctr ? formatPercent(parseFloat(ins.ctr)) : '—';
      case 'frequency': return ins?.frequency ? formatNumber(parseFloat(ins.frequency)) : '—';
      case 'reach': return ins?.reach ? formatNumber(parseInt(ins.reach, 10)) : '—';
      default: return '—';
    }
  };

  const renderAdCell = (col, ad) => {
    const ins = ad.insights?.data?.[0];
    const spend = parseFloat(ins?.spend || 0);
    const messages = getMessages(ins?.actions);
    const clicks = parseInt(ins?.inline_link_clicks || 0, 10);

    switch (col.key) {
      case 'spend': return formatCurrency(spend);
      case 'cpm': return ins?.cpm ? formatCurrency(parseFloat(ins.cpm)) : '—';
      case 'clicks': return clicks > 0 ? formatNumber(clicks) : '—';
      case 'cpc': return ins?.cpc ? formatCurrency(parseFloat(ins.cpc)) : '—';
      case 'messages': return formatNumber(messages);
      case 'costPerMsg': return messages > 0 ? formatCurrency(spend / messages) : '—';
      case 'ctr': return ins?.ctr ? formatPercent(parseFloat(ins.ctr)) : '—';
      case 'frequency': return ins?.frequency ? formatNumber(parseFloat(ins.frequency)) : '—';
      case 'reach': return ins?.reach ? formatNumber(parseInt(ins.reach, 10)) : '—';
      default: return '—';
    }
  };

  // ── Filters ──
  const agencyFilteredAccounts = useMemo(() => {
    if (selectedAgency === 'all') return accounts;
    return accounts.filter(a => accountAgencies[a.id] === selectedAgency);
  }, [accounts, selectedAgency, accountAgencies]);

  const filteredAccounts = useMemo(() => {
    const visibleAccounts = selectedAccount === 'all'
      ? agencyFilteredAccounts
      : agencyFilteredAccounts.filter(a => a.id === selectedAccount);

    return [...visibleAccounts].sort((a, b) => getSpendValue(b) - getSpendValue(a));
  }, [agencyFilteredAccounts, getSpendValue, selectedAccount]);

  // eslint-disable-next-line no-unused-vars -- kept for BalanceSummaryCards integration
  const filteredAccountIds = useMemo(() => filteredAccounts.map(a => a.id), [filteredAccounts]);

  const getCampaignsForAccount = useCallback((accountId) => {
    return campaigns
      .filter(c => c.accountId === accountId)
      .sort((a, b) => getSpendValue(b) - getSpendValue(a));
  }, [campaigns, getSpendValue]);

  // ── Toggle Handlers ──
  const handleToggleCampaign = async (campaign) => {
    const newStatus = campaign.status === 'active' ? 'PAUSED' : 'ACTIVE';
    const campaignId = campaign.id;

    setTogglingCampaigns(prev => ({ ...prev, [campaignId]: true }));

    try {
      await updateCampaignStatus(campaignId, newStatus);
      campaign.status = newStatus.toLowerCase();
    } catch (err) {
      alert(`Erro ao alterar campanha: ${err.message}`);
    } finally {
      setTogglingCampaigns(prev => ({ ...prev, [campaignId]: false }));
    }
  };

  const handleToggleAdSet = async (adSet, campaignId) => {
    const currentStatus = adSet.status?.toUpperCase();
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

    setTogglingAdSets(prev => ({ ...prev, [adSet.id]: true }));

    try {
      await updateAdSetStatus(adSet.id, newStatus);
      // Optimistic update
      setAdSets(prev => {
        const updated = { ...prev };
        if (updated[campaignId]) {
          updated[campaignId] = updated[campaignId].map(as =>
            as.id === adSet.id ? { ...as, status: newStatus } : as
          );
        }
        return updated;
      });
    } catch (err) {
      alert(`Erro ao alterar conjunto: ${err.message}`);
    } finally {
      setTogglingAdSets(prev => ({ ...prev, [adSet.id]: false }));
    }
  };

  const handleToggleAd = async (ad, adSetId) => {
    const currentStatus = ad.status?.toUpperCase();
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

    setTogglingAds(prev => ({ ...prev, [ad.id]: true }));

    try {
      await updateAdStatus(ad.id, newStatus);
      // Optimistic update
      setAds(prev => {
        const updated = { ...prev };
        if (updated[adSetId]) {
          updated[adSetId] = updated[adSetId].map(a =>
            a.id === ad.id ? { ...a, status: newStatus } : a
          );
        }
        return updated;
      });
    } catch (err) {
      alert(`Erro ao alterar anúncio: ${err.message}`);
    } finally {
      setTogglingAds(prev => ({ ...prev, [ad.id]: false }));
    }
  };

  // ── Budget Handlers ──
  const handleUpdateCampaignBudget = async (campaignId, newBudget) => {
    setSavingBudgets(prev => ({ ...prev, [campaignId]: true }));
    try {
      await updateCampaignBudget(campaignId, newBudget);
      const camp = campaigns.find(c => c.id === campaignId);
      if (camp) camp.dailyBudget = newBudget;
    } catch (err) {
      alert(`Erro ao alterar orçamento: ${err.message}`);
    } finally {
      setSavingBudgets(prev => ({ ...prev, [campaignId]: false }));
    }
  };

  const handleUpdateAdSetBudget = async (adSetId, newBudget) => {
    setSavingBudgets(prev => ({ ...prev, [adSetId]: true }));
    try {
      await updateAdSetBudget(adSetId, newBudget);
      setAdSets(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) {
          updated[key] = updated[key].map(as =>
            as.id === adSetId ? { ...as, daily_budget: String(Math.round(newBudget * 100)) } : as
          );
        }
        return updated;
      });
    } catch (err) {
      alert(`Erro ao alterar orçamento do conjunto: ${err.message}`);
    } finally {
      setSavingBudgets(prev => ({ ...prev, [adSetId]: false }));
    }
  };

  // ── Expand Handlers ──
  const handleExpandCampaign = async (campaignId) => {
    if (expandedCampaign === campaignId) {
      setExpandedCampaign(null);
      setExpandedAdSet(null);
      return;
    }
    setExpandedCampaign(campaignId);
    setExpandedAdSet(null);

    if (!adSets[campaignId]) {
      setAdSetsLoading(prev => ({ ...prev, [campaignId]: true }));
      try {
        const sets = await fetchAdSetsForCampaign(campaignId, selectedPeriod);
        setAdSets(prev => ({ ...prev, [campaignId]: sets }));
      } catch (err) {
        console.warn('Erro ao carregar ad sets:', err);
        setAdSets(prev => ({ ...prev, [campaignId]: [] }));
      } finally {
        setAdSetsLoading(prev => ({ ...prev, [campaignId]: false }));
      }
    }
  };

  const handleExpandAdSet = async (adSetId) => {
    if (expandedAdSet === adSetId) {
      setExpandedAdSet(null);
      return;
    }
    setExpandedAdSet(adSetId);

    if (!ads[adSetId]) {
      setAdsLoading(prev => ({ ...prev, [adSetId]: true }));
      try {
        const adList = await fetchAdsForAdSet(adSetId, selectedPeriod);
        setAds(prev => ({ ...prev, [adSetId]: adList }));
      } catch (err) {
        console.warn('Erro ao carregar anúncios:', err);
        setAds(prev => ({ ...prev, [adSetId]: [] }));
      } finally {
        setAdsLoading(prev => ({ ...prev, [adSetId]: false }));
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-meta/10">
              <Megaphone size={24} className="text-meta" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Meta Ads — Visão Geral</h1>
              <p className="text-sm text-text-secondary">Performance de todas as contas Meta Ads</p>
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
          Carregando dados da Meta API...
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
              <Megaphone size={24} className="text-meta" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Meta Ads — Visão Geral</h1>
              <p className="text-sm text-text-secondary">Performance de todas as contas Meta Ads</p>
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
          Erro ao carregar dados: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="relative z-10 rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-4 sm:p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>

        <div className="relative">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
              <Megaphone size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-text-primary tracking-tight">Meta Ads — Visão Geral</h1>
              <p className="text-xs sm:text-sm text-text-secondary">Performance de todas as contas Meta Ads</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="relative mt-7 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end justify-between gap-4 sm:gap-5">
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3 sm:gap-5 w-full sm:w-auto">
            {agencies.length > 0 && (
              <div className="flex flex-col gap-1.5 w-full sm:w-[210px]">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Agência</label>
                <select
                  value={selectedAgency}
                  onChange={e => { setSelectedAgency(e.target.value); setSelectedAccount('all'); }}
                  className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
                >
                  <option value="all">Todas as agências</option>
                  {agencies.map(ag => (
                    <option key={ag} value={ag}>{ag}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5 w-full sm:w-[295px]">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Conta</label>
              <select
                value={selectedAccount}
                onChange={e => setSelectedAccount(e.target.value)}
                className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
              >
                <option value="all">Todas as contas</option>
                {agencyFilteredAccounts.map(a => (
                  <option key={a.id} value={a.id}>{customNames[a.id] || a.clientName}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 w-full sm:w-[210px] z-50">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Período</label>
              <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} className="w-full" />
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => setShowColumnSettings(!showColumnSettings)}
              className={`flex items-center justify-center gap-2 flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm border ${showColumnSettings ? 'bg-primary/20 text-primary-light border-primary/30' : 'bg-surface/60 border-border/50 text-text-secondary hover:text-text-primary hover:border-primary/30'}`}
            >
              <Settings2 size={16} /> Colunas
            </button>
            <button
              onClick={refreshData}
              disabled={loading}
              className="group relative inline-flex items-center justify-center gap-2.5 flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-semibold text-sm
                bg-gradient-to-r from-primary to-primary-light text-white shadow-lg shadow-primary/25
                hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
                transition-all duration-300 ease-out"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
              {loading ? 'Atualizando...' : 'Atualizar Dados'}
              <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          </div>
        </div>
      </div>

      {showColumnSettings && (
        <div className="bg-surface rounded-2xl border border-border p-4 lg:p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.25)]">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <span className="text-sm font-semibold text-text-primary">Organizar métricas</span>
              <p className="text-xs text-text-secondary mt-1">
                Arraste os cards para reordenar ou use os botões de subir e descer.
              </p>
            </div>
            <button
              onClick={resetColumnOrder}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-bg text-text-secondary hover:text-primary hover:border-primary/30 transition-colors self-start"
            >
              Resetar ordem
            </button>
          </div>

          <div className="space-y-2">
            {orderedColumns.map((col, idx) => {
              const isDragging = draggedColumnKey === col.key;
              const isDropTarget = dragOverColumnKey === col.key && draggedColumnKey && draggedColumnKey !== col.key;

              return (
                <div
                  key={col.key}
                  draggable
                  onDragStart={(event) => handleColumnDragStart(event, col.key)}
                  onDragOver={(event) => handleColumnDragOver(event, col.key)}
                  onDrop={() => handleColumnDrop(col.key)}
                  onDragEnd={handleColumnDragEnd}
                  className={`group flex items-center gap-3 rounded-xl border px-3 py-3 transition-all ${
                    isDragging
                      ? 'border-primary/40 bg-primary/10 opacity-70 scale-[0.99]'
                      : isDropTarget
                        ? 'border-primary/50 bg-primary/5 shadow-[0_0_0_1px_rgba(15,165,174,0.2)]'
                        : 'border-border bg-bg/60 hover:border-primary/25 hover:bg-bg'
                  }`}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border/70 bg-surface text-text-secondary cursor-grab active:cursor-grabbing">
                    <GripVertical size={16} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary-light">
                        #{idx + 1}
                      </span>
                      <span className="text-sm font-medium text-text-primary">{col.label}</span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1">
                      {col.key === 'name'
                        ? 'Identificação principal da conta e expansão da estrutura.'
                        : col.key === 'budget'
                          ? 'Orçamento diário visível quando a conta está expandida.'
                          : 'Métrica exibida na tabela principal da conta.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => moveColumn(col.key, -1)}
                      disabled={idx === 0}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary hover:text-primary hover:border-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Mover para cima"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      onClick={() => moveColumn(col.key, 1)}
                      disabled={idx === orderedColumns.length - 1}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary hover:text-primary hover:border-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Mover para baixo"
                    >
                      <ChevronDown size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {orderedColumns.map((col) => (
              <div key={`${col.key}-preview`} className="inline-flex items-center gap-2 rounded-full border border-border bg-bg/70 px-3 py-1.5 text-xs text-text-secondary">
                <span className="font-semibold text-text-primary">
                  {columnOrder.indexOf(col.key) + 1}.
                </span>
                <span>{col.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-[0_2px_12px_-4px_rgba(0,0,0,0.3)]">
        <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-bg/40">
                <th className="w-8 px-2 py-3.5"></th>
                {orderedColumns.map(col => {
                  if (col.key === 'budget' && !showBudgetColumn) return null;
                  return (
                    <th key={col.key} className={`text-${col.align} px-${col.key === 'name' ? '4' : '3'} py-3.5 text-text-secondary ${col.key === 'name' ? 'font-semibold' : 'font-medium'}`}>{col.label}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account, i) => {
                const isExpanded = expandedAccount === account.id;
                const accountCampaigns = getCampaignsForAccount(account.id);
                const hasCampaigns = accountCampaigns.length > 0;
                const accountBalance = balances.find((b) => b.accountId === account.id || b.accountId === account.accountId);
                const accountGoal = monthlyGoals[account.id] || monthlyGoals[account.accountId] || 0;
                const totalBudget = getTotalBudget(accountCampaigns);

                return (
                  <React.Fragment key={account.id}>
                    <tr
                      className={`border-b border-border/50 hover:bg-surface-hover transition-colors cursor-pointer ${i % 2 === 0 ? 'bg-surface' : 'bg-bg/30'}`}
                      onClick={() => hasCampaigns && setExpandedAccount(isExpanded ? null : account.id)}
                    >
                      <td className="px-2 py-3 text-center">
                        {hasCampaigns && (
                          isExpanded
                            ? <ChevronDown size={14} className="text-text-secondary mx-auto" />
                            : <ChevronRight size={14} className="text-text-secondary mx-auto" />
                        )}
                      </td>
                      {orderedColumns.map(col => {
                        if (col.key === 'name') {
                          return (
                            <td key={col.key} className="px-4 py-3 font-medium text-text-primary">
                              <AccountNameEditor
                                accountId={account.id}
                                defaultName={account.clientName}
                                customNames={customNames}
                                setCustomNames={setCustomNames}
                              />
                            </td>
                          );
                        }
                        if (col.key === 'budget') {
                          if (!showBudgetColumn) return null;
                          return (
                            <td key={col.key} className="px-3 py-3 text-center">
                              {isExpanded && totalBudget > 0 ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-text-primary bg-primary/8 border border-primary/15 rounded-lg px-2 py-1">
                                  <DollarSign size={10} className="text-primary-light" />
                                  {formatCurrency(totalBudget)}/dia
                                </span>
                              ) : (
                                <span className="text-text-secondary text-xs">—</span>
                              )}
                            </td>
                          );
                        }
                        const cellClass = col.key === 'spend' ? 'text-right text-text-primary' :
                          col.key === 'messages' ? 'text-right font-medium text-text-primary' :
                          col.key === 'costPerMsg' ? `text-right font-bold ${getCostColor(account.metrics?.costPerMessage || 0)}` :
                          (col.key === 'balance' || col.key === 'available') ? 'text-right' :
                          'text-right text-text-secondary';
                        return <td key={col.key} className={`px-3 py-3 ${cellClass}`}>{renderAccountCell(col, account, { balance: accountBalance, monthlyGoal: accountGoal, totalBudget })}</td>;
                      })}
                    </tr>

                    {/* Expanded campaigns */}
                    {isExpanded && accountCampaigns.map(campaign => {
                      const isToggling = togglingCampaigns[campaign.id];
                      const isActive = campaign.status === 'active';
                      const isCampaignExpanded = expandedCampaign === campaign.id;
                      const campaignAdSets = adSets[campaign.id] || [];
                      const isLoadingAdSets = adSetsLoading[campaign.id];
                      const budgetSource = getCampaignBudgetSource(campaign);

                      return (
                        <React.Fragment key={campaign.id}>
                          <tr className="bg-bg/60 border-b border-border/30">
                            <td className="px-2 py-2.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleExpandCampaign(campaign.id); }}
                                className="flex items-center justify-center w-5 h-5 mx-auto text-text-secondary/50 hover:text-text-primary transition-colors"
                                title="Ver conjuntos de anúncio"
                              >
                                {isCampaignExpanded
                                  ? <ChevronDown size={12} />
                                  : <ChevronRight size={12} />
                                }
                              </button>
                            </td>
                            {orderedColumns.map(col => {
                              if (col.key === 'name') {
                                return (
                                  <td key={col.key} className="px-4 py-2.5 pl-8">
                                    <div className="flex items-center gap-3">
                                      <MetaToggle
                                        isActive={isActive}
                                        isToggling={isToggling}
                                        onToggle={(e) => { e.stopPropagation(); handleToggleCampaign(campaign); }}
                                        title={isActive ? 'Pausar campanha' : 'Ativar campanha'}
                                      />
                                      <div>
                                        <span className="text-sm text-text-primary">{campaign.name}</span>
                                        <span className="text-xs text-text-secondary ml-2">({campaign.objective})</span>
                                      </div>
                                    </div>
                                  </td>
                                );
                              }
                              if (col.key === 'budget') {
                                if (!showBudgetColumn) return null;
                                return (
                                  <td key={col.key} className="px-3 py-2.5 text-center">
                                    {budgetSource === 'campaign' ? (
                                      <BudgetEditor
                                        currentBudget={campaign.dailyBudget || 0}
                                        onSave={(val) => handleUpdateCampaignBudget(campaign.id, val)}
                                        saving={savingBudgets[campaign.id]}
                                      />
                                    ) : (
                                      <BudgetSourceBadge type="adset" label="Orçamento definido nos conjuntos de anúncio" />
                                    )}
                                  </td>
                                );
                              }
                              const cellClass = col.key === 'spend' ? 'text-right text-text-primary' :
                                col.key === 'messages' ? 'text-right font-medium text-text-primary' :
                                col.key === 'costPerMsg' ? `text-right font-bold ${getCostColor(campaign.metrics?.costPerMessage || 0)}` :
                                'text-right text-text-secondary';
                              return <td key={col.key} className={`px-3 py-2.5 ${cellClass}`}>{renderCampaignCell(col, campaign)}</td>;
                            })}
                          </tr>

                          {/* Expanded Ad Sets */}
                          {isCampaignExpanded && (
                            <>
                              {isLoadingAdSets && (
                                <tr className="bg-bg/40 border-b border-border/20">
                                  <td colSpan={orderedColumns.length + (showBudgetColumn ? 1 : 0)} className="py-3 text-center">
                                    <span className="flex items-center justify-center gap-2 text-xs text-text-secondary">
                                      <Loader2 size={12} className="animate-spin" /> Carregando conjuntos de anúncio...
                                    </span>
                                  </td>
                                </tr>
                              )}
                              {!isLoadingAdSets && campaignAdSets.length === 0 && (
                                <tr className="bg-bg/40 border-b border-border/20">
                                  <td colSpan={orderedColumns.length + (showBudgetColumn ? 1 : 0)} className="py-3 text-center text-xs text-text-secondary">
                                    Nenhum conjunto de anúncio encontrado
                                  </td>
                                </tr>
                              )}
                              {!isLoadingAdSets && campaignAdSets.map(adSet => {
                                const adSetBudget = adSet.daily_budget ? parseFloat(adSet.daily_budget) / 100 : 0;
                                const isAdSetActive = adSet.status?.toUpperCase() === 'ACTIVE';
                                const isAdSetToggling = togglingAdSets[adSet.id];
                                const isAdSetExpanded = expandedAdSet === adSet.id;
                                const adSetAds = ads[adSet.id] || [];
                                const isLoadingAds = adsLoading[adSet.id];
                                const adSetCostPerMsg = (() => {
                                  const ins = adSet.insights?.data?.[0];
                                  if (!ins) return 0;
                                  const msgs = getMessages(ins.actions);
                                  return msgs > 0 ? parseFloat(ins.spend || 0) / msgs : 0;
                                })();

                                return (
                                  <React.Fragment key={adSet.id}>
                                    <tr className="bg-bg/30 border-b border-border/15">
                                      <td className="px-2 py-2">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleExpandAdSet(adSet.id); }}
                                          className="flex items-center justify-center w-5 h-5 mx-auto text-text-secondary/40 hover:text-text-primary transition-colors"
                                          title="Ver anúncios"
                                        >
                                          {isAdSetExpanded
                                            ? <ChevronDown size={11} />
                                            : <ChevronRight size={11} />
                                          }
                                        </button>
                                      </td>
                                      {orderedColumns.map(col => {
                                        if (col.key === 'name') {
                                          return (
                                            <td key={col.key} className="px-4 py-2 pl-14">
                                              <div className="flex items-center gap-2.5">
                                                <MetaToggle
                                                  isActive={isAdSetActive}
                                                  isToggling={isAdSetToggling}
                                                  onToggle={(e) => { e.stopPropagation(); handleToggleAdSet(adSet, campaign.id); }}
                                                  size="sm"
                                                  title={isAdSetActive ? 'Pausar conjunto' : 'Ativar conjunto'}
                                                />
                                                <div className="flex items-center gap-2">
                                                  <span className="text-xs text-text-primary">{adSet.name}</span>
                                                  {adSet.optimization_goal && (
                                                    <span className="text-[10px] text-text-secondary/60">({adSet.optimization_goal})</span>
                                                  )}
                                                </div>
                                              </div>
                                            </td>
                                          );
                                        }
                                        if (col.key === 'budget') {
                                          if (!showBudgetColumn) return null;
                                          return (
                                            <td key={col.key} className="px-3 py-2 text-center">
                                              {budgetSource === 'adset' ? (
                                                <BudgetEditor
                                                  currentBudget={adSetBudget}
                                                  onSave={(val) => handleUpdateAdSetBudget(adSet.id, val)}
                                                  saving={savingBudgets[adSet.id]}
                                                />
                                              ) : (
                                                <BudgetSourceBadge type="campaign" label="Orçamento definido na campanha (CBO)" />
                                              )}
                                            </td>
                                          );
                                        }
                                        const cellClass = col.key === 'spend' ? 'text-right text-text-primary' :
                                          col.key === 'messages' ? 'text-right font-medium text-text-primary' :
                                          col.key === 'costPerMsg' ? `text-right font-bold ${getCostColor(adSetCostPerMsg)}` :
                                          'text-right text-text-secondary';
                                        return <td key={col.key} className={`px-3 py-2 text-xs ${cellClass}`}>{renderAdSetCell(col, adSet)}</td>;
                                      })}
                                    </tr>

                                    {/* Expanded Ads */}
                                    {isAdSetExpanded && (
                                      <>
                                        {isLoadingAds && (
                                          <tr className="bg-bg/20 border-b border-border/10">
                                            <td colSpan={orderedColumns.length + (showBudgetColumn ? 1 : 0)} className="py-3 text-center">
                                              <span className="flex items-center justify-center gap-2 text-xs text-text-secondary">
                                                <Loader2 size={12} className="animate-spin" /> Carregando anúncios...
                                              </span>
                                            </td>
                                          </tr>
                                        )}
                                        {!isLoadingAds && adSetAds.length === 0 && (
                                          <tr className="bg-bg/20 border-b border-border/10">
                                            <td colSpan={orderedColumns.length + (showBudgetColumn ? 1 : 0)} className="py-3 text-center text-xs text-text-secondary">
                                              Nenhum anúncio encontrado
                                            </td>
                                          </tr>
                                        )}
                                        {!isLoadingAds && adSetAds.map(ad => {
                                          const isAdActive = ad.status?.toUpperCase() === 'ACTIVE';
                                          const isAdToggling = togglingAds[ad.id];
                                          const adIns = ad.insights?.data?.[0];
                                          const adMsgs = getMessages(adIns?.actions);
                                          const adSpend = parseFloat(adIns?.spend || 0);
                                          const adCostPerMsg = adMsgs > 0 ? adSpend / adMsgs : 0;
                                          const thumbnailUrl = ad.creative?.thumbnail_url;

                                          return (
                                            <tr key={ad.id} className="bg-bg/15 border-b border-border/10">
                                              <td className="px-2 py-2"></td>
                                              {orderedColumns.map(col => {
                                                if (col.key === 'name') {
                                                  return (
                                                    <td key={col.key} className="px-4 py-2 pl-20">
                                                      <div className="flex items-center gap-2.5">
                                                        <MetaToggle
                                                          isActive={isAdActive}
                                                          isToggling={isAdToggling}
                                                          onToggle={(e) => { e.stopPropagation(); handleToggleAd(ad, adSet.id); }}
                                                          size="sm"
                                                          title={isAdActive ? 'Pausar anúncio' : 'Ativar anúncio'}
                                                        />
                                                        {thumbnailUrl ? (
                                                          <img src={thumbnailUrl} alt="" className="w-8 h-8 rounded object-cover border border-border/30 flex-shrink-0" />
                                                        ) : (
                                                          <div className="w-8 h-8 rounded bg-border/20 flex items-center justify-center flex-shrink-0">
                                                            <Image size={12} className="text-text-secondary/40" />
                                                          </div>
                                                        )}
                                                        <span className="text-xs text-text-primary">{ad.name}</span>
                                                      </div>
                                                    </td>
                                                  );
                                                }
                                                if (col.key === 'budget') {
                                                  if (!showBudgetColumn) return null;
                                                  return (
                                                    <td key={col.key} className="px-3 py-2 text-center text-xs text-text-secondary">—</td>
                                                  );
                                                }
                                                const cellClass = col.key === 'spend' ? 'text-right text-text-primary' :
                                                  col.key === 'messages' ? 'text-right font-medium text-text-primary' :
                                                  col.key === 'costPerMsg' ? `text-right font-bold ${getCostColor(adCostPerMsg)}` :
                                                  'text-right text-text-secondary';
                                                return <td key={col.key} className={`px-3 py-2 text-[11px] ${cellClass}`}>{renderAdCell(col, ad)}</td>;
                                              })}
                                            </tr>
                                          );
                                        })}
                                      </>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
