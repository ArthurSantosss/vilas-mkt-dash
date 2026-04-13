import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Bell, AlertTriangle, TrendingDown, DollarSign, Trash2,
  CheckCircle2, CreditCard, Send, Wallet, MessageSquareX,
  Settings, ChevronDown, ChevronUp, Loader2, SlidersHorizontal
} from 'lucide-react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { isCreditCardPaymentMethod, readSavedPaymentMethods, getAccountPaymentMethod } from '../../shared/utils/paymentMethod';

const SLACK_WEBHOOK = import.meta.env.VITE_SLACK_WEBHOOK_ALERTS;

// Horários fixos de lembrete (Brasília, UTC-3)
const REMINDER_HOURS = [6, 8, 10, 12, 14, 16, 18];
const REMINDER_SENT_KEY = 'auto_alerts_reminders_sent';

function getBrasiliaHour() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const brasilia = new Date(utc - 3 * 3600000);
  return brasilia.getHours();
}

function getBrasiliaDateStr() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const brasilia = new Date(utc - 3 * 3600000);
  return brasilia.toISOString().slice(0, 10);
}

function loadSentReminders() {
  try {
    const stored = JSON.parse(localStorage.getItem(REMINDER_SENT_KEY) || '{}');
    // Limpa entradas de dias anteriores
    const today = getBrasiliaDateStr();
    if (stored.date !== today) return { date: today, hours: [] };
    return stored;
  } catch {
    return { date: getBrasiliaDateStr(), hours: [] };
  }
}

function saveSentReminder(hour) {
  const data = loadSentReminders();
  if (!data.hours.includes(hour)) {
    data.hours.push(hour);
  }
  localStorage.setItem(REMINDER_SENT_KEY, JSON.stringify(data));
}

const STORAGE_KEY = 'auto_alerts_thresholds';

const DEFAULT_THRESHOLDS = {
  balance_critical: 50,
  balance_warning: 150,
  high_cost_lead: 25,
};

function loadThresholds() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...DEFAULT_THRESHOLDS, ...stored };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

function saveThresholds(thresholds) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
}

function loadBalances() {
  try {
    return JSON.parse(localStorage.getItem('meta_balances')) || [];
  } catch {
    return [];
  }
}

