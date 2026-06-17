import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { formatCurrency, formatNumber } from '../../shared/utils/format';
import { FileText, Copy, Check, Loader2, Sparkles } from 'lucide-react';
import PeriodSelector from '../../shared/components/PeriodSelector';
import { fetchAccountInsights, fetchCampaignsWithInsights, getPreviousPeriodRange } from '../../services/metaApi';
import { buildInsightPack, formatPercentValue, formatFrequency } from '../../shared/utils/reportInsights';

import { PRESETS } from '../../shared/utils/dateUtils';
import { simplifyCampaignName } from '../../shared/utils/campaignName';

// ── Build a hashtag signature from the agency name ──
function buildAgencySignature(name) {
  const cleaned = String(name || '').trim().replace(/[^\p{L}\p{N}]+/gu, '');
  return cleaned ? ` #${cleaned.toUpperCase()}` : '';
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
  const frequency = parseFloat(data.frequency || 0);

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
    impressions, reach, costPerConversation, costPerEngagement, cpm, ctr, clicks, frequency,
  };
}

// ── Report text template ──
function buildReportText(d, options = {}) {
  const {
    showCampaignName = true,
    prev = null,
    agencyName = '',
  } = options;

  const signature = buildAgencySignature(agencyName);

  const entitySubject = showCampaignName ? 'A campanha' : 'A conta';
  const entityLine = (showCampaignName && d.campaignName) ? `📌 Campanha: ${d.campaignName}\n` : '';
  const insightPack = buildInsightPack(d, prev);
  const analysisBlock = insightPack.analysisLines.length > 0
    ? `\n${insightPack.analysisLines.map((line) => `- ${line}`).join('\n')}`
    : '';

  return `Excelente dia pessoal!

Segue relatório semanal 👇

⭐ Relatório de Desempenho ⭐

📅 Período Analisado: ${d.periodStart} a ${d.periodEnd}
${entityLine}
➡️ Valor Investido: ${formatCurrency(d.spend)}
➡️ Total de Conversas Iniciadas: ${formatNumber(d.conversations)}
➡️ Engajamentos com a publicação: ${formatNumber(d.engagements)}
➡️ Impressões: ${formatNumber(d.impressions)}
➡️ Alcance: ${formatNumber(d.reach)}
➡️ Custo por conversa: ${formatCurrency(d.costPerConversation)}
➡️ CTR: ${formatPercentValue(d.ctr)}
➡️ Frequência: ${formatFrequency(d.frequency)}

📈 Leitura da semana:
- Cada engajamento custou em média ${formatCurrency(d.costPerEngagement)}.
- O CPM ficou em ${formatCurrency(d.cpm)} para cada mil impressões.
- ${entitySubject} gerou ${formatNumber(d.clicks)} cliques no período.${analysisBlock}

📍 Próximos passos:
- ${insightPack.nextStep}

Fico a disposição para qualquer dúvida!
Obrigado e tenha uma excelente semana!${signature} 🚀`;
}



export default function ReportText() {
  const { accounts, selectedPeriod, setSelectedPeriod } = useMetaAds();
  const { agencies, accountAgencies } = useAgency();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedAgency, setSelectedAgency] = useState('');
  const [reportMode, setReportMode] = useState('all'); // 'all' | 'per_campaign'
  const [reportData, setReportData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

  // All registered agencies are available
  const allowedAgencyList = agencies;
  const hasAgencies = allowedAgencyList.length > 0;

  // Auto-select first agency (or 'all' fallback when none registered)
  useEffect(() => {
    if (!selectedAgency) {
      if (hasAgencies) {
        setSelectedAgency(allowedAgencyList[0]);
      } else {
        setSelectedAgency('__all__');
      }
    }
  }, [allowedAgencyList, selectedAgency, hasAgencies]);

  // Resolve the agency name used for the report signature
  const signatureAgency = useMemo(() => {
    if (selectedAgency && selectedAgency !== '__all__') return selectedAgency;
    return accountAgencies[selectedAccount] || '';
  }, [selectedAgency, selectedAccount, accountAgencies]);

  // Filter accounts by selected agency
  const filteredAccounts = useMemo(() => {
    if (selectedAgency === '__all__') return accounts;
    if (!selectedAgency) return [];
    return accounts.filter(a => accountAgencies[a.id] === selectedAgency);
  }, [accounts, selectedAgency, accountAgencies]);

  const normalizeCampaignName = useCallback((name) => {
    return simplifyCampaignName(name);
  }, []);

  // Auto-seleciona a primeira conta apenas quando nenhuma está selecionada.
  // Evita roubar a seleção durante o recarregamento progressivo das contas
  // ao trocar o período (a troca de agência já reseta a conta explicitamente).
  useEffect(() => {
    if (!selectedAccount && filteredAccounts.length > 0) {
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
      const agencyName = signatureAgency;

      if (reportMode === 'per_campaign') {
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
        setReportData({ mode: 'per_campaign', reports, agencyName });
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
        setReportData({ mode: 'all', report, prevReport, agencyName });
      }
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      setReportData({ error: `Erro: ${err.message}` });
    } finally {
      setGenerating(false);
    }
  }, [selectedAccount, selectedPeriod, reportMode, accounts, normalizeCampaignName, signatureAgency]);

  // Build report text(s)
  const reportTexts = useMemo(() => {
    if (!reportData || reportData.error) return [];

    if (reportData.mode === 'all') {
      return [{
        text: buildReportText(reportData.report, {
          showCampaignName: false,
          prev: reportData.prevReport,
          agencyName: reportData.agencyName,
        }),
        label: 'Relatório geral da conta',
      }];
    }

    if (reportData.mode === 'per_campaign') {
      return reportData.reports.map(r => ({
        text: buildReportText(r, {
          showCampaignName: true,
          prev: r._prev,
          agencyName: reportData.agencyName,
        }),
        label: r.campaignName,
      }));
    }

    return [];
  }, [reportData]);

  // Copy to clipboard
  const handleCopy = useCallback((text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((current) => (current === key ? '' : current));
      }, 2000);
    });
  }, []);

  const handleCopyAll = useCallback(() => {
    const all = reportTexts.map(r => r.text).join('\n\n' + '─'.repeat(40) + '\n\n');
    handleCopy(all, 'all');
  }, [reportTexts, handleCopy]);

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
        <div className="relative mt-5 grid grid-cols-1 min-[560px]:grid-cols-2 sm:flex sm:flex-wrap items-end justify-center gap-3 sm:gap-5">
          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[210px] z-50">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Período</label>
            <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} className="w-full" align="left" />
          </div>

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


        </div>

      </div>

      {/* REPORT OUTPUT */}
      {reportTexts.length > 0 && (
        <div className="space-y-4">
          {reportTexts.length > 1 && (
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCopyAll}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${copiedKey === 'all' ? 'bg-success/10 text-success border-success/30' : 'bg-surface border-border hover:border-primary/40 hover:text-primary text-text-secondary'
                  }`}
              >
                {copiedKey === 'all' ? <Check size={14} /> : <Copy size={14} />}
                {copiedKey === 'all' ? 'Copiado!' : `Copiar todos (${reportTexts.length})`}
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
                    onClick={() => handleCopy(r.text, `report-${i}`)}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium border transition-all ${copiedKey === `report-${i}` ? 'bg-success/10 text-success border-success/30' : 'bg-surface border-border hover:border-primary/40 hover:text-primary text-text-secondary'
                      }`}
                  >
                    {copiedKey === `report-${i}` ? <Check size={13} /> : <Copy size={13} />}
                    {copiedKey === `report-${i}` ? 'Copiado!' : 'Copiar texto'}
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
