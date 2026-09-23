import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useGoogleAds } from '../../contexts/GoogleAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { dispatchLocalStorageMapUpdated } from '../../shared/utils/cloudBackup';
import { formatCurrency, formatNumber, formatPercent, getCostColor } from '../../shared/utils/format';
import { formatGoogleCustomerId, updateGoogleCampaignStatus, updateGoogleCampaignBudget } from '../../services/googleAdsApi';
import GoogleAdsIssues from '../../shared/components/GoogleAdsIssues';
import PeriodSelector from '../../shared/components/PeriodSelector';
import { GoogleAdsIcon } from '../../shared/components/PlatformIcons';

import {
  ChevronDown, ChevronRight, ChevronUp, Loader2, RefreshCw, Settings2,
  DollarSign, Check, X, Info, GripVertical, Link2,
} from 'lucide-react';

const ALL_COLUMNS = [
  { key: 'name', label: 'Conta / Cliente', align: 'left' },
  { key: 'budget', label: 'Orçamento', align: 'center' },
  { key: 'spend', label: 'Gasto', align: 'right' },
  { key: 'impressions', label: 'Impressões', align: 'right' },
  { key: 'clicks', label: 'Cliques', align: 'right' },
  { key: 'cpc', label: 'CPC', align: 'right' },
  { key: 'ctr', label: 'CTR', align: 'right' },
  { key: 'cpm', label: 'CPM', align: 'right' },
  { key: 'conversions', label: 'Conversões', align: 'right' },
  { key: 'costPerConversion', label: 'Custo/Conv.', align: 'right' },
  { key: 'conversionsValue', label: 'Valor Conv.', align: 'right' },
];
const DEFAULT_COLUMN_ORDER = ALL_COLUMNS.map(c => c.key);
const COLUMN_ORDER_KEY = 'google_ads_column_order';

function normalizeColumnOrder(savedOrder) {
  const validKeys = new Set(DEFAULT_COLUMN_ORDER);
  const sanitized = Array.isArray(savedOrder)
    ? savedOrder.filter(key => validKeys.has(key))
    : [];

  const missing = DEFAULT_COLUMN_ORDER.filter(key => !sanitized.includes(key));
  return [...sanitized, ...missing];
}


