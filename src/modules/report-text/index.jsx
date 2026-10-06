import { useReportSession, useReportAccounts, useReportResult, useReportPeriod } from '../reports/useReportSession';
import ReportCampaignFilter from '../../shared/components/ReportCampaignFilter';
import { useState, useMemo, useCallback, useEffect } from 'react';
import PlatformFilter from '../../shared/components/PlatformFilter';
import ReportFormatSelector from '../../shared/components/ReportFormatSelector';
import { googleTextData } from '../../shared/utils/googleReports';
import { useAgency } from '../../contexts/AgencyContext';
import { FileText, Copy, Check, Loader2, Sparkles } from 'lucide-react';
import PeriodSelector from '../../shared/components/PeriodSelector';
import { getPreviousPeriodRange } from '../../services/metaApi';
import { buildReportFromInsights, buildReportText } from '../../shared/utils/reportText';

import { PRESETS } from '../../shared/utils/dateUtils';
import { FILTER_ROW, FILTER_FIELD, FILTER_LABEL, FILTER_CONTROL } from '../../shared/constants/filterStyles';

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

export default function ReportText() {
  const { platform } = useReportSession();
  return <ReportTextContent key={platform} />;
}
function ReportTextContent() {
  const { platform, onPlatformChange, selectedAgency, setSelectedAgency, selectedAccount, setSelectedAccount,
    selectedCampaignIds, setSelectedCampaignIds, selectedPeriod: periodSelection, setSelectedPeriod,
    requests, refreshData } = useReportSession();
  const selectedPeriod = useReportPeriod();
  const { accounts, campaigns, campaignsLoading, campaignsError } = useReportAccounts();
  const { agencies, accountAgencies } = useAgency();
  const [reportData, startReport] = useReportResult('text');
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
  }, [allowedAgencyList, selectedAgency, hasAgencies, setSelectedAgency]);

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

  const accountCampaigns = useMemo(() => campaigns
    .filter(campaign => campaign.accountId === selectedAccount && (campaign.metrics?.spend || 0) > 0)
    .sort((a, b) => (b.metrics?.spend || 0) - (a.metrics?.spend || 0) || a.name.localeCompare(b.name, 'pt-BR')),
  [campaigns, selectedAccount]);

  useEffect(() => {
    if (campaignsLoading || campaignsError) return;
    const availableIds = new Set(accountCampaigns.map(campaign => campaign.id));
    setSelectedCampaignIds(prev => {
      const next = prev.filter(id => availableIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [accountCampaigns, campaignsLoading, campaignsError, setSelectedCampaignIds]);

  // Auto-seleciona a primeira conta apenas quando nenhuma está selecionada.
  // Evita roubar a seleção durante o recarregamento progressivo das contas
  // ao trocar o período (a troca de agência já reseta a conta explicitamente).
  useEffect(() => {
    if (!selectedAccount && filteredAccounts.length > 0) {
      setSelectedAccount(filteredAccounts[0].id);
    }
  }, [filteredAccounts, selectedAccount, setSelectedAccount]);

  // Generate report
  const handleGenerate = useCallback(async () => {
    if (!selectedAccount) return;
    const setReportData = startReport();
    setGenerating(true);

    try {
      if (platform === 'google') {
        const account = accounts.find(a => a.id === selectedAccount);
        const { current, previous, period } = await requests.fetchGoogleReport(account, selectedPeriod, selectedCampaignIds);
        const make = (metrics, name) => googleTextData(metrics, name, period, account.currency);
        setReportData({ report: make(current.totals, account.clientName), prevReport: make(previous.totals, ''), agencyName: signatureAgency,
          campaignNames: accountCampaigns.filter(c => selectedCampaignIds.includes(c.id)).map(c => c.name) });
        return;
      }
      const periodDates = formatPeriodLabel(selectedPeriod);
      const agencyName = signatureAgency;

      const previousPeriod = getPreviousPeriodRange(selectedPeriod);
      const [insights, prevInsights] = await Promise.all([
        requests.fetchAccountInsights(selectedAccount, selectedPeriod, selectedCampaignIds),
        requests.fetchAccountInsights(selectedAccount, previousPeriod, selectedCampaignIds).catch(() => null),
      ]);
      if (!insights) {
        setReportData({ error: 'Sem dados para o período e campanhas selecionados.' });
        return;
      }
      const account = accounts.find(a => a.id === selectedAccount);
      const report = buildReportFromInsights(insights, account?.clientName || 'Conta', periodDates);
      const prevReport = prevInsights ? buildReportFromInsights(prevInsights, '', periodDates) : null;
      setReportData({ report, prevReport, agencyName,
        campaignNames: accountCampaigns.filter(c => selectedCampaignIds.includes(c.id)).map(c => c.name) });
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      setReportData({ error: `Erro: ${err.message}` });
    } finally {
      setGenerating(false);
    }
  }, [platform, selectedAccount, selectedPeriod, selectedCampaignIds, accounts, accountCampaigns, signatureAgency, requests, startReport]);

  // Build report text(s)
  const reportTexts = useMemo(() => {
    if (!reportData || reportData.error) return [];

    return [{
      text: buildReportText(reportData.report, {
        showCampaignName: false,
        campaignNames: reportData.campaignNames,
        prev: reportData.prevReport,
        agencyName: reportData.agencyName,
      }),
      label: reportData.campaignNames?.length ? 'Relatório das campanhas selecionadas' : 'Relatório geral da conta',
    }];
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
            <h1 className="text-xl lg:text-2xl font-bold text-text-primary tracking-tight">Relatórios</h1>
          </div>
        </div>

        {/* Selectors */}
        <div className={`relative mt-5 ${FILTER_ROW}`}>
          <ReportFormatSelector />
          <PlatformFilter value={platform} onChange={onPlatformChange} />

          <div className={`${FILTER_FIELD} z-50`}>
            <label className={FILTER_LABEL}>Período</label>
            <PeriodSelector selectedPeriod={periodSelection} onPeriodChange={setSelectedPeriod} className="w-full" align="left" />
          </div>

          {hasAgencies ? (
            <div className={FILTER_FIELD}>
              <label className={FILTER_LABEL}>Agência</label>
              <select
                value={selectedAgency}
                onChange={e => {
                  const agency = e.target.value;
                  setSelectedAgency(agency);
                  if (agency !== '__all__' && accountAgencies[selectedAccount] !== agency) {
                    setSelectedAccount('');
                    setSelectedCampaignIds([]);
                  }
                }}
                className={FILTER_CONTROL}
              >
                <option value="__all__">Todas as agências</option>
                {allowedAgencyList.map(ag => <option key={ag} value={ag}>{ag}</option>)}
              </select>
            </div>
          ) : null}

          <div className={FILTER_FIELD}>
            <label className={FILTER_LABEL}>Conta</label>
            <select
              value={selectedAccount}
              onChange={e => { setSelectedAccount(e.target.value); setSelectedCampaignIds([]); }}
              className={FILTER_CONTROL}
            >
              <option value="">Selecione uma conta</option>
              {filteredAccounts.map(a => <option key={a.id} value={a.id}>{a.clientName}</option>)}
            </select>
          </div>

        </div>

        {campaignsLoading && <p role="status" className="mt-4 text-sm text-text-secondary">Carregando campanhas da conta...</p>}
        {campaignsError && <p role="alert" className="mt-4 text-sm text-danger">{campaignsError.message}</p>}
        {selectedAccount && !campaignsLoading && !campaignsError && (
          <ReportCampaignFilter
            accountCampaigns={accountCampaigns}
            selectedCampaignIds={selectedCampaignIds}
            setSelectedCampaignIds={setSelectedCampaignIds}
          />
        )}

        {/* Action Row */}
        <div className="relative mt-6 flex items-center justify-center gap-4 flex-wrap">
          <button
            onClick={handleGenerate}
            disabled={!selectedAccount || generating || campaignsLoading || Boolean(campaignsError)}
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
            onClick={() => { refreshData(); handleGenerate(); }}
            disabled={!selectedAccount || generating || campaignsLoading}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-primary-light disabled:opacity-40"
            title="Consultar dados atualizados da conta selecionada"
          >
            Atualizar dados
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
