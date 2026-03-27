import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bell, AlertTriangle, TrendingDown, DollarSign, Plus, Trash2,
  Settings, ToggleLeft, ToggleRight, CheckCircle2
} from 'lucide-react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';

const STORAGE_KEY = 'auto_alert_rules';

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

function loadBalances() {
  try {
    return JSON.parse(localStorage.getItem('meta_balances')) || [];
  } catch {
    return [];
  }
}

export default function AutoAlerts() {
  const { accounts, balances: contextBalances } = useMetaAds();
  const { accountAgencies } = useAgency();

  const [rules, setRules] = useState(loadRules);
  const [newType, setNewType] = useState('balance_low');
  const [newAccountId, setNewAccountId] = useState('all');
  const [newThreshold, setNewThreshold] = useState('');

  // Persist rules on change
  useEffect(() => {
    saveRules(rules);
  }, [rules]);

  // Merge balances from context and localStorage fallback
  const balances = useMemo(() => {
    if (contextBalances && contextBalances.length > 0) return contextBalances;
    return loadBalances();
  }, [contextBalances]);

  const balanceMap = useMemo(
    () => new Map(balances.map(b => [b.accountId, b])),
    [balances]
  );

  const accountMap = useMemo(
    () => new Map(accounts.map(a => [a.id, a])),
    [accounts]
  );

  const getAccountLabel = useCallback((accountId) => {
    if (accountId === 'all') return 'Todas as contas';
    const account = accountMap.get(accountId);
    if (account) return account.name || account.accountId || accountId;
    return accountId;
  }, [accountMap]);

  // Create a new rule
  const handleCreateRule = () => {
    const threshold = parseFloat(newThreshold);
    if (isNaN(threshold) || threshold <= 0) return;

    const rule = {
      id: generateId(),
      type: newType,
      accountId: newAccountId,
      enabled: true,
      threshold,
      createdAt: new Date().toISOString(),
    };

    setRules(prev => [...prev, rule]);
    setNewThreshold('');
  };

  const handleToggleRule = (ruleId) => {
    setRules(prev =>
      prev.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r)
    );
  };

  const handleDeleteRule = (ruleId) => {
    setRules(prev => prev.filter(r => r.id !== ruleId));
  };

  // Evaluate triggered alerts from active rules
  const triggeredAlerts = useMemo(() => {
    const alerts = [];

    rules.filter(r => r.enabled).forEach(rule => {
      if (rule.type === 'balance_low') {
        const targetAccounts = rule.accountId === 'all'
          ? accounts
          : accounts.filter(a => a.id === rule.accountId);

        targetAccounts.forEach(account => {
          const balance = balanceMap.get(account.id);
          const currentBalance = balance?.currentBalance ?? null;

          if (currentBalance !== null && currentBalance < rule.threshold) {
            const agencyName = accountAgencies[account.id];
            alerts.push({
              id: `${rule.id}-${account.id}`,
              ruleId: rule.id,
              type: 'balance_low',
              severity: currentBalance < rule.threshold * 0.5 ? 'danger' : 'warning',
              accountName: account.name || account.accountId || account.id,
              agencyName: agencyName || null,
              message: `Saldo de R$ ${currentBalance.toFixed(2)} esta abaixo do limite de R$ ${rule.threshold.toFixed(2)}`,
              currentValue: currentBalance,
              threshold: rule.threshold,
            });
          }
        });
      }
      // Performance drop alerts are evaluated as placeholder
      if (rule.type === 'performance_drop') {
        alerts.push({
          id: `${rule.id}-perf`,
          ruleId: rule.id,
          type: 'performance_drop',
          severity: 'info',
          accountName: getAccountLabel(rule.accountId),
          agencyName: null,
          message: `Monitoramento em tempo real (proxima atualizacao)`,
          currentValue: null,
          threshold: rule.threshold,
        });
      }
    });

    return alerts;
  }, [rules, accounts, balanceMap, accountAgencies, getAccountLabel]);

  const dangerAlerts = triggeredAlerts.filter(a => a.severity === 'danger');
  const warningAlerts = triggeredAlerts.filter(a => a.severity === 'warning');
  const infoAlerts = triggeredAlerts.filter(a => a.severity === 'info');

  const severityConfig = {
    danger: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', icon: AlertTriangle },
    warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', icon: AlertTriangle },
    info: { bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-primary-light', icon: TrendingDown },
  };

  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="relative z-10 rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-6 mb-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
              <Bell size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary tracking-tight">Avisos Automaticos</h1>
              <p className="text-sm text-text-secondary">Configure alertas para monitorar saldo e desempenho</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ CREATE RULE ═══ */}
      <div className="bg-surface/50 rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3">
          <Settings size={18} className="text-primary-light" />
          <div>
            <h2 className="text-lg font-bold text-text-primary">Criar Regra de Alerta</h2>
            <p className="text-xs text-text-secondary">Defina quando voce quer ser notificado</p>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Type selector */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Tipo de alerta</label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-primary transition-colors"
              >
                <option value="balance_low">Saldo Baixo</option>
                <option value="performance_drop">Queda de Desempenho</option>
              </select>
            </div>

            {/* Account selector */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Conta</label>
              <select
                value={newAccountId}
                onChange={e => setNewAccountId(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-primary transition-colors"
              >
                <option value="all">Todas as contas</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name || account.accountId || account.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Threshold input */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Limite {newType === 'balance_low' ? '(R$)' : '(%)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">
                  {newType === 'balance_low' ? 'R$' : '%'}
                </span>
                <input
                  type="number"
                  min="0"
                  step={newType === 'balance_low' ? '10' : '1'}
                  value={newThreshold}
                  onChange={e => setNewThreshold(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateRule(); }}
                  placeholder={newType === 'balance_low' ? '100' : '30'}
                  className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            {/* Create button */}
            <div className="flex items-end">
              <button
                onClick={handleCreateRule}
                disabled={!newThreshold || parseFloat(newThreshold) <= 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary-light text-white rounded-lg text-sm font-bold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
              >
                <Plus size={16} />
                Criar Alerta
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ACTIVE RULES ═══ */}
      <div className="bg-surface/50 rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell size={18} className="text-primary-light" />
            <div>
              <h2 className="text-lg font-bold text-text-primary">Regras Ativas</h2>
              <p className="text-xs text-text-secondary">{rules.length} regra(s) configurada(s)</p>
            </div>
          </div>
        </div>

        {rules.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Bell size={32} className="mx-auto text-text-secondary/30 mb-3" />
            <p className="text-sm text-text-secondary">Nenhuma regra de alerta configurada</p>
            <p className="text-xs text-text-secondary/60 mt-1">Crie uma regra acima para comecar a monitorar</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {rules.map(rule => {
              const isBalance = rule.type === 'balance_low';
              const Icon = isBalance ? DollarSign : TrendingDown;
              const typeLabel = isBalance ? 'Saldo Baixo' : 'Queda de Desempenho';
              const thresholdLabel = isBalance
                ? `R$ ${rule.threshold.toFixed(2)}`
                : `${rule.threshold}%`;
              const accountLabel = getAccountLabel(rule.accountId);

              return (
                <div
                  key={rule.id}
                  className={`px-6 py-4 flex items-center justify-between transition-colors hover:bg-surface-hover/50 ${!rule.enabled ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isBalance ? 'bg-amber-500/10' : 'bg-red-500/10'}`}>
                      <Icon size={20} className={isBalance ? 'text-amber-400' : 'text-red-400'} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isBalance ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                          {typeLabel}
                        </span>
                      </div>
                      <p className="text-sm text-text-primary mt-1">
                        Alertar quando {isBalance ? 'saldo' : 'desempenho cair'} {isBalance ? '<' : '>'} <span className="font-bold">{thresholdLabel}</span> na conta <span className="font-medium">{accountLabel}</span>
                      </p>
                      <p className="text-xs text-text-secondary/60 mt-0.5">
                        Criado em {new Date(rule.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <button
                      onClick={() => handleToggleRule(rule.id)}
                      className="transition-colors"
                      title={rule.enabled ? 'Desativar regra' : 'Ativar regra'}
                    >
                      {rule.enabled
                        ? <ToggleRight size={28} className="text-emerald-400" />
                        : <ToggleLeft size={28} className="text-text-secondary/40" />
                      }
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1.5 rounded-lg text-text-secondary/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remover regra"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ TRIGGERED ALERTS ═══ */}
      <div className="bg-surface/50 rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-400" />
            <div>
              <h2 className="text-lg font-bold text-text-primary">Alertas Ativos</h2>
              <p className="text-xs text-text-secondary">
                {triggeredAlerts.length === 0
                  ? 'Nenhum alerta disparado'
                  : `${dangerAlerts.length} critico(s), ${warningAlerts.length} aviso(s), ${infoAlerts.length} info`
                }
              </p>
            </div>
          </div>
          {triggeredAlerts.length === 0 && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <CheckCircle2 size={14} />
              Tudo certo
            </span>
          )}
        </div>

        {triggeredAlerts.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <CheckCircle2 size={32} className="mx-auto text-emerald-400/30 mb-3" />
            <p className="text-sm text-text-secondary">Nenhum alerta disparado no momento</p>
            <p className="text-xs text-text-secondary/60 mt-1">Seus limites configurados estao dentro do esperado</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {[...dangerAlerts, ...warningAlerts, ...infoAlerts].map(alert => {
              const config = severityConfig[alert.severity];
              const AlertIcon = config.icon;

              return (
                <div key={alert.id} className="px-6 py-4 flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${config.bg} border ${config.border}`}>
                    <AlertIcon size={20} className={config.text} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary">{alert.accountName}</span>
                      {alert.agencyName && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary-light border border-primary/20">
                          {alert.agencyName}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm mt-0.5 ${config.text}`}>{alert.message}</p>
                    {alert.currentValue !== null && (
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-text-secondary">
                          Atual: <span className={`font-bold ${config.text}`}>R$ {alert.currentValue.toFixed(2)}</span>
                        </span>
                        <span className="text-xs text-text-secondary">
                          Limite: <span className="font-bold text-text-primary">R$ {alert.threshold.toFixed(2)}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
