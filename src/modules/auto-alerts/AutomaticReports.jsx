import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, FileText, Image, Loader2, Send, X } from 'lucide-react';
import { REPORT_RULES, getReportPeriod, matchReportAgency, reportLocalDate } from '../../shared/constants/automaticReports';
import ReportCard from '../../shared/components/ReportCard';
import { getAgencyLogoSources, getAgencyLabel } from '../../shared/utils/agencyLogo';
import { toVisualReportData } from '../../shared/utils/visualReportData';
import { uploadVisualReport } from '../../shared/utils/uploadVisualReport';
import { getStoredMetaToken } from '../../services/metaTokenGuard';

async function reportRequest(options) {
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
      platformLogoSrc={report.platform === 'google' ? '/google-ads-logo.svg' : '/meta-ads-logo.png'}
      clientLogoSrc={logos[report.accountId] || logos[report.accountNumber]}
      agencyLabel={getAgencyLabel(report.agencyName, report.agency)}
      showAccountName={false}
      objective="messages"
      withBarChart
    />
  </div>;
}

export default function AutomaticReports() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState(() => getReportPeriod());
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

  const run = async (rule, action) => {
    setBusy(`${action}-${rule.id}`); setError(''); setNotice(''); setPreview(null);
    try {
      const token = getStoredMetaToken();
      const headers = { 'Content-Type': 'application/json', ...(token ? { 'x-meta-token': token } : {}) };
      const request = (requestAction, extra = {}) => reportRequest({
        method: 'POST', headers,
        body: JSON.stringify({ agency: rule.id, action: requestAction, period, ...extra }),
      });
      let imagePaths;
      if (action === 'send' && rule.format === 'visual') {
        const collected = await request('preview');
        if (collected.errors.length) throw new Error('Algumas contas falharam na consulta. Confira a prévia antes de enviar.');
        imagePaths = {};
        for (const [index, report] of collected.reports.entries()) {
          setNotice(`Gerando Relatório Visual ${index + 1} de ${collected.reports.length}: ${report.accountName}`);
          imagePaths[report.accountId] = await uploadVisualReport(report);
        }
      }
      const result = await request(action, imagePaths ? { imagePaths } : {});
      if (action === 'preview') {
        setPreview({ ...result, rule }); setPreviewIndex(0);
      } else {
        setData(previous => ({ ...previous, history: [result, ...previous.history.filter(item => item?.agency !== rule.id)] }));
        setNotice(`${rule.label}: ${result.sent} relatório(s) enviado(s); ${result.skipped} já entregue(s); ${result.uncertain} sem confirmação; ${result.errors.length} erro(s).`);
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  };

  const today = reportLocalDate(new Date());
  const latestCompleteDay = getReportPeriod().until;
  const validPeriod = period.since && period.until && period.since <= period.until && period.until < today
    && (Date.parse(period.until) - Date.parse(period.since)) / 86400000 < 31;
  const currentReport = preview?.reports[previewIndex];

  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-4 sm:p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>

        <div className="relative flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
            <Send size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-text-primary tracking-tight">Envio de relatórios</h1>
          </div>
        </div>
      </div>

      <section className="bg-surface rounded-xl border border-border p-4 sm:p-6">
        <h2 className="text-lg font-bold text-text-primary">Período da veiculação</h2>
        <div className="flex flex-wrap gap-4 mt-4">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider sm:w-[210px]">De
            <input type="date" value={period.since} max={period.until || today} onChange={event => { setPeriod(previous => ({ ...previous, since: event.target.value })); setPreview(null); }}
              className="block mt-1.5 w-full rounded-xl border border-border/50 bg-surface/60 backdrop-blur-md px-3 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer" />
          </label>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider sm:w-[210px]">Até
            <input type="date" value={period.until} min={period.since} max={latestCompleteDay} onChange={event => { setPeriod(previous => ({ ...previous, until: event.target.value })); setPreview(null); }}
              className="block mt-1.5 w-full rounded-xl border border-border/50 bg-surface/60 backdrop-blur-md px-3 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer" />
          </label>
        </div>
        <p className="text-xs text-text-secondary mt-3">Até 31 dias completos. O dia de hoje ainda não está disponível.</p>
        {!validPeriod && <p role="alert" className="text-sm text-warning mt-2">Selecione um período válido de 1 a 31 dias, encerrado antes de hoje.</p>}
      </section>

      {loading ? <p className="flex gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Carregando agências...</p> : data && (
        <section className="grid gap-4 xl:grid-cols-3">
          {REPORT_RULES.map(rule => {
            const count = Object.values(data.agencyMap).filter(name => matchReportAgency(name) === rule.id).length;
            const last = data.history.find(item => item?.agency === rule.id);
            const Icon = rule.format === 'visual' ? Image : FileText;
            const hasMeta = data.setup.meta || Boolean(getStoredMetaToken());
            const ready = hasMeta && data.setup.slack[rule.id];
            return <article key={rule.id} className="bg-surface rounded-xl border border-border p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary-light"><Icon size={21} /></div>
                <div><h2 className="text-lg font-bold text-text-primary">{rule.label}</h2>
                  <p className="text-sm text-text-secondary">Relatório {rule.includeText ? 'visual e em texto' : rule.format === 'visual' ? 'visual' : 'em texto'} · {count} contas vinculadas</p>
                </div>
              </div>
              <p className="text-xs text-text-secondary">{ready ? 'Canal Slack configurado' : 'Envio indisponível até configurar o acesso Meta e o webhook desta agência.'}</p>
              <div className="flex flex-wrap gap-2 mt-auto">
                <button type="button" onClick={() => run(rule, 'preview')} disabled={!!busy || !validPeriod || !hasMeta}
                  className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface/60 px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  {busy === `preview-${rule.id}` ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />} Prévia
                </button>
                <button type="button" onClick={() => run(rule, 'send')} disabled={!!busy || !validPeriod || !ready}
                  className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-light px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300">
                  {busy === `send-${rule.id}` ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar {rule.label}
                </button>
              </div>
              {last && <div className="border-t border-border/50 pt-3 text-xs text-text-secondary space-y-1">
                <p>Última tentativa: {new Date(last.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
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
          <div><h2 className="text-lg font-bold text-text-primary">Prévia · {preview.rule.label}</h2>
            <p className="text-xs text-text-secondary mt-1">{preview.reports.length} contas com veiculação · {preview.withoutDelivery} sem veiculação · {preview.errors.length} falhas na consulta</p>
            <p className="text-xs text-text-secondary mt-1">{preview.period.since.split('-').reverse().join('/')} a {preview.period.until.split('-').reverse().join('/')}</p>
          </div>
          <button type="button" aria-label="Fechar prévia" onClick={() => setPreview(null)} className="p-1 text-text-secondary"><X size={18} /></button>
        </div>
        {preview.errors.map((item, index) => <p key={index} className="text-xs text-warning">{item.accountName}: {item.error}</p>)}
        {preview.reports.length === 0 ? <p className="text-sm text-text-secondary">Nenhum relatório disponível para este período.</p> : <>
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider">Conta
            <select value={previewIndex} onChange={event => setPreviewIndex(Number(event.target.value))} className="block w-full mt-2 rounded-xl border border-border/50 bg-surface/60 backdrop-blur-md px-3 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer">
              {preview.reports.map((report, index) => <option key={report.accountId} value={index}>{report.accountName}</option>)}
            </select>
          </label>
          {preview.rule.format === 'visual' ? <>
            <VisualPreview report={currentReport} />
            {preview.rule.includeText && <pre className="whitespace-pre-wrap text-sm text-text-primary bg-bg rounded-xl p-4 max-h-[600px] overflow-y-auto font-sans">{currentReport.text}</pre>}
          </> : <pre className="whitespace-pre-wrap text-sm text-text-primary bg-bg rounded-xl p-4 max-h-[600px] overflow-y-auto font-sans">{currentReport.accountName}{'\n\n'}{currentReport.text}</pre>}
        </>}
      </section>}
    </div>
  );
}
