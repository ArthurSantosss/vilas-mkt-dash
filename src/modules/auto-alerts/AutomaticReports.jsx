import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, Loader2, Send, X } from 'lucide-react';
import {
  REPORT_FORMATS, REPORT_PLATFORMS, REPORT_RULES, getReportPeriod, reportLocalDate,
} from '../../shared/constants/automaticReports';
import ReportCard from '../../shared/components/ReportCard';
import { MetaIcon, GoogleAdsIcon } from '../../shared/components/PlatformIcons';
import { getAgencyLogoSources, getAgencyLabel } from '../../shared/utils/agencyLogo';
import { reportCardObjective, toVisualReportData } from '../../shared/utils/visualReportData';
import { uploadVisualReport } from '../../shared/utils/uploadVisualReport';
import { getStoredMetaToken } from '../../services/metaTokenGuard';
import PeriodSelector from '../../shared/components/PeriodSelector';
import { PRESETS } from '../../shared/utils/dateUtils';
import { FILTER_CONTROL, FILTER_LABEL } from '../../shared/constants/filterStyles';

const PLATFORM_ICONS = { meta: MetaIcon, google: GoogleAdsIcon };

function metaHeaders(json = false) {
  const token = getStoredMetaToken();
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'x-meta-token': token } : {}) };
}

async function reportRequest(options = { headers: metaHeaders() }) {
  const res = await fetch('/api/alerts/reports', options);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error || 'Não foi possível acessar os relatórios.');
  return data;
}

function VisualPreview({ report }) {
  let logos = {};
  try { logos = JSON.parse(localStorage.getItem('client_logos')) || {}; } catch { /* no logo */ }
  return <div className="overflow-x-auto">
    <ReportCard
      data={toVisualReportData(report)}
      agencyLogoSrc={getAgencyLogoSources(report.agencyName, report.agency)}
      platformLogoSrc={report.platform === 'google' ? '/google-ads-logo.svg' : '/meta-logo.svg'}
      clientLogoSrc={logos[report.accountId] || logos[report.accountNumber]}
      agencyLabel={getAgencyLabel(report.agencyName, report.agency)}
      showAccountName={false}
      objective={reportCardObjective(report)}
      withBarChart
    />
  </div>;
}

const SELECT_CLASS = 'h-8 rounded-lg border bg-bg/60 px-2 text-xs text-text-primary focus:outline-none focus:border-primary min-w-0';

