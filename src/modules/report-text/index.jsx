import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { formatCurrency, formatNumber } from '../../shared/utils/format';
import { FileText, Copy, Check, Loader2, Sparkles, MessageSquare, Send, CheckCircle2 } from 'lucide-react';
import PeriodSelector from '../../shared/components/PeriodSelector';
import { fetchAccountInsights, fetchCampaignsWithInsights, getPreviousPeriodRange } from '../../services/metaApi';

import { PRESETS } from '../../shared/utils/dateUtils';
import { simplifyCampaignName, simplifyLaquilaCampaignName } from '../../shared/utils/campaignName';

const SLACK_WEBHOOK_LAQUILA = import.meta.env.VITE_SLACK_WEBHOOK_LAQUILA;
const SLACK_WEBHOOK_GDM = import.meta.env.VITE_SLACK_WEBHOOK_GDM;

// ── Allowed agencies for text reports ──
const ALLOWED_AGENCIES = ['gdm', 'laquila'];

function matchAgency(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('laquila') || n.includes("l'aquila") || n.includes('aquila')) return 'laquila';
  if (n.includes('gdm')) return 'gdm';
  return null;
}

// ── Helper: extract action value by type ──
function getActionValue(actions, actionType) {
  if (!actions || !Array.isArray(actions)) return 0;
  const found = actions.find(a => a.action_type === actionType);
  return found ? parseInt(found.value, 10) : 0;
}

function getActionValueMulti(actions, actionTypes) {
  if (!actions || !Array.isArray(actions)) return 0;
  for (const type of actionTypes) {
    const val = getActionValue(actions, type);
    if (val > 0) return val;
  }
  return 0;
}

function getActionValueSum(actions, actionTypes) {
  if (!actions || !Array.isArray(actions)) return 0;
  let total = 0;
  for (const type of actionTypes) {
    total += getActionValue(actions, type);
  }
  return total;
}

// ── Format date range for display ──
function formatPeriodLabel(period) {
  if (typeof period === 'object' && period.type === 'custom') {
    const fmt = (d) => { const parts = d.split('-'); return `${parts[2]}/${parts[1]}`; };
    return { start: fmt(period.startDate), end: fmt(period.endDate) };
  }
  const preset = PRESETS.find(p => p.id === period);
  if (preset) {
    const range = preset.getRange();
    const fmt = (d) => { const parts = d.split('-'); return `${parts[2]}/${parts[1]}`; };
    return { start: fmt(range.startDate), end: fmt(range.endDate) };
  }
  return { start: '??/??', end: '??/??' };
}

// ── Build report from insight data ──
function buildReportFromInsights(data, campaignName, periodDates) {
  const actions = data.actions || [];
  const spend = parseFloat(data.spend || 0);
  const impressions = parseInt(data.impressions || 0, 10);
  const reach = parseInt(data.reach || 0, 10);
  const cpm = parseFloat(data.cpm || 0);
  const ctr = parseFloat(data.ctr || 0);
  const clicks = parseInt(data.inline_link_clicks || data.clicks || 0, 10);

  const conversations = getActionValueMulti(actions, [
    'onsite_conversion.messaging_conversation_started_7d',
    'messaging_conversation_started_7d',
    'onsite_conversion.messaging_first_reply',
    'messaging_first_reply',
  ]);

  const engagements = getActionValueSum(actions, ['post_engagement']);

  const costPerConversation = conversations > 0 ? spend / conversations : 0;
  const costPerEngagement = engagements > 0 ? spend / engagements : 0;

  return {
    periodStart: periodDates.start,
    periodEnd: periodDates.end,
    campaignName,
    spend, conversations, engagements,
    impressions, reach, costPerConversation, costPerEngagement, cpm, ctr, clicks,
  };
}

// ── Helper: calcula variação percentual ──
function pctChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ── Helper: formata variação positiva ──
function formatImprovement(label, current, previous, formatter, invertedBetter = false) {
  const change = pctChange(current, previous);
  if (change === null) return null;
  // Para métricas onde menor é melhor (custo), inversão: queda = melhoria
  const improved = invertedBetter ? change < -5 : change > 5;
  if (!improved) return null;
  const pct = Math.abs(change).toFixed(0);
  const direction = invertedBetter ? 'reduziu' : 'aumentou';
  return `   ↳ ${label} ${direction} ${pct}% (antes: ${formatter(previous)})`;
}

