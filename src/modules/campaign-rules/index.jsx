import { useState, useEffect, useMemo, useCallback } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { formatCurrency } from '../../shared/utils/format';
import {
  Scale, Plus, Trash2, ToggleLeft, ToggleRight,
  Pause, Play, DollarSign, AlertTriangle, CheckCircle2,
  Clock, Zap
} from 'lucide-react';

const STORAGE_KEY = 'campaign_rules';

function generateId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function loadRules() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRules(rules) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export default function CampaignRules() {
  const { accounts, campaigns } = useMetaAds();

  const [rules, setRules] = useState(loadRules);
  const [toast, setToast] = useState(null);

  // Form state
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState('all');
  const [spendLimit, setSpendLimit] = useState('');
  const [action] = useState('pause');

  // Persist rules
  useEffect(() => {
    saveRules(rules);
  }, [rules]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Campaigns filtered by selected account
  const filteredCampaigns = useMemo(
    () => selectedAccountId ? campaigns.filter(c => c.accountId === selectedAccountId) : [],
    [campaigns, selectedAccountId]
  );

  // Build a lookup: campaignId -> campaign
  const campaignMap = useMemo(
    () => new Map(campaigns.map(c => [c.id, c])),
    [campaigns]
  );

  // Build a lookup: accountId -> account
  const accountMap = useMemo(
    () => new Map(accounts.map(a => [a.id, a])),
    [accounts]
  );

  // Check rules against current spend
  const evaluateRules = useCallback(() => {
    let changed = false;
    const updated = rules.map(rule => {
      if (!rule.enabled || rule.triggered) return rule;

      let relevantCampaigns;
      if (rule.campaignId === 'all') {
        relevantCampaigns = campaigns.filter(c => c.accountId === rule.accountId);
      } else {
        const camp = campaignMap.get(rule.campaignId);
        relevantCampaigns = camp ? [camp] : [];
      }

      const totalSpend = relevantCampaigns.reduce((sum, c) => sum + (c.metrics?.spend || 0), 0);

      if (totalSpend >= rule.spendLimit) {
        changed = true;
        // TODO: Call Meta API to pause campaign when write permissions are available
        return { ...rule, triggered: true, triggeredAt: new Date().toISOString() };
      }
      return rule;
    });

    if (changed) {
      setRules(updated);
      setToast({ type: 'warning', message: 'Uma ou mais regras foram disparadas!' });
    }
  }, [rules, campaigns, campaignMap]);

  // Evaluate on campaigns data change
  useEffect(() => {
    if (campaigns.length > 0 && rules.length > 0) {
      evaluateRules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns]);

  // Get current spend for a rule
  const getRuleSpend = useCallback((rule) => {
    if (rule.campaignId === 'all') {
      return campaigns
        .filter(c => c.accountId === rule.accountId)
        .reduce((sum, c) => sum + (c.metrics?.spend || 0), 0);
    }
    const camp = campaignMap.get(rule.campaignId);
    return camp?.metrics?.spend || 0;
  }, [campaigns, campaignMap]);

  // Create rule
  const handleCreateRule = () => {
    if (!selectedAccountId) {
      setToast({ type: 'error', message: 'Selecione uma conta' });
      return;
    }
    const limit = parseFloat(spendLimit);
    if (!limit || limit <= 0) {
      setToast({ type: 'error', message: 'Informe um limite de gasto valido' });
      return;
    }

    const newRule = {
      id: generateId(),
      accountId: selectedAccountId,
      campaignId: selectedCampaignId,
      type: 'spend_limit',
      spendLimit: limit,
      action,
      enabled: true,
      triggered: false,
      triggeredAt: null,
      createdAt: new Date().toISOString(),
    };

    setRules(prev => [newRule, ...prev]);
    setSpendLimit('');
    setSelectedCampaignId('all');
    setToast({ type: 'success', message: 'Regra criada com sucesso!' });
  };

  // Toggle rule
  const toggleRule = (id) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  // Delete rule
  const deleteRule = (id) => {
    setRules(prev => prev.filter(r => r.id !== id));
    setToast({ type: 'success', message: 'Regra removida' });
  };

  // Get campaign display name
  const getCampaignName = (rule) => {
    if (rule.campaignId === 'all') {
      const acc = accountMap.get(rule.accountId);
      return `todas as campanhas de ${acc?.clientName || 'conta desconhecida'}`;
    }
    const camp = campaignMap.get(rule.campaignId);
    return camp?.name || 'campanha desconhecida';
  };

  // Get rule status
  const getRuleStatus = (rule) => {
    if (rule.triggered) return { label: 'Disparada', color: 'text-warning', bg: 'bg-warning/10 border-warning/20' };
    if (!rule.enabled) return { label: 'Pausada', color: 'text-text-secondary', bg: 'bg-text-secondary/10 border-border' };
    return { label: 'Ativa', color: 'text-success', bg: 'bg-success/10 border-success/20' };
  };

  // Progress bar color
  const getProgressColor = (pct) => {
    if (pct >= 90) return 'bg-danger';
    if (pct >= 70) return 'bg-warning';
    return 'bg-success';
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm flex items-center gap-2 text-sm font-medium animate-in slide-in-from-top-2 ${
          toast.type === 'success' ? 'bg-success/10 border-success/20 text-success' :
          toast.type === 'error' ? 'bg-danger/10 border-danger/20 text-danger' :
          'bg-warning/10 border-warning/20 text-warning'
        }`}>
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
          {toast.type === 'error' && <AlertTriangle className="w-4 h-4" />}
          {toast.type === 'warning' && <Zap className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Scale className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">Regras de Campanha</h1>
        </div>
        <p className="text-text-secondary text-sm ml-10">
          Automatize a gestao de campanhas com regras de gasto
        </p>
      </div>

      {/* Create Rule Card */}
      <div className="bg-surface/50 rounded-2xl border border-border/50 p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-primary" />
          Criar Nova Regra
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Account Select */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Conta</label>
            <select
              value={selectedAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                setSelectedCampaignId('all');
              }}
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            >
              <option value="">Selecione uma conta</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.clientName}</option>
              ))}
            </select>
          </div>

          {/* Campaign Select */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Campanha</label>
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              disabled={!selectedAccountId}
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="all">Todas as campanhas</option>
              {filteredCampaigns.map(camp => (
                <option key={camp.id} value={camp.id}>{camp.name}</option>
              ))}
            </select>
          </div>

          {/* Spend Limit */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Limite de Gasto (R$)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={spendLimit}
                onChange={(e) => setSpendLimit(e.target.value)}
                placeholder="0,00"
                className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-text-secondary/50"
              />
            </div>
          </div>

          {/* Action Select */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Acao</label>
            <select
              value={action}
              disabled
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-70"
            >
              <option value="pause">Pausar campanha</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleCreateRule}
          className="mt-4 px-6 py-2.5 bg-gradient-to-r from-primary to-primary-light text-white rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-primary/25 transition-all duration-200 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Criar Regra
        </button>
      </div>

      {/* Active Rules */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Regras Ativas
          {rules.length > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {rules.length}
            </span>
          )}
        </h2>

        {rules.length === 0 ? (
          <div className="bg-surface/50 rounded-2xl border border-border/50 p-12 text-center">
            <Scale className="w-10 h-10 text-text-secondary/40 mx-auto mb-3" />
            <p className="text-text-secondary text-sm">Nenhuma regra criada ainda</p>
            <p className="text-text-secondary/60 text-xs mt-1">Crie sua primeira regra acima para automatizar a gestao de campanhas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => {
              const spend = getRuleSpend(rule);
              const pct = rule.spendLimit > 0 ? Math.min((spend / rule.spendLimit) * 100, 100) : 0;
              const status = getRuleStatus(rule);

              return (
                <div
                  key={rule.id}
                  className={`bg-surface/50 rounded-2xl border border-border/50 p-5 transition-all duration-200 ${
                    rule.triggered ? 'border-warning/30' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Icon + Info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        rule.triggered ? 'bg-warning/10' : rule.enabled ? 'bg-primary/10' : 'bg-text-secondary/10'
                      }`}>
                        <DollarSign className={`w-5 h-5 ${
                          rule.triggered ? 'text-warning' : rule.enabled ? 'text-primary' : 'text-text-secondary'
                        }`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Pause className="w-3.5 h-3.5 text-text-secondary" />
                          <span className="text-sm font-medium text-text-primary">
                            Pausar <span className="text-primary">{getCampaignName(rule)}</span> quando gastar {formatCurrency(rule.spendLimit)}
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-2 max-w-md">
                          <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                            <span>{formatCurrency(spend)} gastos</span>
                            <span>{pct.toFixed(0)}% do limite</span>
                          </div>
                          <div className="h-2 bg-background rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${getProgressColor(pct)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        {/* Meta info */}
                        <div className="flex items-center gap-3 mt-2 text-xs text-text-secondary">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(rule.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                          {rule.triggeredAt && (
                            <span className="flex items-center gap-1 text-warning">
                              <Zap className="w-3 h-3" />
                              Disparada em {new Date(rule.triggeredAt).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Status + Actions */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${status.bg} ${status.color}`}>
                        {status.label}
                      </span>

                      <button
                        onClick={() => toggleRule(rule.id)}
                        className="p-1.5 rounded-lg hover:bg-background transition-colors"
                        title={rule.enabled ? 'Desativar regra' : 'Ativar regra'}
                      >
                        {rule.enabled ? (
                          <ToggleRight className="w-6 h-6 text-primary" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-text-secondary" />
                        )}
                      </button>

                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="p-1.5 rounded-lg hover:bg-danger/10 transition-colors group"
                        title="Remover regra"
                      >
                        <Trash2 className="w-4 h-4 text-text-secondary group-hover:text-danger" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How it Works */}
      <div className="bg-surface/50 rounded-2xl border border-border/50 p-6">
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" />
          Como funciona
        </h3>
        <ul className="space-y-2 text-xs text-text-secondary">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 flex-shrink-0" />
            As regras sao verificadas a cada atualizacao dos dados
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 flex-shrink-0" />
            Quando o gasto atinge o limite, a campanha e pausada automaticamente via API
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 flex-shrink-0" />
            Requer token Meta com permissao de escrita (ads_management)
          </li>
        </ul>
      </div>
    </div>
  );
}