// ── Toggle Switch (mesmo padrão da aba Meta Ads) ──
const AdsToggle = React.memo(function AdsToggle({ isActive, isToggling, onToggle, size = 'md', title }) {
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
      className={`relative inline-flex items-center ${s.w} ${s.h} rounded-full transition-all duration-300 ease-in-out flex-shrink-0 ${isToggling
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
          className={`${s.dot} rounded-full bg-white shadow-md transform transition-transform duration-300 ease-in-out absolute top-[2px] ${isActive ? s.translate : 'translate-x-[2px]'
            }`}
        />
      )}
    </button>
  );
});

// ── Budget Edit Inline Component ──
const BudgetEditor = React.memo(function BudgetEditor({ currentBudget, onSave, saving }) {
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
});

// ── Badge de orçamento compartilhado ──
const SharedBudgetBadge = React.memo(function SharedBudgetBadge({ amount }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-primary/8 text-primary-light border border-primary/15"
      title="Orçamento compartilhado entre várias campanhas — edite no Google Ads para não afetar as demais"
    >
      <Info size={9} />
      {amount > 0 ? `${formatCurrency(amount)} compartilhado` : 'Compartilhado'}
    </span>
  );
});

// ── Cards de resumo ──
// ── Helper: orçamento diário total das campanhas ativas (sem contar 2x orçamento compartilhado) ──
function getTotalBudget(accountCampaigns) {
  let total = 0;
  const countedSharedBudgets = new Set();

  for (const campaign of accountCampaigns) {
    if (campaign.status !== 'active') continue;
    const amount = campaign.dailyBudget || 0;
    if (amount <= 0) continue;

    if (campaign.budgetShared && campaign.budgetId) {
      if (countedSharedBudgets.has(campaign.budgetId)) continue;
      countedSharedBudgets.add(campaign.budgetId);
    }
    total += amount;
  }

  return total;
}

const CHANNEL_LABELS = {
  SEARCH: 'Rede de Pesquisa',
  DISPLAY: 'Rede de Display',
  SHOPPING: 'Shopping',
  VIDEO: 'Vídeo',
  MULTI_CHANNEL: 'Performance Max',
  PERFORMANCE_MAX: 'Performance Max',
  LOCAL: 'Local',
  SMART: 'Smart',
  DISCOVERY: 'Discovery',
  DEMAND_GEN: 'Demand Gen',
};

function formatChannelType(channelType) {
  if (!channelType) return 'Campanha';
  return CHANNEL_LABELS[channelType] || channelType;
}

export default function GoogleAdsOverview() {
  const { accounts, campaigns, selectedPeriod, setSelectedPeriod, loading, error, accountErrors, connectionWarnings, hasConnection, refreshData } = useGoogleAds();
  const { agencies, accountAgencies } = useAgency();
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [selectedAgency, setSelectedAgency] = useState('all');
  const [expandedAccount, setExpandedAccount] = useState(null);
  const [togglingCampaigns, setTogglingCampaigns] = useState({});
  const [savingBudgets, setSavingBudgets] = useState({});
  const [statusOverrides, setStatusOverrides] = useState({});
  const [budgetOverrides, setBudgetOverrides] = useState({});
  const [actionError, setActionError] = useState(null);
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY));
      if (!saved || !saved.includes('name')) return DEFAULT_COLUMN_ORDER;
      return normalizeColumnOrder(saved);
    } catch { return DEFAULT_COLUMN_ORDER; }
  });
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [draggedColumnKey, setDraggedColumnKey] = useState(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState(null);

  const orderedColumns = columnOrder.map(key => ALL_COLUMNS.find(c => c.key === key)).filter(Boolean);
  const showBudgetColumn = expandedAccount !== null;

  const getSpendValue = useCallback((item) => Number(item?.metrics?.spend || 0), []);

  const persistColumnOrder = useCallback((nextOrder) => {
    const normalized = normalizeColumnOrder(nextOrder);
    setColumnOrder(normalized);
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(normalized));
    dispatchLocalStorageMapUpdated(COLUMN_ORDER_KEY, normalized);
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
    if (dragOverColumnKey !== key) setDragOverColumnKey(key);
  }, [dragOverColumnKey]);

  const handleColumnDrop = useCallback((targetKey) => {
    if (!draggedColumnKey || draggedColumnKey === targetKey) {
      setDraggedColumnKey(null);
      setDragOverColumnKey(null);
      return;
    }

    const targetIndex = columnOrder.indexOf(targetKey);
    if (targetIndex !== -1) moveColumnToIndex(draggedColumnKey, targetIndex);

    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
  }, [columnOrder, draggedColumnKey, moveColumnToIndex]);

  const handleColumnDragEnd = useCallback(() => {
    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
  }, []);

  const resetColumnOrder = () => persistColumnOrder(DEFAULT_COLUMN_ORDER);

  // ── Cell Renderers ──
  const renderMetricCell = (col, metrics) => {
    const m = metrics || {};
    switch (col.key) {
      case 'spend': return formatCurrency(m.spend || 0);
      case 'impressions': return formatNumber(m.impressions || 0);
      case 'clicks': return formatNumber(m.clicks || 0);
      case 'cpc': return m.cpc > 0 ? formatCurrency(m.cpc) : '—';
      case 'ctr': return m.ctr > 0 ? formatPercent(m.ctr) : '—';
      case 'cpm': return m.cpm > 0 ? formatCurrency(m.cpm) : '—';
      case 'conversions': return m.conversions > 0 ? formatNumber(Math.round(m.conversions)) : '—';
      case 'costPerConversion': return m.costPerConversion > 0 ? formatCurrency(m.costPerConversion) : '—';
      case 'conversionsValue': return m.conversionsValue > 0 ? formatCurrency(m.conversionsValue) : '—';
      default: return '—';
    }
  };

  // ── Filtros ──
  const agencyFilteredAccounts = useMemo(() => {
    if (selectedAgency === 'all') return accounts;
    return accounts.filter(a => accountAgencies[a.id] === selectedAgency || accountAgencies[a.accountId] === selectedAgency);
  }, [accounts, selectedAgency, accountAgencies]);

  const filteredAccounts = useMemo(() => {
    const visibleAccounts = selectedAccount === 'all'
      ? agencyFilteredAccounts
      : agencyFilteredAccounts.filter(a => a.id === selectedAccount);

    return [...visibleAccounts].sort((a, b) => getSpendValue(b) - getSpendValue(a));
  }, [agencyFilteredAccounts, getSpendValue, selectedAccount]);

  // Aplica as alterações otimistas de status/orçamento em cima dos dados do React Query.
  const resolveCampaign = useCallback((campaign) => {
    const status = statusOverrides[campaign.id] || campaign.status;
    const dailyBudget = budgetOverrides[campaign.id] ?? campaign.dailyBudget;
    if (status === campaign.status && dailyBudget === campaign.dailyBudget) return campaign;
    return { ...campaign, status, dailyBudget };
  }, [budgetOverrides, statusOverrides]);

  const getCampaignsForAccount = useCallback((accountId) => {
    return campaigns
      .filter(c => c.accountId === accountId)
      .map(resolveCampaign)
      .sort((a, b) => getSpendValue(b) - getSpendValue(a));
  }, [campaigns, getSpendValue, resolveCampaign]);

  // ── Ações ──
  const handleToggleCampaign = async (campaign, account) => {
    const isActive = campaign.status === 'active';
    const nextStatus = isActive ? 'PAUSED' : 'ENABLED';

    setActionError(null);
    setTogglingCampaigns(prev => ({ ...prev, [campaign.id]: true }));
    try {
      await updateGoogleCampaignStatus(account.accountId, campaign.id, nextStatus, account.connectionId);
      setStatusOverrides(prev => ({ ...prev, [campaign.id]: isActive ? 'paused' : 'active' }));
      refreshData();
    } catch (err) {
      setActionError(`Erro ao alterar a campanha "${campaign.name}": ${err.message}`);
    } finally {
      setTogglingCampaigns(prev => ({ ...prev, [campaign.id]: false }));
    }
  };

  const handleUpdateCampaignBudget = async (campaign, account, newBudget) => {
    if (!campaign.budgetId) {
      setActionError(`A campanha "${campaign.name}" não retornou o orçamento associado. Sincronize as contas e tente novamente.`);
      return;
    }

    setActionError(null);
    setSavingBudgets(prev => ({ ...prev, [campaign.id]: true }));
    try {
      await updateGoogleCampaignBudget(account.accountId, campaign.budgetId, newBudget, account.connectionId);
      setBudgetOverrides(prev => ({ ...prev, [campaign.id]: newBudget }));
      refreshData();
    } catch (err) {
      setActionError(`Erro ao alterar o orçamento de "${campaign.name}": ${err.message}`);
    } finally {
      setSavingBudgets(prev => ({ ...prev, [campaign.id]: false }));
    }
  };

  const header = (
    <div className="flex items-center gap-3 mb-1">
      <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
        <GoogleAdsIcon className="w-6 h-6 text-white" mono />
      </div>
      <div>
        <h1 className="text-lg sm:text-2xl font-bold text-text-primary tracking-tight">Google Ads — Visão Geral</h1>
      </div>
    </div>
  );

  if (!hasConnection) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-4 sm:p-6">{header}</div>
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-16 text-center">
          <GoogleAdsIcon className="w-10 h-10" />
          <p className="text-sm text-text-secondary">Nenhum perfil Google conectado ainda.</p>
          <a
            href="/configuracoes"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#34A853] text-white hover:bg-[#2b8c46] transition-colors"
          >
            <Link2 size={15} /> Conectar Google Ads
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-4 sm:p-6">{header}</div>
        <div className="flex items-center justify-center h-64 text-text-secondary">
          Carregando dados do Google Ads...
        </div>
      </div>
    );
  }

  if (error && accounts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-4 sm:p-6">{header}</div>
        <div className="flex flex-col items-center justify-center gap-4 h-64 text-danger">
          <span>Erro ao carregar dados: {error}</span>
          <button
            onClick={refreshData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-primary hover:border-primary/40 transition-all"
          >
            <RefreshCw size={16} /> Tentar novamente
          </button>
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

        <div className="relative">{header}</div>

        {/* Filtros */}
        <div className="relative mt-7 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end justify-between gap-4 sm:gap-5">
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3 sm:gap-5 w-full sm:w-auto">
            <div className="flex flex-col gap-1.5 w-full sm:w-[210px] z-50">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Período</label>
              <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} className="w-full" align="left" />
            </div>

            {agencies.length > 0 && (
              <div className="flex flex-col gap-1.5 w-full sm:w-[210px]">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Agência</label>
                <select
                  value={selectedAgency}
                  onChange={e => { setSelectedAgency(e.target.value); setSelectedAccount('all'); }}
                  className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
                >
                  <option value="all">Todas as agências</option>
                  {agencies.map(ag => <option key={ag} value={ag}>{ag}</option>)}
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
                  <option key={a.id} value={a.id}>{a.clientName}</option>
                ))}
              </select>
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

      {actionError && (
        <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/20 px-4 py-3 rounded-xl">
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-danger/60 hover:text-danger text-xs font-bold">x</button>
        </div>
      )}

      <GoogleAdsIssues issues={[...accountErrors, ...connectionWarnings]} error={error} />

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
                  className={`group flex items-center gap-3 rounded-xl border px-3 py-3 transition-all ${isDragging
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
                        ? 'Identificação principal da conta e expansão das campanhas.'
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
                <span className="font-semibold text-text-primary">{columnOrder.indexOf(col.key) + 1}.</span>
                <span>{col.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cards mobile */}
      <div className="sm:hidden space-y-3">
        {filteredAccounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-8 text-center text-sm text-text-secondary">
            Nenhuma conta encontrada com os filtros atuais.
          </div>
        ) : (
          filteredAccounts.map((account) => {
            const isExpanded = expandedAccount === account.id;
            const accountCampaigns = getCampaignsForAccount(account.accountId);
            const hasCampaigns = accountCampaigns.length > 0;
            const topCampaigns = accountCampaigns.slice(0, 3);

            return (
              <div key={account.id} className="rounded-2xl border border-border/60 bg-surface shadow-[0_2px_12px_-4px_rgba(0,0,0,0.3)] overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-text-primary truncate">{account.clientName}</span>
                        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${account.status === 'active' ? 'bg-success/10 text-success border-success/20' : 'bg-text-secondary/10 text-text-secondary border-border/40'}`}>
                          {account.status === 'active' ? 'Ativa' : 'Pausada'}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-text-secondary">
                        {formatGoogleCustomerId(account.accountId)} · {hasCampaigns ? `${accountCampaigns.length} campanha${accountCampaigns.length !== 1 ? 's' : ''}` : 'Sem campanhas no período'}
                      </p>
                    </div>

                    {hasCampaigns && (
                      <button
                        type="button"
                        onClick={() => setExpandedAccount(isExpanded ? null : account.id)}
                        className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-bg/70 text-text-secondary transition hover:border-primary/30 hover:text-text-primary"
                        aria-label={isExpanded ? 'Recolher conta' : 'Expandir conta'}
                      >
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-border/50 bg-bg/40 p-3">
                      <span className="block text-[10px] uppercase tracking-wider text-text-secondary">Gasto</span>
                      <span className="mt-1 block text-base font-bold text-text-primary">{formatCurrency(account.metrics?.spend || 0)}</span>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-bg/40 p-3">
                      <span className="block text-[10px] uppercase tracking-wider text-text-secondary">Conversões</span>
                      <span className="mt-1 block text-base font-bold text-text-primary">{formatNumber(Math.round(account.metrics?.conversions || 0))}</span>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-bg/40 p-3">
                      <span className="block text-[10px] uppercase tracking-wider text-text-secondary">Custo / Conv.</span>
                      <span className={`mt-1 block text-base font-bold ${getCostColor(account.metrics?.costPerConversion || 0)}`}>
                        {account.metrics?.costPerConversion > 0 ? formatCurrency(account.metrics.costPerConversion) : '—'}
                      </span>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-bg/40 p-3">
                      <span className="block text-[10px] uppercase tracking-wider text-text-secondary">Cliques</span>
                      <span className="mt-1 block text-base font-bold text-text-primary">{formatNumber(account.metrics?.clicks || 0)}</span>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-bg/40 p-3">
                      <span className="block text-[10px] uppercase tracking-wider text-text-secondary">CTR</span>
                      <span className="mt-1 block text-base font-bold text-text-primary">
                        {account.metrics?.ctr > 0 ? formatPercent(account.metrics.ctr) : '—'}
                      </span>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-bg/40 p-3">
                      <span className="block text-[10px] uppercase tracking-wider text-text-secondary">Orçamento/dia</span>
                      <span className="mt-1 block text-base font-bold text-text-primary">
                        {getTotalBudget(accountCampaigns) > 0 ? formatCurrency(getTotalBudget(accountCampaigns)) : '—'}
                      </span>
                    </div>
                  </div>

                  {isExpanded && hasCampaigns && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Campanhas</span>
                        <span className="text-[11px] text-text-secondary">{topCampaigns.length}/{accountCampaigns.length} exibidas</span>
                      </div>

                      {topCampaigns.map((campaign) => (
                        <div key={campaign.id} className="rounded-xl border border-border/50 bg-bg/35 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <AdsToggle
                                  isActive={campaign.status === 'active'}
                                  isToggling={!!togglingCampaigns[campaign.id]}
                                  onToggle={(e) => { e.stopPropagation(); handleToggleCampaign(campaign, account); }}
                                  size="sm"
                                  title={campaign.status === 'active' ? 'Pausar campanha' : 'Ativar campanha'}
                                />
                                <span className="truncate text-sm font-medium text-text-primary">{campaign.name}</span>
                              </div>
                              <p className="mt-1 text-[11px] text-text-secondary">{formatChannelType(campaign.channelType)}</p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded-lg border border-border/40 bg-surface/60 p-2">
                              <span className="block text-text-secondary uppercase tracking-wider">Gasto</span>
                              <span className="mt-1 block font-semibold text-text-primary">{formatCurrency(campaign.metrics?.spend || 0)}</span>
                            </div>
                            <div className="rounded-lg border border-border/40 bg-surface/60 p-2">
                              <span className="block text-text-secondary uppercase tracking-wider">Conversões</span>
                              <span className="mt-1 block font-semibold text-text-primary">{formatNumber(Math.round(campaign.metrics?.conversions || 0))}</span>
                            </div>
                            <div className="rounded-lg border border-border/40 bg-surface/60 p-2">
                              <span className="block text-text-secondary uppercase tracking-wider">Custo / Conv.</span>
                              <span className={`mt-1 block font-semibold ${getCostColor(campaign.metrics?.costPerConversion || 0)}`}>
                                {campaign.metrics?.costPerConversion > 0 ? formatCurrency(campaign.metrics.costPerConversion) : '—'}
                              </span>
                            </div>
                            <div className="rounded-lg border border-border/40 bg-surface/60 p-2">
                              <span className="block text-text-secondary uppercase tracking-wider">Orçamento</span>
                              <span className="mt-1 block font-semibold text-text-primary">
                                {campaign.dailyBudget > 0 ? formatCurrency(campaign.dailyBudget) : '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}

                      {accountCampaigns.length > topCampaigns.length && (
                        <p className="px-1 text-[11px] text-text-secondary">
                          +{accountCampaigns.length - topCampaigns.length} campanhas adicionais
                        </p>
                      )}
                    </div>
                  )}

                  {!hasCampaigns && (
                    <div className="mt-4 rounded-xl border border-dashed border-border/60 bg-bg/30 px-3 py-3 text-xs text-text-secondary">
                      Nenhuma campanha encontrada para esta conta no período atual.
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Tabela */}
      <div className="hidden sm:block bg-surface rounded-2xl border border-border overflow-hidden shadow-[0_2px_12px_-4px_rgba(0,0,0,0.3)]">
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
              {filteredAccounts.length === 0 && (
                <tr>
                  <td colSpan={orderedColumns.length} className="px-4 py-10 text-center text-sm text-text-secondary">
                    Nenhuma conta encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
              {filteredAccounts.map((account, i) => {
                const isExpanded = expandedAccount === account.id;
                const accountCampaigns = getCampaignsForAccount(account.accountId);
                const hasCampaigns = accountCampaigns.length > 0;
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
                              <div className="flex flex-col leading-tight">
                                <span>{account.clientName}</span>
                                <span className="text-[11px] font-normal text-text-secondary">{formatGoogleCustomerId(account.accountId)}</span>
                              </div>
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
                          col.key === 'conversions' ? 'text-right font-medium text-text-primary' :
                            col.key === 'costPerConversion' ? `text-right font-bold ${getCostColor(account.metrics?.costPerConversion || 0)}` :
                              'text-right text-text-secondary';
                        return <td key={col.key} className={`px-3 py-3 ${cellClass}`}>{renderMetricCell(col, account.metrics)}</td>;
                      })}
                    </tr>

                    {/* Campanhas expandidas */}
                    {isExpanded && accountCampaigns.map(campaign => {
                      const isToggling = !!togglingCampaigns[campaign.id];
                      const isActive = campaign.status === 'active';

                      return (
                        <tr key={campaign.id} className="bg-bg/60 border-b border-border/30">
                          <td className="px-2 py-2.5"></td>
                          {orderedColumns.map(col => {
                            if (col.key === 'name') {
                              return (
                                <td key={col.key} className="px-4 py-2.5 pl-8">
                                  <div className="flex items-center gap-3">
                                    <AdsToggle
                                      isActive={isActive}
                                      isToggling={isToggling}
                                      onToggle={(e) => { e.stopPropagation(); handleToggleCampaign(campaign, account); }}
                                      title={isActive ? 'Pausar campanha' : 'Ativar campanha'}
                                    />
                                    <div>
                                      <span className="text-sm text-text-primary">{campaign.name}</span>
                                      <span className="text-xs text-text-secondary ml-2">({formatChannelType(campaign.channelType)})</span>
                                    </div>
                                  </div>
                                </td>
                              );
                            }
                            if (col.key === 'budget') {
                              if (!showBudgetColumn) return null;
                              return (
                                <td key={col.key} className="px-3 py-2.5 text-center">
                                  {campaign.budgetShared ? (
                                    <SharedBudgetBadge amount={campaign.dailyBudget || 0} />
                                  ) : (
                                    <BudgetEditor
                                      currentBudget={campaign.dailyBudget || 0}
                                      onSave={(val) => handleUpdateCampaignBudget(campaign, account, val)}
                                      saving={savingBudgets[campaign.id]}
                                    />
                                  )}
                                </td>
                              );
                            }
                            const cellClass = col.key === 'spend' ? 'text-right text-text-primary' :
                              col.key === 'conversions' ? 'text-right font-medium text-text-primary' :
                                col.key === 'costPerConversion' ? `text-right font-bold ${getCostColor(campaign.metrics?.costPerConversion || 0)}` :
                                  'text-right text-text-secondary';
                            return <td key={col.key} className={`px-3 py-2.5 ${cellClass}`}>{renderMetricCell(col, campaign.metrics)}</td>;
                          })}
                        </tr>
                      );
                    })}

                    {isExpanded && !hasCampaigns && (
                      <tr className="bg-bg/40 border-b border-border/20">
                        <td colSpan={orderedColumns.length + 1} className="py-3 text-center text-xs text-text-secondary">
                          Nenhuma campanha encontrada no período
                        </td>
                      </tr>
                    )}
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