// ── GDM text template ──
function buildTextGDM(d, showCampaignName = true, prev = null) {
  const campaignLine = showCampaignName ? `\n\uD83D\uDCCC ${d.campaignName}\n` : '';

  // Monta linhas de melhoria (só quando melhorou)
  const improvements = [];
  if (prev) {
    const checks = [
      formatImprovement('Custo por mensagem', d.costPerConversation, prev.costPerConversation, formatCurrency, true),
      formatImprovement('Conversas iniciadas', d.conversations, prev.conversations, formatNumber, false),
      formatImprovement('Engajamentos', d.engagements, prev.engagements, formatNumber, false),
      formatImprovement('CTR', d.ctr, prev.ctr, v => `${v.toFixed(2)}%`, false),
      formatImprovement('CPM', d.cpm, prev.cpm, formatCurrency, true),
      formatImprovement('Custo por engajamento', d.costPerEngagement, prev.costPerEngagement, formatCurrency, true),
      formatImprovement('Alcance', d.reach, prev.reach, formatNumber, false),
    ];
    for (const line of checks) {
      if (line) improvements.push(line);
    }
  }

  const improvementBlock = improvements.length > 0
    ? `\n\n📊 Comparação com período anterior:\n${improvements.join('\n')}`
    : '';

  return `Excelente dia pessoal!

Segue relatório semanal 👇

⭐ Relatório de Desempenho ⭐

📅 Período Analisado: ${d.periodStart} a ${d.periodEnd}
${campaignLine}
➡️ Valor Investido: ${formatCurrency(d.spend)}
➡️ Total de Conversas Iniciadas: ${formatNumber(d.conversations)}
➡️ Engajamentos com a publicação: ${formatNumber(d.engagements)}
➡️ Impressões: ${formatNumber(d.impressions)}

📈 Análise:
- Nesse período, cada mensagem teve um custo de ${formatCurrency(d.costPerConversation)}.
- Atingimos cerca de ${formatNumber(d.reach)} usuários.
- Cada engajamento nos custou mais ou menos ${formatCurrency(d.costPerEngagement)}.
- Gastamos cerca de ${formatCurrency(d.cpm)} para atingirmos 1 mil pessoas.
- A taxa de cliques (CTR) ficou em ${d.ctr > 0 ? `${d.ctr.toFixed(2)}%` : '0%'}.${improvementBlock}

Fico a disposição para qualquer dúvida!
Obrigado e tenha uma excelente semana! #GDM 🚀`;
}

// ── LAQUILA text template (multiple campaigns in one report) ──
function buildTextLaquila(reports, periodDates) {
  const header = `\u2B50 Relatório de Desempenho \u2B50

\uD83D\uDCC5 Período Analisado: ${periodDates.start} a ${periodDates.end}
`;

  const campaignBlocks = reports.map(d => {
    return `\uD83D\uDCCC  ${d.campaignName}
💰 Valor Investido: ${formatCurrency(d.spend)}
💬 Total de Conversas Iniciadas: ${formatNumber(d.conversations)}
\uD83D\uDCC9 Custo por Conversa Iniciada: ${formatCurrency(d.costPerConversation)}`;
  }).join('\n\n');

  return header + '\n' + campaignBlocks;
}