export default function AutoAlerts() {
  const { accounts, balances: contextBalances, campaigns } = useMetaAds();
  const { accountAgencies } = useAgency();

  const [thresholds, setThresholds] = useState(loadThresholds);
  const [showSettings, setShowSettings] = useState(false);
  const [dismissedIds, setDismissedIds] = useState(new Set());

  const [paymentMethodsMap, setPaymentMethodsMap] = useState(() => readSavedPaymentMethods());

  useEffect(() => {
    const syncPaymentMethods = () => setPaymentMethodsMap(readSavedPaymentMethods());
    const handleLocalStorageMapUpdated = (event) => {
      if (event?.detail?.key === 'account_payment_methods') {
        setPaymentMethodsMap(event.detail.value || {});
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

  const balances = useMemo(() => {
    if (contextBalances && contextBalances.length > 0) return contextBalances;
    return loadBalances();
  }, [contextBalances]);

  const balanceMap = useMemo(
    () => new Map(balances.map(b => [b.accountId, b])),
    [balances]
  );

  const handleThresholdChange = (key, value) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setThresholds(prev => {
      const updated = { ...prev, [key]: num };
      saveThresholds(updated);
      return updated;
    });
  };

  // ── Automatic alert evaluation for ALL accounts ──
  const allAlerts = useMemo(() => {
    const alerts = [];

    accounts.forEach(account => {
      const balance = balanceMap.get(account.id);
      const paymentMethod = getAccountPaymentMethod(paymentMethodsMap, account.id, account.accountId) || '';
      const isCard = isCreditCardPaymentMethod(paymentMethod);
      const agency = accountAgencies[account.id] || null;
      const accountName = account.clientName || account.name || account.accountId || account.id;

      // ── 1. Erro no pagamento (cartão com conta desativada) ──
      if (isCard && account.status && account.status !== 'active') {
        alerts.push({
          id: `payment-card-${account.id}`,
          type: 'payment_error',
          severity: 'danger',
          accountName,
          agency,
          icon: CreditCard,
          message: 'Possível falha na cobrança do cartão — conta desativada',
          detail: `Status: ${account.status}`,
        });
      }

      // ── 2. Saldo esgotado em conta Pix/Boleto ──
      if (!isCard && balance && balance.hasReliableBalance !== false && balance.currentBalance <= 0) {
        const methodLabel = paymentMethod === 'pix' ? 'Pix' : paymentMethod === 'boleto' ? 'Boleto' : 'Pré-pago';
        alerts.push({
          id: `payment-zero-${account.id}`,
          type: 'payment_error',
          severity: 'danger',
          accountName,
          agency,
          icon: Wallet,
          message: `${methodLabel} — Saldo esgotado (R$ 0,00)`,
          detail: 'Campanhas serão pausadas automaticamente',
        });
      }

      // ── 3. Saldo baixo (apenas contas pré-pagas) ──
      if (!isCard && balance && balance.hasReliableBalance !== false && balance.currentBalance > 0) {
        const bal = balance.currentBalance;
        const days = balance.estimatedDaysRemaining > 0 ? balance.estimatedDaysRemaining.toFixed(0) : null;

        if (bal < thresholds.balance_critical) {
          alerts.push({
            id: `balance-critical-${account.id}`,
            type: 'balance_low',
            severity: 'danger',
            accountName,
            agency,
            icon: DollarSign,
            message: `Saldo crítico: R$ ${bal.toFixed(2)}`,
            detail: days ? `~${days} dias restantes • Limite: R$ ${thresholds.balance_critical.toFixed(2)}` : `Limite: R$ ${thresholds.balance_critical.toFixed(2)}`,
            value: bal,
          });
        } else if (bal < thresholds.balance_warning) {
          alerts.push({
            id: `balance-warning-${account.id}`,
            type: 'balance_low',
            severity: 'warning',
            accountName,
            agency,
            icon: DollarSign,
            message: `Saldo em atenção: R$ ${bal.toFixed(2)}`,
            detail: days ? `~${days} dias restantes • Limite: R$ ${thresholds.balance_warning.toFixed(2)}` : `Limite: R$ ${thresholds.balance_warning.toFixed(2)}`,
            value: bal,
          });
        }
      }

      // ── 4. Custo por lead alto (baseado no dia de hoje) ──
      const daily = account.dailyMetrics || [];
      const todayData = daily.length > 0 ? daily[daily.length - 1] : null;
      const todaySpend = todayData?.spend || 0;
      const todayMessages = todayData?.messages || 0;
      const todayCostPerLead = todayMessages > 0 ? todaySpend / todayMessages : 0;

      if (todayCostPerLead > 0 && todayCostPerLead >= thresholds.high_cost_lead) {
        const isCritical = todayCostPerLead >= thresholds.high_cost_lead * 1.5;
        alerts.push({
          id: `highcost-${account.id}`,
          type: 'high_cost',
          severity: isCritical ? 'danger' : 'warning',
          accountName,
          agency,
          icon: TrendingDown,
          message: `Custo por lead hoje: R$ ${todayCostPerLead.toFixed(2)}`,
          detail: `Gasto: R$ ${todaySpend.toFixed(2)} • ${todayMessages} msg • Limite: R$ ${thresholds.high_cost_lead.toFixed(2)}`,
          value: todayCostPerLead,
        });
      }

      // ── 5. Gastando sem gerar mensagens (baseado no dia de hoje) ──
      if (todaySpend > 0 && todayMessages === 0) {
        alerts.push({
          id: `nomsg-${account.id}`,
          type: 'no_messages',
          severity: 'danger',
          accountName,
          agency,
          icon: MessageSquareX,
          message: `Gastou R$ ${todaySpend.toFixed(2)} hoje sem gerar mensagens`,
          detail: 'Verifique configuração de campanha e pixel',
          value: todaySpend,
        });
      }
    });

    // Sort: danger first, then warning
    const priority = { danger: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => priority[a.severity] - priority[b.severity]);

    return alerts;
  }, [accounts, balanceMap, accountAgencies, paymentMethodsMap, thresholds]);

  const visibleAlerts = useMemo(
    () => allAlerts.filter(a => !dismissedIds.has(a.id)),
    [allAlerts, dismissedIds]
  );

  const dangerCount = visibleAlerts.filter(a => a.severity === 'danger').length;
  const warningCount = visibleAlerts.filter(a => a.severity === 'warning').length;

  // ── Slack webhook: send new alerts ──
  const sentAlertsRef = useRef(new Set());

  useEffect(() => {
    if (allAlerts.length === 0) return;

    const today = new Date().toLocaleDateString('pt-BR');
    const newAlerts = allAlerts.filter(a => !sentAlertsRef.current.has(`${a.id}-${today}`));
    if (newAlerts.length === 0) return;

    const severityEmoji = { danger: ':red_circle:', warning: ':large_yellow_circle:', info: ':large_blue_circle:' };
    const severityLabel = { danger: 'CRÍTICO', warning: 'AVISO', info: 'INFO' };
    const typeHeaders = {
      balance_low: ':moneybag: Saldo Baixo',
      payment_error: ':credit_card: Erro no Pagamento',
      high_cost: ':chart_with_downwards_trend: Custo Alto',
      no_messages: ':no_entry_sign: Sem Mensagens',
    };

    // Group alerts by type
    const grouped = {};
    newAlerts.forEach(a => {
      if (!grouped[a.type]) grouped[a.type] = [];
      grouped[a.type].push(a);
    });

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `⚠️ Alertas Vilas MKT — ${today}`, emoji: true } },
    ];

    Object.entries(grouped).forEach(([type, alerts]) => {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${typeHeaders[type] || type}* (${alerts.length})` },
      });

      alerts.slice(0, 15).forEach(alert => {
        const emoji = severityEmoji[alert.severity];
        const agency = alert.agency ? ` _(${alert.agency})_` : '';
        let text = `${emoji} *${alert.accountName}*${agency}\n${alert.message}`;
        if (alert.detail) text += `\n${alert.detail}`;
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text } });
      });
    });

    blocks.push({ type: 'divider' });
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `_Vilas MKT Dash • ${today}_` }] });

    fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    })
      .then(res => {
        if (res.ok) {
          newAlerts.forEach(a => sentAlertsRef.current.add(`${a.id}-${today}`));
        } else {
          console.warn('[AutoAlerts] Slack webhook retornou status:', res.status);
        }
      })
      .catch(err => console.error('[AutoAlerts] Erro ao enviar para Slack:', err));
  }, [allAlerts]);

  // ── Scheduled reminders (6h, 8h, 10h, 12h, 14h, 16h, 18h Brasília) ──
  useEffect(() => {
    if (allAlerts.length === 0) return;

    const checkAndSendReminder = () => {
      if (allAlerts.length === 0) return;

      const currentHour = getBrasiliaHour();
      const matchedHour = REMINDER_HOURS.find(h => h === currentHour);
      if (matchedHour === undefined) return;

      const sent = loadSentReminders();
      if (sent.hours.includes(matchedHour)) return;

      const today = new Date().toLocaleDateString('pt-BR');
      const severityEmoji = { danger: ':red_circle:', warning: ':large_yellow_circle:', info: ':large_blue_circle:' };
      const typeHeaders = {
        balance_low: ':moneybag: Saldo Baixo',
        payment_error: ':credit_card: Erro no Pagamento',
        high_cost: ':chart_with_downwards_trend: Custo Alto',
        no_messages: ':no_entry_sign: Sem Mensagens',
      };

      const grouped = {};
      allAlerts.forEach(a => {
        if (!grouped[a.type]) grouped[a.type] = [];
        grouped[a.type].push(a);
      });

      const blocks = [
        { type: 'header', text: { type: 'plain_text', text: `🔔 Lembrete ${matchedHour}h — ${allAlerts.length} alerta${allAlerts.length !== 1 ? 's' : ''} pendente${allAlerts.length !== 1 ? 's' : ''}`, emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: `_Esses problemas ainda não foram resolvidos:_` } },
      ];

      Object.entries(grouped).forEach(([type, alerts]) => {
        blocks.push({ type: 'divider' });
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `*${typeHeaders[type] || type}* (${alerts.length})` },
        });

        alerts.slice(0, 10).forEach(alert => {
          const emoji = severityEmoji[alert.severity];
          const agency = alert.agency ? ` _(${alert.agency})_` : '';
          let text = `${emoji} *${alert.accountName}*${agency}\n${alert.message}`;
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text } });
        });
      });

      blocks.push({ type: 'divider' });
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `_Lembrete automático • ${today} às ${matchedHour}h • Vilas MKT Dash_` }] });

      fetch(SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      })
        .then(res => {
          if (res.ok) saveSentReminder(matchedHour);
          else console.warn('[AutoAlerts] Slack reminder retornou status:', res.status);
        })
        .catch(err => console.error('[AutoAlerts] Erro ao enviar lembrete:', err));
    };

    // Checa imediatamente e depois a cada 60s
    checkAndSendReminder();
    const interval = setInterval(checkAndSendReminder, 60_000);
    return () => clearInterval(interval);
  }, [allAlerts]);

  // ── Send balance summary to Slack ──
  const [sendingBalances, setSendingBalances] = useState(false);
  const [balanceSent, setBalanceSent] = useState(false);

  const handleSendBalances = useCallback(async () => {
    if (balances.length === 0) return;
    setSendingBalances(true);
    setBalanceSent(false);

    try {
      const today = new Date().toLocaleDateString('pt-BR');
      const paymentMethods = readSavedPaymentMethods();

      const sorted = [...balances].sort((a, b) => {
        const pmA = paymentMethods[a.accountId] || '';
        const pmB = paymentMethods[b.accountId] || '';
        if (isCreditCardPaymentMethod(pmA) && !isCreditCardPaymentMethod(pmB)) return 1;
        if (!isCreditCardPaymentMethod(pmA) && isCreditCardPaymentMethod(pmB)) return -1;
        return (a.currentBalance || 0) - (b.currentBalance || 0);
      });

      const lines = sorted.map(b => {
        const pm = paymentMethods[b.accountId] || '';
        const agency = accountAgencies[b.accountId];
        const agencyTag = agency ? ` _(${agency})_` : '';

        if (isCreditCardPaymentMethod(pm)) {
          return `:credit_card: *${b.clientName}*${agencyTag} — Cartão`;
        }

        const emoji = b.currentBalance <= 0 ? ':red_circle:' : b.currentBalance < 50 ? ':large_orange_circle:' : b.currentBalance < 150 ? ':large_yellow_circle:' : ':large_green_circle:';
        const days = b.estimatedDaysRemaining > 0 ? ` (~${b.estimatedDaysRemaining.toFixed(0)} dias)` : '';
        return `${emoji} *${b.clientName}*${agencyTag} — R$ ${b.currentBalance.toFixed(2)}${days}`;
      });

      const blocks = [
        { type: 'header', text: { type: 'plain_text', text: `💰 Saldos das Contas — ${today}`, emoji: true } },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n').slice(0, 3000) } },
        { type: 'divider' },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `_${balances.length} contas • Vilas MKT Dash_` }] },
      ];

      await fetch(SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      });

      setBalanceSent(true);
      setTimeout(() => setBalanceSent(false), 3000);
    } catch (err) {
      console.error('[AutoAlerts] Erro ao enviar saldos para Slack:', err);
    } finally {
      setSendingBalances(false);
    }
  }, [balances, accountAgencies]);

  const severityConfig = {
    danger: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', badge: 'bg-red-500/15 text-red-400 border-red-500/30' },
    warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    info: { bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-primary-light', badge: 'bg-primary/15 text-primary-light border-primary/30' },
  };

  const typeLabels = {
    payment_error: 'Erro Pagamento',
    balance_low: 'Saldo Baixo',
    high_cost: 'Custo Alto',
    no_messages: 'Sem Mensagens',
  };

  return (
    <div className="space-y-6">
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
              <p className="text-sm text-text-secondary">
                Monitoramento automático de todas as {accounts.length} contas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Summary badges */}
            {visibleAlerts.length === 0 ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 size={14} />
                Tudo certo
              </span>
            ) : (
              <>
                {dangerCount > 0 && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                    <AlertTriangle size={14} />
                    {dangerCount} crítico{dangerCount !== 1 ? 's' : ''}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
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
              {/* Balance Critical */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  Saldo Crítico (R$)
                </label>
                <p className="text-[11px] text-text-secondary/60">Alerta vermelho quando saldo abaixo</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">R$</span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={thresholds.balance_critical}
                    onChange={e => handleThresholdChange('balance_critical', e.target.value)}
                    className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              {/* Balance Warning */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  Saldo em Atenção (R$)
                </label>
                <p className="text-[11px] text-text-secondary/60">Alerta amarelo quando saldo abaixo</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">R$</span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={thresholds.balance_warning}
                    onChange={e => handleThresholdChange('balance_warning', e.target.value)}
                    className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              {/* High Cost per Lead */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                  <div className="w-2 h-2 rounded-full bg-orange-400" />
                  Custo por Lead Máximo (R$)
                </label>
                <p className="text-[11px] text-text-secondary/60">Alerta quando custo por lead acima</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">R$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={thresholds.high_cost_lead}
                    onChange={e => handleThresholdChange('high_cost_lead', e.target.value)}
                    className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-text-secondary">
                <span className="font-bold text-primary-light">Monitoramento automático:</span>{' '}
                Erro de pagamento (cartão) e contas sem mensagens são verificados automaticamente, sem necessidade de configurar limites.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ═══ ALERTS ═══ */}
      <div className="bg-surface/50 rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-400" />
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
            <CheckCircle2 size={32} className="mx-auto text-emerald-400/30 mb-3" />
            <p className="text-sm text-text-secondary">Todas as contas estão dentro dos limites</p>
            <p className="text-xs text-text-secondary/60 mt-1">
              {accounts.length} contas monitoradas automaticamente
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
              { icon: CreditCard, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Erro no Pagamento', desc: 'Conta com cartão desativada ou saldo zerado em Pix/Boleto' },
              { icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Saldo Baixo', desc: `Crítico < R$ ${thresholds.balance_critical} • Atenção < R$ ${thresholds.balance_warning}` },
              { icon: TrendingDown, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Custo Alto por Lead', desc: `Alerta quando CPL > R$ ${thresholds.high_cost_lead}` },
              { icon: MessageSquareX, color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Sem Mensagens', desc: 'Conta gastando sem gerar nenhuma conversa' },
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
              Se houver alertas pendentes, um lembrete é enviado automaticamente nos horários (Brasília):
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {REMINDER_HOURS.map(h => (
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
