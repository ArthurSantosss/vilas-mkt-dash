import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import AlertsPanel from './AlertsPanel';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useGoogleAds } from '../../contexts/GoogleAdsContext';
import { useAlerts } from '../../contexts/AlertsContext';
import { formatCurrency, formatNumber } from '../../shared/utils/format';
import { isCreditCardPaymentMethod, readSavedPaymentMethods, getAccountPaymentMethod } from '../../shared/utils/paymentMethod';
import {
  LayoutDashboard, Users, DollarSign, MessageCircle,
  AlertTriangle, AlertCircle, Info, TrendingUp, Wallet, Target, RefreshCw
} from 'lucide-react';
import ScrollReveal from '../../shared/components/ScrollReveal';
import PeriodSelector from '../../shared/components/PeriodSelector';

export default function Dashboard() {
  const {
    accounts: metaAccounts,
    balances: metaBalances,
    campaigns: metaCampaigns,
    loading: metaLoading,
    error: metaError,
    selectedPeriod,
    setSelectedPeriod,
    refreshData: refreshMetaData,
  } = useMetaAds();
  const {
    accounts: googleAccounts,
    campaigns: googleCampaigns,
    loading: googleLoading,
    error: googleError,
    refreshData: refreshGoogleData,
  } = useGoogleAds();
  const { alerts, thresholds } = useAlerts();
  const queryClient = useQueryClient();
  const refreshInFlight = useRef(false);
  const [lastChecked, setLastChecked] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState(() => readSavedPaymentMethods());
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (refreshInFlight.current || !navigator.onLine) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await Promise.all([refreshMetaData(), refreshGoogleData()]);
      const failed = queryClient.getQueryCache().findAll({ type: 'active' })
        .some(query => ['meta', 'googleAds'].includes(query.queryKey[0]) && query.state.status === 'error');
      if (failed) setRefreshError('Alguns dados não foram atualizados. Exibindo os últimos dados disponíveis.');
      else setLastChecked(new Date());
    } catch {
      setRefreshError('Não foi possível atualizar os dados. Tentaremos novamente automaticamente.');
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, [refreshMetaData, refreshGoogleData, queryClient]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void handleRefresh();
    };
    refreshVisible();
    const interval = window.setInterval(refreshVisible, 60_000);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('online', refreshVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.removeEventListener('online', refreshVisible);
    };
  }, [handleRefresh]);

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

  const activeMetaAccounts = useMemo(
    () => metaAccounts.filter(account => account.status === 'active'),
    [metaAccounts]
  );

  const activeGoogleAccounts = useMemo(
    () => googleAccounts.filter(account => account.status === 'active'),
    [googleAccounts]
  );

  const activeAccountsData = useMemo(
    () => [...activeMetaAccounts, ...activeGoogleAccounts],
    [activeMetaAccounts, activeGoogleAccounts]
  );

  const allCampaigns = useMemo(
    () => [...metaCampaigns, ...googleCampaigns],
    [metaCampaigns, googleCampaigns]
  );

  const balanceByAccountId = useMemo(
    () => new Map(metaBalances.map(balance => [balance.accountId, balance])),
    [metaBalances]
  );

  const readableBalances = useMemo(
    () => metaBalances.filter((balance) => (
      balance.hasReliableBalance !== false &&
      !isCreditCardPaymentMethod(getAccountPaymentMethod(paymentMethods, balance.accountId) || '')
    )),
    [metaBalances, paymentMethods]
  );

  const activeAlerts = alerts;
  const criticalAlerts = useMemo(
    () => activeAlerts.filter(alert => alert.type === 'critical').length,
    [activeAlerts]
  );

  const periodSpend = useMemo(
    () => activeAccountsData.reduce((sum, account) => sum + (account.metrics?.spend || 0), 0),
    [activeAccountsData]
  );

  const periodResults = useMemo(
    () => activeAccountsData.reduce((sum, account) => sum + (account.metrics?.messagingConversationsStarted || 0), 0),
    [activeAccountsData]
  );

  const averageResultCost = periodResults > 0 ? periodSpend / periodResults : 0;

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
    () => allCampaigns.filter(campaign => campaign.status === 'active').length,
    [allCampaigns]
  );

  const campaignsWithSpend = useMemo(
    () => allCampaigns.filter(campaign => (campaign.metrics?.spend || 0) > 0).length,
    [allCampaigns]
  );

  const campaignsWithoutSpend = useMemo(
    () => allCampaigns.filter(campaign => campaign.status === 'active' && (campaign.metrics?.spend || 0) === 0).length,
    [allCampaigns]
  );

  const highFrequencyCount = useMemo(
    () => metaCampaigns.filter(campaign => (campaign.metrics?.frequency || 0) > 3 && (campaign.metrics?.spend || 0) > 0).length,
    [metaCampaigns]
  );

  const lowBalanceCount = useMemo(
    () => readableBalances.filter(balance => (balance.currentBalance <= 0 || balance.currentBalance < thresholds.balance_warning)).length,
    [readableBalances, thresholds.balance_warning]
  );

  const healthRows = useMemo(() => ([
    {
      label: 'Campanhas ativas',
      value: formatNumber(activeCampaignCount),
      tone: 'text-text-primary',
      helper: 'Meta Ads e Google Ads',
    },
    {
      label: 'Campanhas com gasto',
      value: formatNumber(campaignsWithSpend),
      tone: 'text-primary-light',
      helper: 'Estruturas com entrega no período',
    },
    {
      label: 'Campanhas sem gasto',
      value: formatNumber(campaignsWithoutSpend),
      tone: campaignsWithoutSpend > 0 ? 'text-warning' : 'text-success',
      helper: 'Pedem revisão de saldo, aprovação ou orçamento',
    },
    {
      label: 'Frequência alta (Meta)',
      value: formatNumber(highFrequencyCount),
      tone: highFrequencyCount > 0 ? 'text-warning' : 'text-success',
      helper: 'Saturação observada nas campanhas da Meta',
    },
    metaBalances.length > 0 ? {
      label: 'Contas com saldo baixo',
      value: formatNumber(lowBalanceCount),
      tone: lowBalanceCount > 0 ? 'text-danger' : 'text-success',
      helper: `Meta abaixo de ${formatCurrency(thresholds.balance_warning)}`,
    } : {
      label: 'Contas Meta ativas',
      value: formatNumber(activeMetaAccounts.length),
      tone: 'text-text-primary',
      helper: 'Contas com campanhas ativas',
    },
    {
      label: 'Cobertura estimada de saldo',
      value: estimatedCoverageDays > 0 ? `${estimatedCoverageDays.toFixed(1)} dias` : '—',
      tone: estimatedCoverageDays > 0 && estimatedCoverageDays < 4 ? 'text-warning' : 'text-text-primary',
      helper: 'Baseado na média diária das contas',
    },
  ]), [activeCampaignCount, campaignsWithSpend, campaignsWithoutSpend, highFrequencyCount, lowBalanceCount, estimatedCoverageDays, metaBalances.length, activeMetaAccounts.length, thresholds.balance_warning]);

  const lowestBalances = useMemo(
    () => readableBalances
      .filter(balance => Number.isFinite(balance.currentBalance))
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
        const paymentMethod = getAccountPaymentMethod(paymentMethods, account.id, account.accountId) || '';
        const hasReliableBalance = Boolean(balance) &&
          balance.hasReliableBalance !== false &&
          !isCreditCardPaymentMethod(paymentMethod);
        const currentBalance = hasReliableBalance ? (balance?.currentBalance || 0) : null;
        const daysRemaining = hasReliableBalance ? (balance?.estimatedDaysRemaining || 0) : 0;

        let priority = 0;
        let statusLabel = 'Estável';
        let statusTone = 'success';

        if (currentBalance !== null && (currentBalance <= 0 || currentBalance < thresholds.balance_critical)) {
          priority = 5;
          statusLabel = 'Saldo crítico';
          statusTone = 'danger';
        } else if (currentBalance !== null && currentBalance < thresholds.balance_warning) {
          priority = 4;
          statusLabel = 'Saldo em atenção';
          statusTone = 'warning';
        } else if (spend > 0 && leads === 0) {
          priority = 3;
          statusLabel = account.platform === 'google_ads' ? 'Sem conversões' : 'Sem leads';
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
          platform: account.platform,
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
  }, [activeAccountsData, balanceByAccountId, paymentMethods, thresholds]);

  return (
    <div className="space-y-6 pb-12">
      {(metaError || refreshError) && <p role="alert" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">{refreshError || `Meta Ads: ${metaError}`}</p>}
      {googleError && <div role="alert" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
        Google Ads: alguns dados não puderam ser atualizados. Os totais podem estar incompletos. {googleError} Confira as conexões em Configurações.
      </div>}
      <div className="relative z-10 rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
              <LayoutDashboard size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary tracking-tight">Dashboard</h1>
              <p className="text-xs text-text-secondary mt-1" aria-live="polite">Atualização automática a cada minuto{lastChecked ? ` · Última verificação às ${lastChecked.toLocaleTimeString('pt-BR')}` : ''}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 z-50 shrink-0">
            <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} />
            <button
              onClick={handleRefresh}
              disabled={refreshing || metaLoading || googleLoading}
              className="flex h-[42px] items-center justify-center px-4 rounded-xl bg-surface/60 backdrop-blur-md border border-border/50 text-sm font-medium text-text-secondary hover:text-primary hover:border-primary/30 transition-all shadow-sm disabled:opacity-50"
              title="Atualizar dados"
            >
              <RefreshCw size={16} className={`mr-2 ${refreshing || metaLoading || googleLoading ? 'animate-spin' : ''}`} />
              {refreshing || metaLoading || googleLoading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>
      </div>

      <nav aria-label="Atalhos do dashboard" className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-primary-light">
        <a href="#avisos" className="hover:underline">Avisos ({alerts.length})</a>
        <Link to="/saldos" className="hover:underline">Saldos e recargas</Link>
        <Link to="/relatorios" className="hover:underline">Gerar relatório</Link>
        <Link to="/visao-detalhada" className="hover:underline">Analisar desempenho</Link>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <ScrollReveal direction="up" delay={0}>
          <DashCard icon={Users} label="Contas Ativas" value={formatNumber(activeAccountsData.length)} helper={`${activeMetaAccounts.length} Meta · ${activeGoogleAccounts.length} Google`} color="text-info" />
        </ScrollReveal>
        <ScrollReveal direction="up" delay={60}>
          <DashCard icon={DollarSign} label="Investimento no Período" value={formatCurrency(periodSpend)} helper="Meta Ads + Google Ads" color="text-primary-light" />
        </ScrollReveal>
        <ScrollReveal direction="up" delay={120}>
          <DashCard icon={MessageCircle} label="Resultados no Período" value={formatNumber(periodResults)} helper="Conversas Meta + conversões Google" color="text-success" />
        </ScrollReveal>
        <ScrollReveal direction="up" delay={180}>
          <DashCard icon={Target} label="Custo Médio por Resultado" value={averageResultCost > 0 ? formatCurrency(averageResultCost) : '—'} helper="Investimento ÷ resultados" color={averageResultCost > 10 ? 'text-warning' : 'text-primary-light'} />
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
              : 'Disponível apenas para contas Meta com saldo mensurável'}
            color={readableBalances.length === 0 ? 'text-text-primary' : totalBalanceAvailable < 300 ? 'text-warning' : 'text-success'}
          />
        </ScrollReveal>
        <ScrollReveal direction="up" delay={300}>
          <DashCard icon={AlertTriangle} label="Alertas Críticos" value={formatNumber(criticalAlerts)} helper={`${activeAlerts.length} alertas ativos no total`} color={criticalAlerts > 0 ? 'text-danger' : 'text-success'} highlight={criticalAlerts > 0} />
        </ScrollReveal>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <ScrollReveal direction="left" delay={100} className="xl:col-span-2">
          <AlertsPanel loading={metaLoading || refreshing} error={metaError || refreshError} />
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
                    const tone = balance.currentBalance <= 0 || balance.currentBalance < thresholds.balance_critical ? 'text-danger' : balance.currentBalance < thresholds.balance_warning ? 'text-warning' : 'text-success';
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
                    <th className="text-right px-3 py-2 text-text-secondary font-medium">Resultados</th>
                    <th className="text-right px-3 py-2 text-text-secondary font-medium">Custo</th>
                    <th className="text-right px-3 py-2 text-text-secondary font-medium">Saldo</th>
                    <th className="text-right px-3 py-2 text-text-secondary font-medium">Dias</th>
                    <th className="text-center px-3 py-2 text-text-secondary font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {focusAccounts.map(account => (
                    <tr key={account.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                      <td className="px-3 py-3 font-medium text-text-primary">
                        <div className="flex items-center gap-2">
                          <span>{account.clientName}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${account.platform === 'google_ads' ? 'bg-google/10 text-google border-google/20' : 'bg-meta/10 text-meta border-meta/20'}`}>
                            {account.platform === 'google_ads' ? 'Google' : 'Meta'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-text-primary">{formatCurrency(account.spend)}</td>
                      <td className="px-3 py-3 text-right text-text-secondary">{formatNumber(account.leads)}</td>
                      <td className={`px-3 py-3 text-right font-medium ${account.cpl > 10 ? 'text-warning' : 'text-primary-light'}`}>
                        {account.cpl > 0 ? formatCurrency(account.cpl) : '—'}
                      </td>
                      <td className={`px-3 py-3 text-right font-medium ${account.currentBalance === null ? 'text-text-secondary' : account.currentBalance <= 0 || account.currentBalance < thresholds.balance_critical ? 'text-danger' : account.currentBalance < thresholds.balance_warning ? 'text-warning' : 'text-success'}`}>
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
                    <div className="flex items-center gap-2 min-w-0 mr-2">
                      <span className="text-sm font-medium text-text-primary truncate">{account.clientName}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${account.platform === 'google_ads' ? 'bg-google/10 text-google border-google/20' : 'bg-meta/10 text-meta border-meta/20'}`}>
                        {account.platform === 'google_ads' ? 'Google' : 'Meta'}
                      </span>
                    </div>
                    <StatusBadge tone={account.statusTone} label={account.statusLabel} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-text-secondary">Gasto:</span> <span className="text-text-primary font-medium">{formatCurrency(account.spend)}</span></div>
                    <div><span className="text-text-secondary">Resultados:</span> <span className="text-text-primary font-medium">{formatNumber(account.leads)}</span></div>
                    <div><span className="text-text-secondary">Custo:</span> <span className={`font-medium ${account.cpl > 10 ? 'text-warning' : 'text-primary-light'}`}>{account.cpl > 0 ? formatCurrency(account.cpl) : '—'}</span></div>
                    <div><span className="text-text-secondary">Saldo:</span> <span className={`font-medium ${account.currentBalance === null ? 'text-text-secondary' : account.currentBalance <= 0 || account.currentBalance < thresholds.balance_critical ? 'text-danger' : account.currentBalance < thresholds.balance_warning ? 'text-warning' : 'text-success'}`}>{account.currentBalance === null ? '—' : formatCurrency(account.currentBalance)}</span></div>
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
