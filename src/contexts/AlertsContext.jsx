import { createContext, useContext, useState, useMemo } from 'react';
import { useMetaAds } from './MetaAdsContext';

const AlertsContext = createContext();

/**
 * Generates real-time alerts based on live account/campaign data.
 */
function generateAlerts(metaAccounts, metaBalances, metaCampaigns) {
  const alerts = [];
  let id = 1;
  const now = new Date().toISOString();

  // ── 1. Low balance alerts (Meta) ──
  metaBalances.forEach(b => {
    if (b.currentBalance > 0 && b.currentBalance < 50) {
      alerts.push({
        id: id++,
        type: 'critical',
        platform: 'meta',
        accountName: b.clientName,
        message: `Saldo muito baixo: ${fmtR$(b.currentBalance)}. Recarregue para evitar pausas.`,
        timestamp: now,
      });
    } else if (b.currentBalance >= 50 && b.currentBalance < 150) {
      alerts.push({
        id: id++,
        type: 'warning',
        platform: 'meta',
        accountName: b.clientName,
        message: `Saldo em atenção: ${fmtR$(b.currentBalance)}. Estimativa de ${b.estimatedDaysRemaining > 0 ? b.estimatedDaysRemaining.toFixed(1) : '?'} dias restantes.`,
        timestamp: now,
      });
    }
  });

  // ── 2. Active campaigns with zero spend (Meta) ──
  metaCampaigns.forEach(c => {
    if (c.status === 'active' && c.metrics && c.metrics.spend === 0) {
      alerts.push({
        id: id++,
        type: 'warning',
        platform: 'meta',
        accountName: c.name,
        message: `Campanha ativa sem gasto no período. Verifique saldo, orçamento ou aprovação.`,
        timestamp: now,
      });
    }
  });

  // ── 3. High CPM (Meta — accounts above 2× average) ──
  const metaActive = metaAccounts.filter(a => a.status === 'active' && a.metrics?.spend > 0);
  if (metaActive.length > 1) {
    const cpms = metaActive.map(a => a.metrics.cpm).filter(v => v > 0);
    const avgCpm = cpms.length > 0 ? cpms.reduce((s, v) => s + v, 0) / cpms.length : 0;
    metaActive.forEach(a => {
      if (a.metrics.cpm > avgCpm * 2 && avgCpm > 0) {
        alerts.push({
          id: id++,
          type: 'warning',
          platform: 'meta',
          accountName: a.clientName,
          message: `CPM de ${fmtR$(a.metrics.cpm)} está ${(a.metrics.cpm / avgCpm).toFixed(1)}× acima da média (${fmtR$(avgCpm)}).`,
          timestamp: now,
        });
      }
    });
  }

  // ── 4. High frequency campaigns (Meta, freq > 3) ──
  metaCampaigns.forEach(c => {
    const freq = c.metrics?.frequency || 0;
    if (freq > 3 && c.metrics?.spend > 0) {
      alerts.push({
        id: id++,
        type: 'warning',
        platform: 'meta',
        accountName: c.name,
        message: `Frequência alta (${freq.toFixed(1)}). Público pode estar saturado — renove criativos ou amplie audiência.`,
        timestamp: now,
      });
    }
  });

  // ── 5. Sharp spend drops (Meta — today vs yesterday, >60% drop) ──
  metaAccounts.forEach(a => {
    const daily = a.dailyMetrics;
    if (daily && daily.length >= 2) {
      const today = daily[daily.length - 1]?.spend || 0;
      const yesterday = daily[daily.length - 2]?.spend || 0;
      if (yesterday > 5 && today < yesterday * 0.4) {
        const dropPct = ((1 - today / yesterday) * 100).toFixed(0);
        alerts.push({
          id: id++,
          type: 'critical',
          platform: 'meta',
          accountName: a.clientName,
          message: `Queda de ${dropPct}% no gasto vs. ontem (${fmtR$(today)} → ${fmtR$(yesterday)}). Verifique campanhas e saldo.`,
          timestamp: now,
        });
      }
    }
  });

  // ── 6. High cost per message (Meta, > R$10) ──
  metaAccounts.forEach(a => {
    const cpm = a.metrics?.costPerMessage || 0;
    if (cpm > 10 && a.metrics?.messagingConversationsStarted > 0) {
      alerts.push({
        id: id++,
        type: 'info',
        platform: 'meta',
        accountName: a.clientName,
        message: `Custo por conversa elevado: ${fmtR$(cpm)}. Revise públicos e criativos para otimizar.`,
        timestamp: now,
      });
    }
  });

  // Sort: critical first, then warning, then info
  const priority = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => priority[a.type] - priority[b.type]);

  return alerts;
}

function fmtR$(val) {
  return `R$ ${val.toFixed(2).replace('.', ',')}`;
}

export function AlertsProvider({ children }) {
  const { accounts: metaAccounts, balances: metaBalances, campaigns: metaCampaigns } = useMetaAds();

  const [readIds, setReadIds] = useState(new Set());

  const generatedAlerts = useMemo(
    () => generateAlerts(metaAccounts, metaBalances, metaCampaigns),
    [metaAccounts, metaBalances, metaCampaigns]
  );

  const alerts = useMemo(
    () => generatedAlerts.map(a => ({ ...a, read: readIds.has(a.id) })),
    [generatedAlerts, readIds]
  );

  const unreadCount = useMemo(() => alerts.filter(a => !a.read).length, [alerts]);
  const criticalCount = useMemo(() => alerts.filter(a => a.type === 'critical' && !a.read).length, [alerts]);

  const markAsRead = (alertId) => {
    setReadIds(prev => new Set([...prev, alertId]));
  };

  const markAllAsRead = () => {
    setReadIds(new Set(generatedAlerts.map(a => a.id)));
  };

  const value = { alerts, unreadCount, criticalCount, markAsRead, markAllAsRead };
  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAlerts() {
  const ctx = useContext(AlertsContext);
  if (!ctx) throw new Error('useAlerts must be used within AlertsProvider');
  return ctx;
}
