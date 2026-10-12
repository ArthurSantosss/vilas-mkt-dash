import { useAlerts } from '../../contexts/AlertsContext';
import { useState, useMemo, useCallback } from 'react';
import {
  Bell, AlertTriangle, TrendingDown, DollarSign, Trash2,
  CheckCircle2, CreditCard, Send, MessageSquareX,
  Settings, ChevronDown, ChevronUp, Loader2, SlidersHorizontal, Repeat, Activity
} from 'lucide-react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import {
  AUTO_ALERT_REMINDER_HOURS,
} from '../../shared/constants/autoAlerts';

function loadBalances() {
  try {
    return JSON.parse(localStorage.getItem('meta_balances')) || [];
  } catch {
    return [];
  }
}

export default function AutoAlerts() {
  const { balances: contextBalances } = useMetaAds();
  const { alerts: sharedAlerts, thresholds, updateThreshold, monitoredCount, error: alertsError } = useAlerts();
  const [showSettings, setShowSettings] = useState(false);
  const [dismissedIds, setDismissedIds] = useState(new Set());

  const balances = useMemo(() => {
    if (contextBalances && contextBalances.length > 0) return contextBalances;
    return loadBalances();
  }, [contextBalances]);

  const handleThresholdChange = (key, value) => { if (value !== '') updateThreshold(key, Number(value)); };
  const allAlerts = useMemo(() => sharedAlerts.map(alert => ({ ...alert, type: alert.category, icon: Bell })), [sharedAlerts]);

  const visibleAlerts = useMemo(
    () => allAlerts.filter(a => !dismissedIds.has(a.id)),
    [allAlerts, dismissedIds]
  );

  const dangerCount = visibleAlerts.filter(a => a.severity === 'danger').length;
  const warningCount = visibleAlerts.filter(a => a.severity === 'warning').length;

  // ── Scheduled reminders now handled by Vercel Cron (api/cron/slack-alerts.js) ──

  // ── Send balance summary to Slack ──
  const [sendingBalances, setSendingBalances] = useState(false);
  const [balanceSent, setBalanceSent] = useState(false);

  const handleSendBalances = useCallback(async () => {
    if (balances.length === 0) return;
    setSendingBalances(true);
    setBalanceSent(false);

    try {
      const response = await fetch('/api/alerts/send-balances', {
        method: 'POST',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Resumo de saldos retornou ${response.status}`);
      }

      setBalanceSent(true);
      setTimeout(() => setBalanceSent(false), 3000);
    } catch (err) {
      console.error('[AutoAlerts] Erro ao enviar saldos para Slack:', err);
    } finally {
      setSendingBalances(false);
    }
  }, [balances]);

  const severityConfig = {
    danger: { bg: 'bg-danger/10', border: 'border-danger/20', text: 'text-danger', badge: 'bg-danger/15 text-danger border-danger/30' },
    warning: { bg: 'bg-warning/10', border: 'border-warning/20', text: 'text-warning', badge: 'bg-warning/15 text-warning border-warning/30' },
    info: { bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-primary-light', badge: 'bg-primary/15 text-primary-light border-primary/30' },
  };

  const typeLabels = {
    payment_error: 'Erro Pagamento',
    balance_low: 'Saldo Baixo',
    high_cost: 'Custo Alto',
    cost_increase: 'Piora de custo',
    no_results: 'Sem resultados',
    results_drop: 'Queda de resultados',
    account_status: 'Status da conta',
    creative_fatigue: 'Criativo cansado',
  };

  const thresholdFields = [
    { key: 'balance_critical', label: 'Saldo Crítico (R$)', hint: 'Alerta vermelho quando o saldo pré-pago fica abaixo', dot: 'bg-danger', money: true, step: 10 },
    { key: 'balance_warning', label: 'Saldo em Atenção (R$)', hint: 'Alerta amarelo quando o saldo pré-pago fica abaixo', dot: 'bg-warning', money: true, step: 10 },
    { key: 'high_cost_lead', label: 'Meta de Custo por Resultado (R$)', hint: 'Alerta quando o custo da semana passa da meta', dot: 'bg-orange-400', money: true, step: 1 },
    { key: 'min_spend', label: 'Gasto Mínimo na Semana (R$)', hint: 'Abaixo disso a conta não é avaliada (amostra pequena)', dot: 'bg-primary-light', money: true, step: 10 },
    { key: 'min_results', label: 'Mínimo de Resultados na Semana', hint: 'Base mínima para comparar custo entre semanas', dot: 'bg-primary-light', step: 1 },
    { key: 'worsening_percent', label: 'Piora Mínima (%)', hint: 'Variação do custo ou do volume que gera alerta', dot: 'bg-primary-light', step: 5 },
    { key: 'google_lag_days', label: 'Dias Recentes Excluídos — Google', hint: 'Evita alarme falso pelo atraso das conversões', dot: 'bg-primary-light', step: 1 },
  ];

  return (
    <div className="space-y-6">
      {alertsError && <p role="alert" className="text-sm text-warning">{alertsError}</p>}
      {/* ═══ HEADER ═══ */}
      <div className="relative z-10 rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-6 mb-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>

        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
              <Bell size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary tracking-tight">Avisos Automáticos</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Summary badges */}
            {visibleAlerts.length === 0 ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-success/10 text-success border border-success/20">
                <CheckCircle2 size={14} />
                Tudo certo
              </span>
            ) : (
              <>
                {dangerCount > 0 && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-danger/10 text-danger border border-danger/20">
                    <AlertTriangle size={14} />
                    {dangerCount} crítico{dangerCount !== 1 ? 's' : ''}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-warning/10 text-warning border border-warning/20">
                    <AlertTriangle size={14} />
                    {warningCount} aviso{warningCount !== 1 ? 's' : ''}
                  </span>
                )}
              </>
            )}

            {/* Send balances to Slack */}
            <button
              onClick={handleSendBalances}
              disabled={sendingBalances || balances.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#4A154B]/10 text-[#E01E5A] border border-[#E01E5A]/20 hover:bg-[#4A154B]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Enviar resumo de saldos ao Slack"
            >
              {sendingBalances ? <Loader2 size={14} className="animate-spin" /> : balanceSent ? <CheckCircle2 size={14} /> : <Send size={14} />}
              {balanceSent ? 'Enviado!' : 'Saldos → Slack'}
            </button>
          </div>
        </div>
      </div>


      {/* ═══ SETTINGS (collapsible) ═══ */}
      <div className="bg-surface/50 rounded-2xl border border-border/50 overflow-hidden">
        <button
          onClick={() => setShowSettings(prev => !prev)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-surface-hover/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <SlidersHorizontal size={18} className="text-primary-light" />
            <div className="text-left">
              <h2 className="text-lg font-bold text-text-primary">Limites Globais</h2>
              <p className="text-xs text-text-secondary">Ajuste os limites que disparam alertas para todas as contas</p>
            </div>
          </div>
          {showSettings ? <ChevronUp size={18} className="text-text-secondary" /> : <ChevronDown size={18} className="text-text-secondary" />}
        </button>

        {showSettings && (
          <div className="px-6 pb-6 border-t border-border/50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-5">
              {thresholdFields.map(field => (
                <div key={field.key} className="space-y-2">
                  <label htmlFor={`threshold-${field.key}`} className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                    <div className={`w-2 h-2 rounded-full ${field.dot}`} />
                    {field.label}
                  </label>
                  <p className="text-[11px] text-text-secondary/60">{field.hint}</p>
                  <div className="relative">
                    {field.money && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">R$</span>}
                    <input
                      id={`threshold-${field.key}`}
                      type="number"
                      min="0"
                      step={field.step}
                      value={thresholds[field.key]}
                      onChange={e => handleThresholdChange(field.key, e.target.value)}
                      className={`w-full bg-bg border border-border rounded-lg ${field.money ? 'pl-9' : 'pl-3'} pr-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-primary transition-colors`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-text-secondary">
                <span className="font-bold text-primary-light">Monitoramento automático:</span>{' '}
                Cada conta é avaliada em 7 dias completos contra os 7 anteriores. Valores em R$ valem para contas em BRL; falhas de consulta aparecem como pendência, nunca como conta saudável.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ═══ ALERTS ═══ */}
      <div className="bg-surface/50 rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-warning" />
            <div>
              <h2 className="text-lg font-bold text-text-primary">Alertas Ativos</h2>
              <p className="text-xs text-text-secondary">
                {visibleAlerts.length === 0
                  ? 'Nenhum problema detectado'
                  : `${visibleAlerts.length} alerta${visibleAlerts.length !== 1 ? 's' : ''} em ${new Set(visibleAlerts.map(a => a.accountName)).size} conta${new Set(visibleAlerts.map(a => a.accountName)).size !== 1 ? 's' : ''}`
                }
              </p>
            </div>
          </div>
          {dismissedIds.size > 0 && (
            <button
              onClick={() => setDismissedIds(new Set())}
              className="text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Mostrar dispensados ({dismissedIds.size})
            </button>
          )}
        </div>

        {visibleAlerts.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <CheckCircle2 size={32} className="mx-auto text-success/30 mb-3" />
            <p className="text-sm text-text-secondary">Todas as contas estão dentro dos limites</p>
            <p className="text-xs text-text-secondary/60 mt-1">
              {monitoredCount} contas monitoradas automaticamente
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {visibleAlerts.map(alert => {
              const config = severityConfig[alert.severity];
              const AlertIcon = alert.icon;

              return (
                <div key={alert.id} className="px-6 py-4 flex items-start gap-4 group">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${config.bg} border ${config.border}`}>
                    <AlertIcon size={20} className={config.text} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary">{alert.accountName}</span>
                      {alert.agency && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary-light border border-primary/20">
                          {alert.agency}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${config.badge}`}>
                        {typeLabels[alert.type]}
                      </span>
                    </div>
                    <p className={`text-sm mt-0.5 ${config.text}`}>{alert.message}</p>
                    {alert.detail && (
                      <p className="text-xs text-text-secondary/70 mt-0.5">{alert.detail}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setDismissedIds(prev => new Set([...prev, alert.id]))}
                    className="p-1.5 rounded-lg text-text-secondary/30 hover:text-text-secondary hover:bg-surface-hover/50 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                    title="Dispensar alerta"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ MONITORED CHECKS INFO ═══ */}
      <div className="bg-surface/50 rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3">
          <Settings size={18} className="text-primary-light" />
          <div>
            <h2 className="text-lg font-bold text-text-primary">Verificações Ativas</h2>
            <p className="text-xs text-text-secondary">O que é monitorado automaticamente em todas as contas</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: CreditCard, color: 'text-danger', bg: 'bg-danger/10', label: 'Saldo Esgotado / Conta Indisponível', desc: 'Saldo pré-pago zerado ou conta sem veicular (a causa é conferida, não presumida)' },
              { icon: DollarSign, color: 'text-warning', bg: 'bg-warning/10', label: 'Saldo Baixo', desc: `Crítico < R$ ${thresholds.balance_critical} • Atenção < R$ ${thresholds.balance_warning}` },
              { icon: TrendingDown, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Piora de Custo', desc: `Custo por resultado subiu ${thresholds.worsening_percent}%+ ou passou da meta de R$ ${thresholds.high_cost_lead}` },
              { icon: Activity, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Queda de Resultados', desc: `Volume caiu ${thresholds.worsening_percent}%+ com gasto parecido` },
              { icon: MessageSquareX, color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Gasto sem Resultados', desc: 'Semana sem resultados quando a anterior tinha base comparável' },
              { icon: Repeat, color: 'text-warning', bg: 'bg-warning/10', label: 'Criativo Cansado (Meta)', desc: 'Frequência alta com queda no CTR de link' },
            ].map(check => (
              <div key={check.label} className="flex items-start gap-3 p-3 rounded-lg bg-bg/50 border border-border/30">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${check.bg}`}>
                  <check.icon size={18} className={check.color} />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{check.label}</p>
                  <p className="text-xs text-text-secondary/70 mt-0.5">{check.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Reminder schedule */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex items-center gap-2 mb-2">
              <Bell size={14} className="text-primary-light" />
              <span className="text-xs font-bold text-primary-light">Lembretes no Slack</span>
            </div>
            <p className="text-xs text-text-secondary">
              Briefing diário às 7h (Bahia). Condições novas ou agravadas são enviadas às 12h:
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {AUTO_ALERT_REMINDER_HOURS.map(h => (
                <span key={h} className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-bg border border-border text-text-secondary">
                  {h}h
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