export default function ReportText() {
  const { accounts, campaigns, selectedPeriod, setSelectedPeriod } = useMetaAds();
  const { agencies, accountAgencies } = useAgency();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedAgency, setSelectedAgency] = useState('');
  const [reportMode, setReportMode] = useState('all'); // 'all' | 'per_campaign'
  const [reportData, setReportData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Filter agencies to only GDM and LAQUILA
  const allowedAgencyList = useMemo(() => {
    return agencies.filter(ag => matchAgency(ag) !== null);
  }, [agencies]);

  const hasAgencies = allowedAgencyList.length > 0;

  // Auto-select first allowed agency (or 'gdm' fallback)
  useEffect(() => {
    if (!selectedAgency) {
      if (hasAgencies) {
        setSelectedAgency(allowedAgencyList[0]);
      } else {
        setSelectedAgency('__all__');
      }
    }
  }, [allowedAgencyList, selectedAgency, hasAgencies]);

  // Detect which agency template to use
  const agencyType = useMemo(() => {
    if (selectedAgency === '__all__') return 'gdm';
    return matchAgency(selectedAgency) || 'gdm';
  }, [selectedAgency]);

  // Filter accounts by selected agency
  const filteredAccounts = useMemo(() => {
    if (selectedAgency === '__all__') return accounts;
    if (!selectedAgency) return [];
    return accounts.filter(a => accountAgencies[a.id] === selectedAgency);
  }, [accounts, selectedAgency, accountAgencies]);

  const _AccountCampaigns = useMemo(() => {
    if (!selectedAccount) return [];
    return campaigns.filter(c => c.accountId === selectedAccount);
  }, [campaigns, selectedAccount]);

  const normalizeCampaignName = useCallback((name) => {
    if (agencyType === 'laquila') {
      return simplifyLaquilaCampaignName(name);
    }
    return simplifyCampaignName(name);
  }, [agencyType]);

  useEffect(() => {
    if (filteredAccounts.length > 0 && !filteredAccounts.find(a => a.id === selectedAccount)) {
      setSelectedAccount(filteredAccounts[0].id);
    }
  }, [filteredAccounts, selectedAccount]);

  // Generate report
  const handleGenerate = useCallback(async () => {
    if (!selectedAccount) return;
    setGenerating(true);
    setReportData(null);

    try {
      const periodDates = formatPeriodLabel(selectedPeriod);

      if (agencyType === 'laquila') {
        const campData = await fetchCampaignsWithInsights(selectedAccount, selectedPeriod);
        if (!campData || campData.length === 0) {
          setReportData({ error: 'Sem campanhas com dados para o período selecionado.' });
          return;
        }
        const reports = campData
          .filter(c => c.insights?.data?.[0])
          .map(c => buildReportFromInsights(c.insights.data[0], normalizeCampaignName(c.name), periodDates))
          .filter(r => r.spend > 0);

        if (reports.length === 0) {
          setReportData({ error: 'Nenhuma campanha com dados de investimento no período.' });
          return;
        }
        setReportData({
          mode: reportMode === 'per_campaign' ? 'laquila_per_campaign' : 'laquila_all',
          reports,
          periodDates,
        });
      } else if (reportMode === 'per_campaign') {
        // GDM per-campaign
        const previousPeriod = getPreviousPeriodRange(selectedPeriod);
        const [campData, prevCampData] = await Promise.all([
          fetchCampaignsWithInsights(selectedAccount, selectedPeriod),
          fetchCampaignsWithInsights(selectedAccount, previousPeriod).catch(() => []),
        ]);
        if (!campData || campData.length === 0) {
          setReportData({ error: 'Sem campanhas com dados para o período selecionado.' });
          return;
        }

        // Mapa de período anterior por nome normalizado
        const prevMap = new Map();
        if (prevCampData && prevCampData.length > 0) {
          for (const c of prevCampData) {
            if (c.insights?.data?.[0]) {
              const name = normalizeCampaignName(c.name);
              prevMap.set(name.toLowerCase(), buildReportFromInsights(c.insights.data[0], name, periodDates));
            }
          }
        }

        const reports = campData
          .filter(c => c.insights?.data?.[0])
          .map(c => {
            const name = normalizeCampaignName(c.name);
            const report = buildReportFromInsights(c.insights.data[0], name, periodDates);
            report._prev = prevMap.get(name.toLowerCase()) || null;
            return report;
          })
          .filter(r => r.spend > 0);

        if (reports.length === 0) {
          setReportData({ error: 'Nenhuma campanha com dados de investimento no período.' });
          return;
        }
        setReportData({ mode: 'per_campaign', reports });
      } else {
        // GDM all campaigns (account-level)
        const previousPeriod = getPreviousPeriodRange(selectedPeriod);
        const [insights, prevInsights] = await Promise.all([
          fetchAccountInsights(selectedAccount, selectedPeriod),
          fetchAccountInsights(selectedAccount, previousPeriod).catch(() => null),
        ]);
        if (!insights) {
          setReportData({ error: 'Sem dados para o período selecionado.' });
          return;
        }
        const account = accounts.find(a => a.id === selectedAccount);
        const report = buildReportFromInsights(insights, account?.clientName || 'Conta', periodDates);
        const prevReport = prevInsights ? buildReportFromInsights(prevInsights, '', periodDates) : null;
        setReportData({ mode: 'all', report, prevReport });
      }
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      setReportData({ error: `Erro: ${err.message}` });
    } finally {
      setGenerating(false);
    }
  }, [selectedAccount, selectedPeriod, reportMode, accounts, agencyType, normalizeCampaignName]);

  // Build report text(s)
  const reportTexts = useMemo(() => {
    if (!reportData || reportData.error) return [];

    if (reportData.mode === 'laquila_all') {
      return [{ text: buildTextLaquila(reportData.reports, reportData.periodDates), label: 'Relatório Laquila' }];
    }

    if (reportData.mode === 'laquila_per_campaign') {
      return [{
        text: buildTextLaquila(reportData.reports, reportData.periodDates),
        label: 'Relatório Laquila por campanha',
      }];
    }

    if (reportData.mode === 'all') {
      return [{ text: buildTextGDM(reportData.report, false, reportData.prevReport), label: 'Relatório geral da conta' }];
    }

    if (reportData.mode === 'per_campaign') {
      return reportData.reports.map(r => ({
        text: buildTextGDM(r, true, r._prev),
        label: r.campaignName,
      }));
    }

    return [];
  }, [reportData]);

  // Copy to clipboard
  const handleCopy = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleCopyAll = useCallback(() => {
    const all = reportTexts.map(r => r.text).join('\n\n' + '─'.repeat(40) + '\n\n');
    handleCopy(all);
  }, [reportTexts, handleCopy]);

  // ── Laquila: generate all accounts report and send to Slack ──
  const [sendingLaquila, setSendingLaquila] = useState(false);
  const [laquilaSent, setLaquilaSent] = useState(false);
  const [laquilaError, setLaquilaError] = useState(null);

  const laquilaAccounts = useMemo(() => {
    return accounts.filter(a => {
      const ag = accountAgencies[a.id];
      return ag && matchAgency(ag) === 'laquila';
    });
  }, [accounts, accountAgencies]);

  const handleSendLaquilaSlack = useCallback(async () => {
    if (laquilaAccounts.length === 0) {
      setLaquilaError('Nenhuma conta Laquila encontrada. Verifique as agências nas Configurações.');
      return;
    }
    setSendingLaquila(true);
    setLaquilaSent(false);
    setLaquilaError(null);

    try {
      const periodDates = formatPeriodLabel(selectedPeriod);
      const messages = [];

      for (const account of laquilaAccounts) {
        const accountCampaigns = campaigns.filter(c => c.accountId === account.id && Number(c.metrics?.spend || 0) > 0);
        if (accountCampaigns.length === 0) continue;

        const reports = accountCampaigns.map(c => ({
          campaignName: simplifyLaquilaCampaignName(c.name),
          spend: Number(c.metrics?.spend || 0),
          conversations: Number(c.metrics?.messages || 0),
          costPerConversation: Number(c.metrics?.costPerMessage || 0),
        }));

        // Use the exact same template as the platform
        const text = `🏢 *${account.clientName}*\n\n` + buildTextLaquila(reports, periodDates);
        messages.push(text);
      }

      if (messages.length === 0) {
        setLaquilaError('Nenhuma conta Laquila com dados de campanhas no período selecionado.');
        return;
      }

      // Send each account as a separate Slack message (same text as platform)
      for (const text of messages) {
        try {
          await fetch(SLACK_WEBHOOK_LAQUILA, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `payload=${encodeURIComponent(JSON.stringify({ text }))}`,
          });
        } catch (e) {
          throw new Error('Falha ao enviar mensagem para o Slack');
        }
      }

      setLaquilaSent(true);
      setTimeout(() => setLaquilaSent(false), 4000);
    } catch (err) {
      console.error('[ReportText] Erro ao enviar relatórios Laquila para Slack:', err);
      const msg = err.message || 'Erro desconhecido';
      if (msg.includes('Load failed') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setLaquilaError('Erro de rede: não foi possível conectar ao Slack.');
      } else {
        setLaquilaError(`Erro: ${msg}`);
      }
    } finally {
      setSendingLaquila(false);
    }
  }, [laquilaAccounts, campaigns, selectedPeriod]);

  // ── GDM: generate all accounts report and send to Slack ──
  const [sendingGdm, setSendingGdm] = useState(false);
  const [gdmSent, setGdmSent] = useState(false);
  const [gdmError, setGdmError] = useState(null);

  const gdmAccounts = useMemo(() => {
    return accounts.filter(a => {
      const ag = accountAgencies[a.id];
      return ag && matchAgency(ag) === 'gdm';
    });
  }, [accounts, accountAgencies]);

  const handleSendGdmSlack = useCallback(async () => {
    if (gdmAccounts.length === 0) {
      setGdmError('Nenhuma conta GDM encontrada. Verifique as agências nas Configurações.');
      return;
    }
    setSendingGdm(true);
    setGdmSent(false);
    setGdmError(null);

    try {
      const periodDates = formatPeriodLabel(selectedPeriod);
      const messages = [];

      for (const account of gdmAccounts) {
        const accountCampaigns = campaigns.filter(c => c.accountId === account.id && Number(c.metrics?.spend || 0) > 0);
        if (accountCampaigns.length === 0) continue;

        // Aggregate all campaigns into one report object (same shape as buildReportFromInsights)
        const totalSpend = accountCampaigns.reduce((s, c) => s + Number(c.metrics?.spend || 0), 0);
        const totalConversations = accountCampaigns.reduce((s, c) => s + Number(c.metrics?.messages || 0), 0);
        const totalImpressions = accountCampaigns.reduce((s, c) => s + Number(c.metrics?.impressions || 0), 0);
        const totalReach = accountCampaigns.reduce((s, c) => s + Number(c.metrics?.reach || 0), 0);
        const totalEngagements = accountCampaigns.reduce((s, c) => s + Number(c.metrics?.engagements || 0), 0);
        const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
        const avgCtr = accountCampaigns.reduce((s, c) => s + Number(c.metrics?.ctr || 0), 0) / accountCampaigns.length;

        const reportData = {
          periodStart: periodDates.start,
          periodEnd: periodDates.end,
          campaignName: account.clientName,
          spend: totalSpend,
          conversations: totalConversations,
          engagements: totalEngagements,
          impressions: totalImpressions,
          reach: totalReach,
          costPerConversation: totalConversations > 0 ? totalSpend / totalConversations : 0,
          costPerEngagement: totalEngagements > 0 ? totalSpend / totalEngagements : 0,
          cpm: avgCpm,
          ctr: avgCtr,
        };

        // Use the exact same template as the platform
        const text = buildTextGDM(reportData, true, null);
        messages.push(text);
      }

      if (messages.length === 0) {
        setGdmError('Nenhuma conta GDM com dados de campanhas no período selecionado.');
        return;
      }

      // Send each account as a separate Slack message (same text as platform)
      for (const text of messages) {
        try {
          await fetch(SLACK_WEBHOOK_GDM, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `payload=${encodeURIComponent(JSON.stringify({ text }))}`,
          });
        } catch (e) {
          throw new Error('Falha ao enviar mensagem para o Slack');
        }
      }

      setGdmSent(true);
      setTimeout(() => setGdmSent(false), 4000);
    } catch (err) {
      console.error('[ReportText] Erro ao enviar relatórios GDM para Slack:', err);
      const msg = err.message || 'Erro desconhecido';
      if (msg.includes('Load failed') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setGdmError('Erro de rede: não foi possível conectar ao Slack.');
      } else {
        setGdmError(`Erro: ${msg}`);
      }
    } finally {
      setSendingGdm(false);
    }
  }, [gdmAccounts, campaigns, selectedPeriod]);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="relative z-10 rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-5 lg:p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>

        {/* Title aligned LEFT */}
        <div className="relative flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
            <FileText size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-text-primary tracking-tight">Relatório em Texto</h1>
            <p className="text-xs lg:text-sm text-text-secondary">Gere relatórios prontos para envio ao cliente</p>
          </div>
        </div>

        {/* Selectors */}
        <div className="relative mt-5 grid grid-cols-2 sm:flex sm:flex-wrap items-end justify-center gap-3 sm:gap-5">
          {hasAgencies ? (
            <div className="flex flex-col gap-1.5 col-span-1 sm:w-[210px]">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Agência</label>
              <select
                value={selectedAgency}
                onChange={e => { setSelectedAgency(e.target.value); setSelectedAccount(''); }}
                className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
              >
                {allowedAgencyList.map(ag => <option key={ag} value={ag}>{ag}</option>)}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[295px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Conta</label>
            <select
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
            >
              <option value="">Selecione uma conta</option>
              {filteredAccounts.map(a => <option key={a.id} value={a.id}>{a.clientName}</option>)}
            </select>
          </div>

          {/* Modo */}
          {(agencyType === 'gdm' || agencyType === 'laquila') && (
            <div className="flex flex-col gap-1.5 col-span-1 sm:w-[210px]">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Modo</label>
              <select
                value={reportMode}
                onChange={e => setReportMode(e.target.value)}
                className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
              >
                <option value="all">Todas as campanhas</option>
                <option value="per_campaign">Por campanha</option>
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[210px] z-50">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Período</label>
            <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} className="w-full" />
          </div>
        </div>

        {/* Action Row */}
        <div className="relative mt-6 flex items-center justify-center gap-4 flex-wrap">
          <button
            onClick={handleGenerate}
            disabled={!selectedAccount || generating}
            className="group relative inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-primary to-primary-light text-white shadow-lg shadow-primary/25
              hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
              transition-all duration-300 ease-out"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generating ? 'Gerando...' : 'Gerar Relatório'}
            <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>

          {agencyType === 'laquila' && (
            <button
              onClick={handleSendLaquilaSlack}
              disabled={sendingLaquila || laquilaAccounts.length === 0}
              className="group relative inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
                bg-gradient-to-r from-[#4A154B] to-[#611f69] text-white shadow-lg shadow-[#4A154B]/25
                hover:shadow-xl hover:shadow-[#4A154B]/30 hover:scale-[1.02] active:scale-[0.98]
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
                transition-all duration-300 ease-out"
            >
              {sendingLaquila ? <Loader2 size={16} className="animate-spin" /> : laquilaSent ? <CheckCircle2 size={16} /> : <Send size={16} />}
              {sendingLaquila ? 'Enviando...' : laquilaSent ? 'Enviado ao Slack!' : `Todos Laquila → Slack (${laquilaAccounts.length})`}
              <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          )}

          {agencyType === 'gdm' && (
            <button
              onClick={handleSendGdmSlack}
              disabled={sendingGdm || gdmAccounts.length === 0}
              className="group relative inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
                bg-gradient-to-r from-[#4A154B] to-[#611f69] text-white shadow-lg shadow-[#4A154B]/25
                hover:shadow-xl hover:shadow-[#4A154B]/30 hover:scale-[1.02] active:scale-[0.98]
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
                transition-all duration-300 ease-out"
            >
              {sendingGdm ? <Loader2 size={16} className="animate-spin" /> : gdmSent ? <CheckCircle2 size={16} /> : <Send size={16} />}
              {sendingGdm ? 'Enviando...' : gdmSent ? 'Enviado ao Slack!' : `Todos GDM → Slack (${gdmAccounts.length})`}
              <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          )}
        </div>

        {laquilaError && agencyType === 'laquila' && (
          <div className="relative mt-3 mx-auto max-w-lg rounded-lg bg-danger/10 border border-danger/30 px-4 py-2.5 text-center">
            <p className="text-sm text-danger">{laquilaError}</p>
          </div>
        )}
        {gdmError && agencyType === 'gdm' && (
          <div className="relative mt-3 mx-auto max-w-lg rounded-lg bg-danger/10 border border-danger/30 px-4 py-2.5 text-center">
            <p className="text-sm text-danger">{gdmError}</p>
          </div>
        )}
      </div>

      {/* REPORT OUTPUT */}
      {reportTexts.length > 0 && (
        <div className="space-y-4">
          {reportTexts.length > 1 && (
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCopyAll}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${copied ? 'bg-success/10 text-success border-success/30' : 'bg-surface border-border hover:border-primary/40 hover:text-primary text-text-secondary'
                  }`}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copiado!' : `Copiar todos (${reportTexts.length})`}
              </button>
            </div>
          )}

          {reportTexts.map((r, i) => (
            <div key={i} className="relative bg-surface rounded-2xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-bg/30">
                <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  {reportTexts.length > 1 ? `${i + 1}/${reportTexts.length} — ${r.label}` : 'Relatório gerado'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(r.text)}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium border transition-all ${copied ? 'bg-success/10 text-success border-success/30' : 'bg-surface border-border hover:border-primary/40 hover:text-primary text-text-secondary'
                      }`}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Copiado!' : 'Copiar texto'}
                  </button>
                </div>
              </div>
              <div className="p-6">
                <pre className="whitespace-pre-wrap text-sm text-text-primary font-sans leading-relaxed select-all">
                  {r.text}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {reportData?.error && (
        <div className="bg-surface rounded-2xl border border-danger/30 p-6 text-center">
          <p className="text-danger text-sm">{reportData.error}</p>
        </div>
      )}

      {!reportData && !generating && (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center">
          <FileText size={48} className="text-text-secondary/20 mx-auto mb-4" />
          <p className="text-text-secondary text-sm">Selecione uma agência, conta, período e clique em "Gerar Relatório"</p>
        </div>
      )}

    </div>
  );
}
