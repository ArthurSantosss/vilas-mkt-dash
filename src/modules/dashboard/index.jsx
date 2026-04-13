import { useEffect, useMemo, useState } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAlerts } from '../../contexts/AlertsContext';
import { formatCurrency, formatNumber } from '../../shared/utils/format';
import { isCreditCardPaymentMethod, readSavedPaymentMethods, getAccountPaymentMethod } from '../../shared/utils/paymentMethod';
import {
  LayoutDashboard, Users, DollarSign, MessageCircle,
  AlertTriangle, AlertCircle, Info, TrendingUp, Wallet, Target
} from 'lucide-react';
import ScrollReveal from '../../shared/components/ScrollReveal';

export default function Dashboard() {
  const {
    accounts: metaAccounts,
    balances: metaBalances,
    campaigns: metaCampaigns,
    loading: metaLoading,
  } = useMetaAds();
  const { alerts, markAsRead, markAllAsRead } = useAlerts();
  const [paymentMethods, setPaymentMethods] = useState(() => readSavedPaymentMethods());

  useEffect(() => {
    const syncPaymentMethods = () => setPaymentMethods(readSavedPaymentMethods());
    const handleLocalStorageMapUpdated = (event) => {
      if (event?.detail?.key === 'account_payment_methods') {
        setPaymentMethods(event.detail.value || {});
      }
    };
    window.addEventListener('storage', syncPaymentMethods);
    window.addEventListener('focus', syncPaymentMethods);
    window.addEventListener('local-storage-map-updated', handleLocalStorageMapUpdated);
    return () => {
      window.removeEventListener('storage', syncPaymentMethods);
      window.removeEventListener('focus', syncPaymentMethods);
      window.removeEventListener('local-storage-map-updated', handleLocalStorageMapUpdated);
    };
  }, []);

  const activeAccountsData = useMemo(
    () => metaAccounts.filter(account => account.status === 'active'),
    [metaAccounts]
  );

  const balanceByAccountId = useMemo(
    () => new Map(metaBalances.map(balance => [balance.accountId, balance])),
    [metaBalances]
  );

  const readableBalances = useMemo(
    () => metaBalances.filter((balance) => (
      balance.hasReliableBalance !== false &&
      !isCreditCardPaymentMethod(getAccountPaymentMethod(paymentMethods, balance.accountId) || 'credit_card')
    )),
    [metaBalances, paymentMethods]
  );

  const activeAlerts = useMemo(() => alerts.filter(alert => !alert.read), [alerts]);
  const criticalAlerts = useMemo(
    () => activeAlerts.filter(alert => alert.type === 'critical').length,
    [activeAlerts]
  );

  const periodSpend = useMemo(
    () => activeAccountsData.reduce((sum, account) => sum + (account.metrics?.spend || 0), 0),
    [activeAccountsData]
  );

  const periodLeads = useMemo(
    () => activeAccountsData.reduce((sum, account) => sum + (account.metrics?.messagingConversationsStarted || 0), 0),
    [activeAccountsData]
  );

  const averageCpl = periodLeads > 0 ? periodSpend / periodLeads : 0;

  const totalBalanceAvailable = useMemo(
    () => readableBalances.reduce((sum, balance) => sum + (balance.currentBalance || 0), 0),
    [readableBalances]
  );

  const totalAvgDailySpend = useMemo(
    () => readableBalances.reduce((sum, balance) => sum + (balance.avgDailySpend7d || 0), 0),
    [readableBalances]
  );

  const estimatedCoverageDays = totalAvgDailySpend > 0 ? totalBalanceAvailable / totalAvgDailySpend : 0;

  const activeCampaignCount = useMemo(
    () => metaCampaigns.filter(campaign => campaign.status === 'active').length,
    [metaCampaigns]
  );

  const campaignsWithSpend = useMemo(
    () => metaCampaigns.filter(campaign => (campaign.metrics?.spend || 0) > 0).length,
    [metaCampaigns]
  );

  const campaignsWithoutSpend = useMemo(
    () => metaCampaigns.filter(campaign => campaign.status === 'active' && (campaign.metrics?.spend || 0) === 0).length,
    [metaCampaigns]
  );

  const highFrequencyCount = useMemo(
    () => metaCampaigns.filter(campaign => (campaign.metrics?.frequency || 0) > 3 && (campaign.metrics?.spend || 0) > 0).length,
    [metaCampaigns]
  );

  const lowBalanceCount = useMemo(
    () => readableBalances.filter(balance => balance.currentBalance > 0 && balance.currentBalance < 150).length,
    [readableBalances]
  );

  const healthRows = useMemo(() => ([
    {
      label: 'Campanhas ativas',
      value: formatNumber(activeCampaignCount),
      tone: 'text-text-primary',
      helper: 'Estrutura atualmente ligada',
    },
    {
      label: 'Campanhas com gasto',
      value: formatNumber(campaignsWithSpend),
      tone: 'text-primary-light',
      helper: 'Contas realmente entregando',
    },
    {
      label: 'Campanhas sem gasto',
      value: formatNumber(campaignsWithoutSpend),
      tone: campaignsWithoutSpend > 0 ? 'text-warning' : 'text-success',
      helper: 'Pedem revisão de saldo, aprovação ou orçamento',
    },
    {
      label: 'Frequência alta',
      value: formatNumber(highFrequencyCount),
      tone: highFrequencyCount > 0 ? 'text-warning' : 'text-success',
      helper: 'Possível saturação de público',
    },
    {
      label: 'Contas com saldo baixo',
      value: formatNumber(lowBalanceCount),
      tone: lowBalanceCount > 0 ? 'text-danger' : 'text-success',
      helper: 'Meta abaixo de R$ 150',
    },
    {
      label: 'Cobertura estimada de saldo',
      value: estimatedCoverageDays > 0 ? `${estimatedCoverageDays.toFixed(1)} dias` : '—',
      tone: estimatedCoverageDays > 0 && estimatedCoverageDays < 4 ? 'text-warning' : 'text-text-primary',
      helper: 'Baseado na média diária das contas',
    },
  ]), [activeCampaignCount, campaignsWithSpend, campaignsWithoutSpend, highFrequencyCount, lowBalanceCount, estimatedCoverageDays]);

  const lowestBalances = useMemo(
    () => readableBalances
      .filter(balance => balance.currentBalance > 0)
      .sort((a, b) => a.currentBalance - b.currentBalance)
      .slice(0, 5),
    [readableBalances]
  );

  const focusAccounts = useMemo(() => {
    return activeAccountsData
      .map(account => {
        const balance = balanceByAccountId.get(account.id);
        const spend = account.metrics?.spend || 0;
        const leads = account.metrics?.messagingConversationsStarted || 0;
        const cpl = leads > 0 ? (account.metrics?.costPerMessage || spend / leads) : 0;
        const frequency = account.metrics?.frequency || 0;
        const paymentMethod = getAccountPaymentMethod(paymentMethods, account.id, account.accountId) || 'credit_card';
        const hasReliableBalance = Boolean(balance) &&
          balance.hasReliableBalance !== false &&
          !isCreditCardPaymentMethod(paymentMethod);
        const currentBalance = hasReliableBalance ? (balance?.currentBalance || 0) : null;
        const daysRemaining = hasReliableBalance ? (balance?.estimatedDaysRemaining || 0) : 0;

        let priority = 0;
        let statusLabel = 'Estável';
        let statusTone = 'success';

        if (currentBalance !== null && currentBalance > 0 && currentBalance < 50) {
          priority = 5;
          statusLabel = 'Saldo crítico';
          statusTone = 'danger';
        } else if (currentBalance !== null && currentBalance >= 50 && currentBalance < 150) {
          priority = 4;
          statusLabel = 'Saldo em atenção';
          statusTone = 'warning';
        } else if (spend > 0 && leads === 0) {
          priority = 3;
          statusLabel = 'Sem leads';
          statusTone = 'warning';
        } else if (frequency > 3) {
          priority = 2;
          statusLabel = 'Frequência alta';
          statusTone = 'warning';
        } else if (cpl > 10 && leads > 0) {
          priority = 1;
          statusLabel = 'CPL elevado';
          statusTone = 'info';
        }

        return {
          id: account.id,
          clientName: account.clientName,
          spend,
          leads,
          cpl,
          currentBalance,
          daysRemaining,
          hasReliableBalance,
          priority,
          statusLabel,
          statusTone,
        };
      })
      .sort((a, b) => b.priority - a.priority || b.spend - a.spend || a.cpl - b.cpl)
      .slice(0, 8);
  }, [activeAccountsData, balanceByAccountId, paymentMethods]);

  return (
    <div className="space-y-6 pb-12">
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>
        <div className="relative flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
            <LayoutDashboard size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Dashboard</h1>
            <p className="text-sm text-text-secondary">Prioridades, saúde da operação e contas que pedem ação.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <ScrollReveal direction="up" delay={0}>
          <DashCard icon={Users} label="Contas Ativas" value={formatNumber(activeAccountsData.length)} helper="Contas Meta com entrega habilitada" color="text-info" />
        </ScrollReveal>
        <ScrollReveal direction="up" delay={60}>
          <DashCard icon={DollarSign} label="Investimento no Período" value={formatCurrency(periodSpend)} helper="Soma real do período selecionado" color="text-primary-light" />
        </ScrollReveal>
        <ScrollReveal direction="up" delay={120}>
          <DashCard icon={MessageCircle} label="Leads no Período" value={formatNumber(periodLeads)} helper="Conversas iniciadas no Meta Ads" color="text-success" />
        </ScrollReveal>
        <ScrollReveal direction="up" delay={180}>
          <DashCard icon={Target} label="CPL Médio" value={averageCpl > 0 ? formatCurrency(averageCpl) : '—'} helper="Custo médio por lead" color={averageCpl > 10 ? 'text-warning' : 'text-primary-light'} />
        </ScrollReveal>
        <ScrollReveal direction="up" delay={240}>
          <DashCard
            icon={Wallet}
            label="Saldo Disponível"
            value={formatCurrency(totalBalanceAvailable)}
            helper={readableBalances.length > 0
              ? (estimatedCoverageDays > 0
                ? `${estimatedCoverageDays.toFixed(1)} dias de cobertura em ${readableBalances.length} conta(s)`
                : `${readableBalances.length} conta(s) com saldo mensurável`)
              : 'Meta não expõe saldo disponível para as contas atuais'}
            color={readableBalances.length === 0 ? 'text-text-primary' : totalBalanceAvailable < 300 ? 'text-warning' : 'text-success'}
          />
        </ScrollReveal>
        <ScrollReveal direction="up" delay={300}>
          <DashCard icon={AlertTriangle} label="Alertas Críticos" value={formatNumber(criticalAlerts)} helper={`${activeAlerts.length} alertas ativos no total`} color={criticalAlerts > 0 ? 'text-danger' : 'text-success'} highlight={criticalAlerts > 0} />
        </ScrollReveal>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <ScrollReveal direction="left" delay={100} className="xl:col-span-2">
          <div className="card-hover bg-surface rounded-2xl border border-border p-5 h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  <AlertCircle size={18} className="text-warning" />
                  Prioridades de Hoje
                </h2>
                <p className="text-xs text-text-secondary mt-1">O que precisa de atenção antes de escalar ou manter investimento.</p>
              </div>
              {activeAlerts.length > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-text-secondary hover:text-primary transition-colors"
                >
                  Marcar tudo como lido
                </button>
              )}
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto">
              {metaLoading ? (
                <p className="text-text-secondary text-sm py-6 text-center">Carregando dados...</p>
              ) : activeAlerts.length === 0 ? (
                <div className="rounded-xl border border-success/20 bg-success/5 p-5 text-center">
                  <p className="text-sm text-success font-medium">Nenhuma prioridade crítica no momento.</p>
                  <p className="text-xs text-text-secondary mt-1">A operação está estável com os dados atuais.</p>
                </div>
              ) : (
                activeAlerts.slice(0, 6).map(alert => (
                  <div
                    key={alert.id}
                    onClick={() => markAsRead(alert.id)}
                    className={`flex items-start gap-3 p-4 rounded-xl transition-colors cursor-pointer border ${
                      alert.type === 'critical'
                        ? 'bg-danger/5 border-danger/20'
                        : alert.type === 'warning'
                          ? 'bg-warning/5 border-warning/20'
                          : 'bg-info/5 border-info/20'
                    } ${alert.read ? 'opacity-60' : 'hover:bg-surface-hover'}`}
                  >
                    {alert.type === 'critical' && <AlertTriangle size={16} className="text-danger mt-0.5 shrink-0" />}
                    {alert.type === 'warning' && <AlertCircle size={16} className="text-warning mt-0.5 shrink-0" />}
                    {alert.type === 'info' && <Info size={16} className="text-info mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-text-primary">{alert.accountName}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-meta/10 text-meta border border-meta/20">Meta</span>
                        {!alert.read && <span className="w-1.5 h-1.5 rounded-full bg-primary-light" />}
                      </div>
                      <p className="text-sm text-text-primary mt-1 leading-relaxed">{alert.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {activeAlerts.length > 6 && (
              <p className="text-xs text-text-secondary mt-4">
                +{activeAlerts.length - 6} alertas adicionais na fila.
              </p>
            )}
          </div>
        </ScrollReveal>

        <ScrollReveal direction="right" delay={180}>
          <div className="card-hover bg-surface rounded-2xl border border-border p-5 h-full">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <TrendingUp size={18} className="text-primary-light" />
                Saúde da Operação
              </h2>
              <p className="text-xs text-text-secondary mt-1">Leitura rápida da estrutura, entrega e risco de saldo.</p>
            </div>

            <div className="space-y-3">
              {healthRows.map((item) => (
                <div key={item.label} className="rounded-xl border border-border/60 bg-bg/20 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-text-primary">{item.label}</span>
                    <span className={`text-sm font-bold ${item.tone}`}>{item.value}</span>
                  </div>
                  <p className="text-[11px] text-text-secondary mt-1">{item.helper}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-border/60">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Menores saldos</h3>
              <div className="space-y-2">
                {lowestBalances.length === 0 ? (
                  <p className="text-xs text-text-secondary">Nenhuma conta com saldo registrado.</p>
                ) : (
                  lowestBalances.map(balance => {
                    const tone = balance.currentBalance < 50 ? 'text-danger' : balance.currentBalance < 150 ? 'text-warning' : 'text-success';
                    return (
                      <div key={balance.accountId} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-bg/20">
                        <div className="min-w-0">
                          <p className="text-sm text-text-primary truncate">{balance.clientName}</p>
                          <p className="text-[11px] text-text-secondary">
                            {balance.estimatedDaysRemaining > 0 ? `~${balance.estimatedDaysRemaining.toFixed(1)} dias` : 'sem estimativa'}
                          </p>
                        </div>
                        <span className={`text-sm font-bold ${tone}`}>{formatCurrency(balance.currentBalance)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>

      <ScrollReveal direction="up" delay={150}>
        <div className="card-hover bg-surface rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Wallet size={18} className="text-primary-light" />
                Contas em Foco
              </h2>
              <p className="text-xs text-text-secondary mt-1">Cruza performance com saldo para decidir onde agir primeiro.</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary-light border border-primary/20">
              {focusAccounts.length} contas priorizadas
            </span>
          </div>

          {focusAccounts.length === 0 ? (
            <p className="text-text-secondary text-sm py-8 text-center">Nenhuma conta ativa para analisar.</p>
          ) : (
            <>
            {/* Mobile: card layout / Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 text-text-secondary font-medium">Conta</th>
                    <th className="text-right px-3 py-2 text-text-secondary font-medium">Gasto</th>
                    <th className="text-right px-3 py-2 text-text-secondary font-medium">Leads</th>
                    <th className="text-right px-3 py-2 text-text-secondary font-medium">CPL</th>
                    <th className="text-right px-3 py-2 text-text-secondary font-medium">Saldo</th>
                    <th className="text-right px-3 py-2 text-text-secondary font-medium">Dias</th>
                    <th className="text-center px-3 py-2 text-text-secondary font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {focusAccounts.map(account => (
                    <tr key={account.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                      <td className="px-3 py-3 font-medium text-text-primary">{account.clientName}</td>
                      <td className="px-3 py-3 text-right text-text-primary">{formatCurrency(account.spend)}</td>
                      <td className="px-3 py-3 text-right text-text-secondary">{formatNumber(account.leads)}</td>
                      <td className={`px-3 py-3 text-right font-medium ${account.cpl > 10 ? 'text-warning' : 'text-primary-light'}`}>
                        {account.cpl > 0 ? formatCurrency(account.cpl) : '—'}
                      </td>
                      <td className={`px-3 py-3 text-right font-medium ${account.currentBalance === null ? 'text-text-secondary' : account.currentBalance > 0 && account.currentBalance < 50 ? 'text-danger' : account.currentBalance < 150 ? 'text-warning' : 'text-success'}`}>
                        {account.currentBalance === null ? '—' : formatCurrency(account.currentBalance)}
                      </td>
                      <td className="px-3 py-3 text-right text-text-secondary">
                        {account.daysRemaining > 0 ? `${account.daysRemaining.toFixed(1)}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <StatusBadge tone={account.statusTone} label={account.statusLabel} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {focusAccounts.map(account => (
                <div key={account.id} className="rounded-xl border border-border/50 bg-bg/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-text-primary truncate mr-2">{account.clientName}</span>
                    <StatusBadge tone={account.statusTone} label={account.statusLabel} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-text-secondary">Gasto:</span> <span className="text-text-primary font-medium">{formatCurrency(account.spend)}</span></div>
                    <div><span className="text-text-secondary">Leads:</span> <span className="text-text-primary font-medium">{formatNumber(account.leads)}</span></div>
                    <div><span className="text-text-secondary">CPL:</span> <span className={`font-medium ${account.cpl > 10 ? 'text-warning' : 'text-primary-light'}`}>{account.cpl > 0 ? formatCurrency(account.cpl) : '—'}</span></div>
                    <div><span className="text-text-secondary">Saldo:</span> <span className={`font-medium ${account.currentBalance === null ? 'text-text-secondary' : account.currentBalance > 0 && account.currentBalance < 50 ? 'text-danger' : account.currentBalance < 150 ? 'text-warning' : 'text-success'}`}>{account.currentBalance === null ? '—' : formatCurrency(account.currentBalance)}</span></div>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      </ScrollReveal>
    </div>
  );
}

// eslint-disable-next-line no-unused-vars -- Icon is used in JSX below
function DashCard({ icon: Icon, label, value, helper, color, highlight }) {
  return (
    <div className={`card-hover glow-border bg-surface rounded-2xl border p-5 ${highlight ? 'border-danger/30 shadow-[0_0_24px_-4px_rgba(248,113,113,0.1)]' : 'border-border'}`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`p-1.5 rounded-lg ${
          highlight ? 'bg-danger/10' :
          color === 'text-success' ? 'bg-success/10' :
          color === 'text-warning' ? 'bg-warning/10' :
          color === 'text-danger' ? 'bg-danger/10' :
          color === 'text-info' ? 'bg-info/10' :
          'bg-primary/10'
        }`}>
          <Icon size={15} className={color} />
        </div>
        <span className="text-[11px] text-text-secondary uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
      {helper && <p className="text-[11px] text-text-secondary/70 mt-2.5 leading-relaxed">{helper}</p>}
    </div>
  );
}

function StatusBadge({ tone, label }) {
  const classes = {
    danger: 'bg-danger/10 text-danger border-danger/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    info: 'bg-info/10 text-info border-info/20',
    success: 'bg-success/10 text-success border-success/20',
  };

  return (
    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-medium border ${classes[tone] || classes.info}`}>
      {label}
    </span>
  );
}
