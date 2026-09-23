import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { pdf } from '@react-pdf/renderer';
import { FileDown, Loader2, Sparkles, Download, AlertCircle, Cpu, FileText } from 'lucide-react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import PeriodSelector from '../../shared/components/PeriodSelector';
import { collectReportData, OBJECTIVES } from './collectReportData';
import { generateExecutiveSummary } from './buildSummary';
import ReportDocument from './pdf/ReportDocument';

const OBJECTIVE_OPTIONS = Object.values(OBJECTIVES).map(({ id, label }) => ({ id, label }));

function matchAgencyVisual(name) {
  const normalized = (name || '').toLowerCase();
  if (normalized.includes('tag')) return 'tag';
  if (normalized.includes('vilas')) return 'vilasmkt';
  return null;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export default function ReportPdf() {
  const { accounts, selectedPeriod, setSelectedPeriod } = useMetaAds();
  const { agencies, accountAgencies } = useAgency();

  const [selectedAgency, setSelectedAgency] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedObjective, setSelectedObjective] = useState('messages');
  const [useAI, setUseAI] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { url, blob, fileName, summarySource, pageEstimate }

  const objectUrlRef = useRef('');

  const hasAgencies = agencies.length > 0;

  useEffect(() => {
    if (!selectedAgency) setSelectedAgency(hasAgencies ? agencies[0] : '__all__');
  }, [agencies, hasAgencies, selectedAgency]);

  const filteredAccounts = useMemo(() => {
    if (selectedAgency === '__all__') return accounts;
    if (!selectedAgency) return [];
    return accounts.filter((account) => accountAgencies[account.id] === selectedAgency);
  }, [accounts, selectedAgency, accountAgencies]);

  // Auto-seleciona a primeira conta apenas quando nenhuma está escolhida, para não
  // roubar a seleção durante o recarregamento progressivo das contas.
  useEffect(() => {
    if (!selectedAccount && filteredAccounts.length > 0) {
      setSelectedAccount(filteredAccounts[0].id);
    }
  }, [filteredAccounts, selectedAccount]);

  const resolvedAgencyName = useMemo(() => {
    if (selectedAgency && selectedAgency !== '__all__') return selectedAgency;
    return accountAgencies[selectedAccount] || '';
  }, [selectedAgency, selectedAccount, accountAgencies]);

  const agencyType = useMemo(() => matchAgencyVisual(resolvedAgencyName) || 'vilasmkt', [resolvedAgencyName]);

  const agencyLabel = useMemo(() => {
    if (agencyType === 'tag') return 'Grupo Tag';
    if (resolvedAgencyName && matchAgencyVisual(resolvedAgencyName) === null) return resolvedAgencyName;
    return 'Vilas Growth Marketing';
  }, [agencyType, resolvedAgencyName]);

  const agencyLogoSrc = agencyType === 'tag' ? '/logotag.png' : '/favicon.png';

  // Libera o object URL anterior sempre que um novo relatório é gerado.
  const replaceObjectUrl = useCallback((url) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;
  }, []);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selectedAccount) return;

    setGenerating(true);
    setError('');
    setResult(null);

    try {
      const account = accounts.find((item) => item.id === selectedAccount);

      const report = await collectReportData({
        accountId: selectedAccount,
        accountName: account?.clientName || 'Conta',
        agencyName: agencyLabel,
        agencyLogoSrc,
        period: selectedPeriod,
        objectiveId: selectedObjective,
        onProgress: setProgress,
      });

      setProgress(useAI ? 'Escrevendo o sumário executivo…' : 'Montando o sumário executivo…');
      const summary = await generateExecutiveSummary(report, { useAI });

      setProgress('Renderizando o PDF…');
      const blob = await pdf(<ReportDocument report={report} summary={summary} />).toBlob();
      const url = URL.createObjectURL(blob);
      replaceObjectUrl(url);

      const fileName = `relatorio-${slugify(report.meta.clientName)}-${slugify(report.meta.period.start)}-a-${slugify(report.meta.period.end)}.pdf`;

      setResult({
        url,
        blob,
        fileName,
        clientName: report.meta.clientName,
        periodLabel: report.meta.period.label,
        summarySource: summary.source,
        sizeKb: Math.round(blob.size / 1024),
        sections: {
          creatives: report.ads.length,
          campaigns: report.campaigns.length,
        },
      });
    } catch (err) {
      console.error('[report-pdf] falha ao gerar relatório:', err);
      setError(err.message || 'Não foi possível gerar o relatório.');
    } finally {
      setGenerating(false);
      setProgress('');
    }
  }, [
    selectedAccount, accounts, agencyLabel, agencyLogoSrc, selectedPeriod,
    selectedObjective, useAI, replaceObjectUrl,
  ]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = result.url;
    link.download = result.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [result]);

  const selectClass = 'w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer';

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="relative z-10 rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-5 lg:p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>

        <div className="relative flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
            <FileDown size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-text-primary tracking-tight">Relatório em PDF</h1>
          </div>
        </div>

        {/* Seletores */}
        <div className="relative mt-5 grid grid-cols-1 min-[560px]:grid-cols-2 sm:flex sm:flex-wrap items-end justify-center gap-3 sm:gap-5">
          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[210px] z-50">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Período</label>
            <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} className="w-full" align="left" />
          </div>

          {hasAgencies ? (
            <div className="flex flex-col gap-1.5 col-span-1 sm:w-[190px]">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Agência</label>
              <select
                value={selectedAgency}
                onChange={(event) => { setSelectedAgency(event.target.value); setSelectedAccount(''); }}
                className={selectClass}
              >
                {agencies.map((agency) => <option key={agency} value={agency}>{agency}</option>)}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[260px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Conta</label>
            <select
              value={selectedAccount}
              onChange={(event) => setSelectedAccount(event.target.value)}
              className={selectClass}
            >
              <option value="">Selecione uma conta</option>
              {filteredAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.clientName}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[190px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Resultado principal</label>
            <select
              value={selectedObjective}
              onChange={(event) => setSelectedObjective(event.target.value)}
              className={selectClass}
            >
              {OBJECTIVE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Ações */}
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
          </button>

          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useAI}
              onChange={(event) => setUseAI(event.target.checked)}
              className="accent-primary w-3.5 h-3.5 cursor-pointer"
            />
            <Cpu size={13} className={useAI ? 'text-primary' : 'text-text-secondary/60'} />
            Sumário executivo por IA
          </label>
        </div>

        {generating && progress ? (
          <div className="relative mt-4 flex items-center justify-center">
            <p className="text-xs text-text-secondary animate-pulse">{progress}</p>
          </div>
        ) : null}
      </div>

      {/* ERRO */}
      {error ? (
        <div className="bg-surface rounded-2xl border border-danger/30 p-5 flex items-start gap-3">
          <AlertCircle size={18} className="text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-danger font-medium">Não foi possível gerar o relatório</p>
            <p className="text-xs text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      ) : null}

      {/* RESULTADO */}
      {result ? (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-border/50 bg-bg/30">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {result.clientName} — {result.periodLabel}
              </p>
              <p className="text-[11px] text-text-secondary mt-0.5">
                {result.sizeKb} KB · {result.sections.campaigns} campanhas
                {result.sections.creatives > 0 ? ` · ${result.sections.creatives} criativos` : ''}
                {result.summarySource === 'ai' ? ' · sumário por IA' : ' · sumário automático'}
              </p>
            </div>

            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all"
            >
              <Download size={14} />
              Baixar PDF
            </button>
          </div>

          {/* Prévia — o visualizador nativo do navegador, sem biblioteca extra */}
          <iframe
            src={result.url}
            title="Prévia do relatório"
            className="hidden lg:block w-full h-[820px] bg-[#525659]"
          />

          <div className="lg:hidden p-8 text-center">
            <FileText size={40} className="text-text-secondary/20 mx-auto mb-3" />
            <p className="text-sm text-text-secondary">
              Relatório pronto. Toque em <span className="text-primary font-medium">Baixar PDF</span> para abrir no seu leitor.
            </p>
          </div>
        </div>
      ) : null}

      {/* ESTADO VAZIO */}
      {!result && !generating && !error ? (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center">
          <FileDown size={48} className="text-text-secondary/20 mx-auto mb-4" />
          <p className="text-text-secondary text-sm">
            Selecione a conta e o período, e clique em &quot;Gerar Relatório&quot;
          </p>
          <p className="text-text-secondary/60 text-xs mt-2 max-w-md mx-auto">
            O documento traz capa, sumário executivo, indicadores comparados com o período anterior,
            evolução diária, campanhas, criativos, público e posicionamentos.
          </p>
        </div>
      ) : null}
    </div>
  );
}