/** Uma conta: marcar para enviar e escolher modelo e formato só dela. */
function AccountRow({ account, platform, checked, choice, onToggle, onChoose }) {
  const config = REPORT_PLATFORMS[platform];
  const missing = checked && (!choice.objective || !choice.format);
  return <li className={`rounded-lg px-2 py-2 ${checked ? 'bg-surface/60' : ''}`}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm text-text-primary">
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 shrink-0 accent-primary" />
        <span className="truncate" title={account.name}>{account.name}</span>
      </label>
      {checked && <div className="grid grid-cols-2 gap-2 pl-6 sm:w-[300px] sm:shrink-0 sm:pl-0">
        <select aria-label={`Modelo do relatório de ${account.name}`} value={choice.objective || ''}
          onChange={event => onChoose({ objective: event.target.value })}
          className={`${SELECT_CLASS} ${choice.objective ? 'border-border/60' : 'border-warning/60'}`}>
          <option value="" disabled>Modelo…</option>
          {config.objectives.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select aria-label={`Formato do relatório de ${account.name}`} value={choice.format || ''}
          onChange={event => onChoose({ format: event.target.value })}
          className={`${SELECT_CLASS} ${choice.format ? 'border-border/60' : 'border-warning/60'}`}>
          <option value="" disabled>Formato…</option>
          {REPORT_FORMATS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>}
    </div>
    {missing && <p className="mt-1 pl-6 text-[11px] text-warning">Escolha {[!choice.objective && 'o modelo', !choice.format && 'o formato'].filter(Boolean).join(' e ')} desta conta.</p>}
  </li>;
}

function PlatformPanel({ rule, platform, accounts, listError, busy, canPreview, canSend, onRun }) {
  const config = REPORT_PLATFORMS[platform];
  const Icon = PLATFORM_ICONS[platform];
  const [checked, setChecked] = useState(() => new Set());
  const [choices, setChoices] = useState({});
  const key = `${rule.id}-${platform}`;
  const chosen = accounts.filter(account => checked.has(account.id));
  const pending = chosen.filter(account => !choices[account.id]?.objective || !choices[account.id]?.format);
  const complete = chosen.length > 0 && pending.length === 0;
  const toggle = id => setChecked(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const choose = (id, patch) => setChoices(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }));
  const selection = {
    platform,
    accounts: chosen.map(account => ({ id: account.id, objective: choices[account.id]?.objective, format: choices[account.id]?.format })),
  };

  return <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-bg/30 p-4">
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary"><Icon className="w-5 h-5" /> {config.label}</h3>
      {accounts.length > 0 && <div className="flex items-center gap-2 text-xs">
        <span className="text-text-secondary">{chosen.length} de {accounts.length}</span>
        <button type="button" className="text-primary-light hover:underline"
          onClick={() => setChecked(chosen.length === accounts.length ? new Set() : new Set(accounts.map(account => account.id)))}>
          {chosen.length === accounts.length ? 'Desmarcar todas' : 'Marcar todas'}
        </button>
      </div>}
    </div>

    {accounts.length === 0 ? <p className="text-xs text-text-secondary">
      {listError ? `Não foi possível listar as contas: ${listError}` : `Nenhuma conta ${config.label} vinculada a ${rule.label}. Vincule em Configurações.`}
    </p> : <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
      {accounts.map(account => <AccountRow key={account.id} account={account} platform={platform}
        checked={checked.has(account.id)} choice={choices[account.id] || {}}
        onToggle={() => toggle(account.id)} onChoose={patch => choose(account.id, patch)} />)}
    </ul>}

    <div className="mt-auto space-y-2">
      {accounts.length > 0 && !complete && <p className="text-xs text-text-secondary">
        {chosen.length === 0 ? 'Marque as contas e escolha modelo e formato de cada uma para liberar o envio.'
          : `Falta escolher modelo ou formato de ${pending.length} conta(s).`}
      </p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onRun(rule, selection, 'preview')} disabled={!!busy || !complete || !canPreview}
          className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface/60 px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          {busy === `preview-${key}` ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />} Prévia
        </button>
        <button type="button" onClick={() => onRun(rule, selection, 'send')} disabled={!!busy || !complete || !canSend}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-light px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300">
          {busy === `send-${key}` ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar relatórios
        </button>
      </div>
    </div>
  </div>;
}

export default function AutomaticReports() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState(() => getReportPeriod());
  const [periodSelection, setPeriodSelection] = useState('7d');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  const load = async () => {
    setLoading(true); setError('');
    try { setData(await reportRequest()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const run = async (rule, selection, action) => {
    const platformLabel = REPORT_PLATFORMS[selection.platform].label;
    setBusy(`${action}-${rule.id}-${selection.platform}`); setError(''); setNotice(''); setPreview(null);
    try {
      const request = (requestAction, extra = {}) => reportRequest({
        method: 'POST', headers: metaHeaders(true),
        body: JSON.stringify({ agency: rule.id, action: requestAction, period, selection, ...extra }),
      });
      let imagePaths;
      if (action === 'send' && selection.accounts.some(account => account.format === 'visual')) {
        const collected = await request('preview');
        if (collected.errors.length) throw new Error('Algumas contas falharam na consulta. Confira a prévia antes de enviar.');
        imagePaths = {};
        const visuals = collected.reports.filter(report => report.format === 'visual');
        for (const [index, report] of visuals.entries()) {
          setNotice(`Gerando Relatório Visual ${index + 1} de ${visuals.length}: ${report.accountName}`);
          imagePaths[report.accountId] = await uploadVisualReport(report);
        }
      }
      const result = await request(action, imagePaths ? { imagePaths } : {});
      if (action === 'preview') {
        setPreview({ ...result, rule, platformLabel }); setPreviewIndex(0);
      } else {
        setData(previous => ({ ...previous, history: [result, ...previous.history.filter(item => item?.agency !== rule.id)] }));
        setNotice(`${rule.label} · ${platformLabel}: ${result.sent} relatório(s) enviado(s); ${result.skipped} já entregue(s); ${result.uncertain} sem confirmação; ${result.errors.length} erro(s).`);
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  };

  const today = reportLocalDate(new Date());
  const validPeriod = period.since && period.until && period.since <= period.until && period.until < today
    && (Date.parse(period.until) - Date.parse(period.since)) / 86400000 < 31;
  const currentReport = preview?.reports[previewIndex];

  const handlePeriodChange = selection => {
    const range = typeof selection === 'object'
      ? selection
      : PRESETS.find(preset => preset.id === selection)?.getRange();
    if (!range) return;
    setPeriodSelection(selection);
    setPeriod({ since: range.startDate, until: range.endDate });
    setPreview(null);
  };

  const listError = platform => data?.accounts?.errors?.find(item => item.platform === platform)?.error;

  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="relative z-10 rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-4 sm:p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>

        <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
              <Send size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-text-primary tracking-tight">Envio de relatórios</h1>
              <p className="text-xs text-text-secondary mt-0.5">Escolha as contas, o modelo e o formato de cada plataforma antes de enviar.</p>
            </div>
          </div>

          <div className="z-50 flex w-full flex-col gap-1.5 md:w-[260px]">
            <label className={FILTER_LABEL}>Período da veiculação</label>
            <PeriodSelector selectedPeriod={periodSelection} onPeriodChange={handlePeriodChange} className="w-full" />
          </div>
        </div>

        <p className="relative mt-3 text-xs text-text-secondary md:text-right">Até 31 dias completos. O dia de hoje ainda não está disponível.</p>
        {!validPeriod && <p role="alert" className="relative mt-2 text-sm text-warning md:text-right">Selecione um período válido de 1 a 31 dias, encerrado antes de hoje.</p>}
      </div>

      {loading ? <p className="flex gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Carregando agências e contas...</p> : data && (
        <section className="space-y-4">
          {REPORT_RULES.map(rule => {
            const last = data.history.find(item => item?.agency === rule.id);
            const slackReady = data.setup.slack[rule.id];
            const hasMeta = data.setup.meta || Boolean(getStoredMetaToken());
            return <article key={rule.id} className="bg-surface rounded-xl border border-border p-4 sm:p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-bold text-text-primary">{rule.label}</h2>
                <p className={`text-xs ${slackReady ? 'text-text-secondary' : 'text-warning'}`}>
                  {slackReady ? 'Canal Slack configurado' : 'Envio indisponível até configurar o webhook Slack desta agência.'}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {Object.keys(REPORT_PLATFORMS).map(platform => <PlatformPanel
                  key={platform} rule={rule} platform={platform}
                  accounts={(data.accounts?.[platform] || []).filter(account => account.agency === rule.id)}
                  listError={listError(platform)}
                  busy={busy}
                  canPreview={validPeriod && (platform === 'google' || hasMeta)}
                  canSend={validPeriod && slackReady && (platform === 'google' || hasMeta)}
                  onRun={run}
                />)}
              </div>
              {last && <div className="border-t border-border/50 pt-3 text-xs text-text-secondary space-y-1">
                <p>Última tentativa{last.platform ? ` (${REPORT_PLATFORMS[last.platform]?.label})` : ''}: {new Date(last.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                <p>{last.sent} enviados · {last.skipped} já entregues · {last.uncertain} sem confirmação</p>
                {last.errors?.map((item, index) => <p key={index} className="text-warning">{item.accountName ? `${item.accountName}: ` : ''}{item.error}</p>)}
              </div>}
            </article>;
          })}
        </section>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error} {!data && <button type="button" onClick={load} className="underline ml-2">Tentar novamente</button>}</p>}
      {notice && <p role="status" className="flex gap-2 text-sm text-success"><CheckCircle2 size={18} />{notice}</p>}
      {preview && <section className="bg-surface rounded-xl border border-border p-4 sm:p-6 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div><h2 className="text-lg font-bold text-text-primary">Prévia · {preview.rule.label} · {preview.platformLabel}</h2>
            <p className="text-xs text-text-secondary mt-1">{preview.reports.length} contas com veiculação · {preview.withoutDelivery} sem veiculação · {preview.errors.length} falhas na consulta</p>
            <p className="text-xs text-text-secondary mt-1">{preview.period.since.split('-').reverse().join('/')} a {preview.period.until.split('-').reverse().join('/')}</p>
          </div>
          <button type="button" aria-label="Fechar prévia" onClick={() => setPreview(null)} className="p-1 text-text-secondary"><X size={18} /></button>
        </div>
        {preview.errors.map((item, index) => <p key={index} className="text-xs text-warning">{item.accountName}: {item.error}</p>)}
        {preview.reports.length === 0 ? <p className="text-sm text-text-secondary">Nenhum relatório disponível para este período.</p> : <>
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider">Conta
            <select value={previewIndex} onChange={event => setPreviewIndex(Number(event.target.value))} className={`${FILTER_CONTROL} mt-1.5 block sm:max-w-[320px]`}>
              {preview.reports.map((report, index) => <option key={report.accountId} value={index}>{report.accountName} · {REPORT_PLATFORMS[report.platform].objectives.find(item => item.id === report.objective)?.label} · {report.format === 'visual' ? 'Visual' : 'Texto'}</option>)}
            </select>
          </label>
          {currentReport.format === 'visual'
            ? <VisualPreview report={currentReport} />
            : <pre className="whitespace-pre-wrap text-sm text-text-primary bg-bg rounded-xl p-4 max-h-[600px] overflow-y-auto font-sans">{currentReport.accountName}{'\n\n'}{currentReport.text}</pre>}
        </>}
      </section>}
    </div>
  );
}
