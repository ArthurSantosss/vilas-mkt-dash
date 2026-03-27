import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { formatCurrency, formatNumber } from '../../shared/utils/format';
import { FileText, Copy, Check, Loader2, Sparkles, MessageSquare, Zap } from 'lucide-react';
import PeriodSelector from '../../shared/components/PeriodSelector';
import { fetchAccountInsights, fetchCampaignsWithInsights } from '../../services/metaApi';
import { PRESETS } from '../../shared/utils/dateUtils';
import { supabase } from '../../services/supabase';

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

// ── Simplify campaign name ──
function simplifyCampaignName(fullName) {
  let name = fullName;
  name = name.replace(/^C\d+\s*-\s*GDM\s*/i, '');
  name = name.replace(/\[.*?\]/g, '').trim();
  if (!name || name.length < 3) return fullName;
  return name.replace(/\s+/g, ' ').trim();
}

// ── Build report from insight data ──
function buildReportFromInsights(data, campaignName, periodDates) {
  const actions = data.actions || [];
  const spend = parseFloat(data.spend || 0);
  const impressions = parseInt(data.impressions || 0, 10);
  const reach = parseInt(data.reach || 0, 10);
  const cpm = parseFloat(data.cpm || 0);

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
    impressions, reach, costPerConversation, costPerEngagement, cpm,
  };
}

// ── GDM text template ──
function buildTextGDM(d, showCampaignName = true) {
  const campaignLine = showCampaignName ? `\n\uD83D\uDCCC ${d.campaignName}\n` : '';
  return `Excelente dia pessoal!

Segue relatório semanal 👇

\u2B50 Relatório de Desempenho \u2B50

\uD83D\uDCC5 Período Analisado: ${d.periodStart} a ${d.periodEnd}
${campaignLine}
➡️ Valor Investido: ${formatCurrency(d.spend)}
➡️ Total de Conversas Iniciadas: ${formatNumber(d.conversations)}
➡️ Engajamentos com a publicação: ${formatNumber(d.engagements)}
➡️ Impress\u00F5es: ${formatNumber(d.impressions)}

\uD83D\uDCC8 Análise:
- Nesse período, cada mensagem teve um custo de ${formatCurrency(d.costPerConversation)}.
- Atingimos cerca de ${formatNumber(d.reach)} usuários.
- Cada engajamento nos custou mais ou menos ${formatCurrency(d.costPerEngagement)}.
- Gastamos cerca de ${formatCurrency(d.cpm)} para atingirmos 1 mil pessoas.

Fico a disposição para qualquer dúvida!
Obrigado e tenha uma excelente semana! #GDM \uD83D\uDE80`;
}

// ── LAQUILA text template (multiple campaigns in one report) ──
function buildTextLaquila(reports, periodDates) {
  const header = `\u2B50 Relatório de Desempenho \u2B50

\uD83D\uDCC5 Período Analisado: ${periodDates.start} a ${periodDates.end}
`;

  const campaignBlocks = reports.map(d => {
    return `\uD83D\uDCCC Tese: ${d.campaignName}
➡️ Valor Investido: ${formatCurrency(d.spend)}
➡️ Total de Conversas Iniciadas: ${formatNumber(d.conversations)}
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
  const [sendingDiscordAll, setSendingDiscordAll] = useState(false);
  const [discordSuccess, setDiscordSuccess] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

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
        // LAQUILA: always per-campaign, single combined report
        const campData = await fetchCampaignsWithInsights(selectedAccount, selectedPeriod);
        if (!campData || campData.length === 0) {
          setReportData({ error: 'Sem campanhas com dados para o período selecionado.' });
          return;
        }
        const reports = campData
          .filter(c => c.insights?.data?.[0])
          .map(c => buildReportFromInsights(c.insights.data[0], simplifyCampaignName(c.name), periodDates))
          .filter(r => r.spend > 0);

        if (reports.length === 0) {
          setReportData({ error: 'Nenhuma campanha com dados de investimento no período.' });
          return;
        }
        setReportData({ mode: 'laquila', reports, periodDates });
      } else if (reportMode === 'per_campaign') {
        // GDM per-campaign
        const campData = await fetchCampaignsWithInsights(selectedAccount, selectedPeriod);
        if (!campData || campData.length === 0) {
          setReportData({ error: 'Sem campanhas com dados para o período selecionado.' });
          return;
        }
        const reports = campData
          .filter(c => c.insights?.data?.[0])
          .map(c => buildReportFromInsights(c.insights.data[0], simplifyCampaignName(c.name), periodDates))
          .filter(r => r.spend > 0);

        if (reports.length === 0) {
          setReportData({ error: 'Nenhuma campanha com dados de investimento no período.' });
          return;
        }
        setReportData({ mode: 'per_campaign', reports });
      } else {
        // GDM all campaigns (account-level)
        const insights = await fetchAccountInsights(selectedAccount, selectedPeriod);
        if (!insights) {
          setReportData({ error: 'Sem dados para o período selecionado.' });
          return;
        }
        const account = accounts.find(a => a.id === selectedAccount);
        const report = buildReportFromInsights(insights, account?.clientName || 'Conta', periodDates);
        setReportData({ mode: 'all', report });
      }
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      setReportData({ error: `Erro: ${err.message}` });
    } finally {
      setGenerating(false);
    }
  }, [selectedAccount, selectedPeriod, reportMode, accounts, agencyType]);

  // Build report text(s)
  const reportTexts = useMemo(() => {
    if (!reportData || reportData.error) return [];

    if (reportData.mode === 'laquila') {
      // Single combined report for LAQUILA
      return [{ text: buildTextLaquila(reportData.reports, reportData.periodDates), label: 'Relatório Laquila' }];
    }

    if (reportData.mode === 'all') {
      return [{ text: buildTextGDM(reportData.report, false), label: 'Relatório geral da conta' }];
    }

    if (reportData.mode === 'per_campaign') {
      return reportData.reports.map(r => ({
        text: buildTextGDM(r, true),
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

  // Send to Discord
  const handleSendDiscordAll = useCallback(async () => {
    setSendingDiscordAll(true);
    setDiscordSuccess(false);
    try {
      const webhookUrl = 'https://discord.com/api/webhooks/1485682722289483966/zf5hPB77jc7Auucu-dUlGTehe2aSk37_V8FIqimSjM8B71N2QHhkElQVnk2KWbJA0IYn';
      const all = reportTexts.map(r => r.text).join('\n\n' + '─'.repeat(40) + '\n\n');

      const chunks = all.match(/[\s\S]{1,1900}/g) || [];
      for (const chunk of chunks) {
         await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: chunk })
         });
      }
      setDiscordSuccess(true);
      setTimeout(() => setDiscordSuccess(false), 2000);
    } catch (e) {
      console.error(e);
      alert('Erro ao enviar para o Discord');
    } finally {
      setSendingDiscordAll(false);
    }
  }, [reportTexts]);

  // Generate AI Analysis
  const handleGenerateAI = useCallback(async () => {
    if (!selectedAccount) return;
    setLoadingAI(true);
    setAiAnalysis(null);
    try {
      const account = accounts.find(a => a.id === selectedAccount);
      const periodLabel = formatPeriodLabel(selectedPeriod);
      const campaignsData = await fetchCampaignsWithInsights(selectedAccount, selectedPeriod);

      const campaignsForAI = (campaignsData || [])
        .filter(c => c.insights?.data?.[0])
        .map(c => {
          const insight = c.insights.data[0];
          return {
            id: c.id,
            name: c.name,
            spend: parseFloat(insight.spend || 0),
            impressions: parseInt(insight.impressions || 0, 10),
            reach: parseInt(insight.reach || 0, 10),
            cpm: parseFloat(insight.cpm || 0),
          };
        });

      if (campaignsForAI.length === 0) {
        setAiAnalysis({ error: 'Sem campanhas com dados para análise.' });
        return;
      }

      const { data: aiData, error: fnError } = await supabase.functions.invoke('analyze-campaign', {
        body: {
          accountName: account?.clientName || '',
          platform: 'Meta Ads',
          periodLabel: `${periodLabel.start} a ${periodLabel.end}`,
          todayDate: new Date().toLocaleDateString('pt-BR'),
          campaigns: campaignsForAI,
        },
      });

      if (fnError) throw fnError;
      if (aiData?.error) throw new Error(aiData.error);

      setAiAnalysis({ analysis: aiData.relatorio || aiData || 'Análise gerada com sucesso.' });
    } catch (err) {
      console.error('Erro ao gerar análise com IA:', err);
      setAiAnalysis({ error: `Erro: ${err.message}` });
    } finally {
      setLoadingAI(false);
    }
  }, [selectedAccount, selectedPeriod, accounts]);

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
        <div className="relative mt-5 flex flex-wrap items-end justify-center gap-5">
          {hasAgencies ? (
            <div className="flex flex-col gap-1.5 w-[210px]">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Agência</label>
              <select
                value={selectedAgency}
                onChange={e => { setSelectedAgency(e.target.value); setSelectedAccount(''); }}
                className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
              >
                {allowedAgencyList.map(ag => <option key={ag} value={ag}>{ag}</option>)}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 w-[295px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Conta</label>
            <select
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
            >
              <option value="">Selecione uma conta</option>
              {filteredAccounts.map(a => <option key={a.id} value={a.id}>{a.clientName}</option>)}
            </select>
          </div>

          {/* Modo: only for GDM */}
          {agencyType === 'gdm' && (
            <div className="flex flex-col gap-1.5 w-[210px]">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Modo</label>
              <select
                value={reportMode}
                onChange={e => setReportMode(e.target.value)}
                className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
              >
                <option value="all">Todas as campanhas</option>
                <option value="per_campaign">Separado por campanha</option>
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5 w-[210px] z-50">
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

          <button
            onClick={handleGenerateAI}
            disabled={!selectedAccount || loadingAI}
            className="group relative inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-warning to-warning/80 text-black shadow-lg shadow-warning/25
              hover:shadow-xl hover:shadow-warning/30 hover:scale-[1.02] active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
              transition-all duration-300 ease-out"
          >
            {loadingAI ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {loadingAI ? 'Gerando...' : 'Gerar Análise com IA'}
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
                onClick={handleSendDiscordAll}
                disabled={sendingDiscordAll}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  discordSuccess ? 'bg-[#5865F2]/10 text-[#5865F2] border-[#5865F2]/30' : 'bg-surface border-border hover:border-[#5865F2]/40 hover:text-[#5865F2] text-text-secondary'
                }`}
              >
                {sendingDiscordAll ? <Loader2 size={14} className="animate-spin" /> : (discordSuccess ? <Check size={14} /> : <MessageSquare size={14} />)}
                {sendingDiscordAll ? 'Enviando...' : (discordSuccess ? 'Enviado!' : 'Enviar para Discord')}
              </button>
              <button
                onClick={handleCopyAll}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  copied ? 'bg-success/10 text-success border-success/30' : 'bg-surface border-border hover:border-primary/40 hover:text-primary text-text-secondary'
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
                    onClick={async () => {
                      try {
                        const webhookUrl = 'https://discord.com/api/webhooks/1485682722289483966/zf5hPB77jc7Auucu-dUlGTehe2aSk37_V8FIqimSjM8B71N2QHhkElQVnk2KWbJA0IYn';
                        const chunks = r.text.match(/[\s\S]{1,1900}/g) || [];
                        for (const chunk of chunks) {
                           await fetch(webhookUrl, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ content: chunk })
                           });
                        }
                        alert('Enviado com sucesso para o Discord!');
                      } catch (e) {
                        console.error(e);
                        alert('Erro ao enviar para o Discord');
                      }
                    }}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium border transition-all bg-surface border-border hover:border-[#5865F2]/40 hover:text-[#5865F2] text-text-secondary`}
                  >
                    <MessageSquare size={13} />
                    Enviar Discord
                  </button>
                  <button
                    onClick={() => handleCopy(r.text)}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      copied ? 'bg-success/10 text-success border-success/30' : 'bg-surface border-border hover:border-primary/40 hover:text-primary text-text-secondary'
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

      {/* AI ANALYSIS */}
      {aiAnalysis && (
        <div className="relative bg-gradient-to-br from-warning/10 to-warning/5 rounded-2xl border border-warning/30 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-warning/5 blur-3xl" />
          </div>
          <div className="relative p-6">
            <div className="flex items-center gap-3 mb-4">
              <Zap size={20} className="text-warning" />
              <h3 className="text-lg font-bold text-text-primary">Análise com IA</h3>
            </div>
            {aiAnalysis.error ? (
              <div className="text-danger text-sm">{aiAnalysis.error}</div>
            ) : (
              <div className="prose prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed font-sans">
                  {aiAnalysis.analysis}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
