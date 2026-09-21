import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, FileText, Image, Loader2, Send, X } from 'lucide-react';
import { REPORT_RULES, getReportPeriod, matchReportAgency, reportLocalDate } from '../../shared/constants/automaticReports';
import ReportCard from '../../shared/components/ReportCard';
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
      agencyLogoSrc={report.agency === 'tagb' ? '/logotag.png' : '/favicon.png'}
      metaLogoSrc="/meta-ads-logo.png"
      clientLogoSrc={logos[report.accountId] || logos[report.accountNumber]}
      agencyLabel={report.agency === 'tagb' ? 'Grupo Tag' : 'Vilas Growth Marketing'}
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
      <header className="rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-6">
        <h1 className="text-2xl font-bold text-text-primary">Envio de relatórios</h1>
        <p className="text-sm text-text-secondary mt-2">Escolha o período e envie um relatório por conta com gasto ou impressões para o canal Slack da agência.</p>
      </header>

      <section className="rounded-2xl border border-border/50 bg-surface/50 p-5 sm:p-6">
        <h2 className="font-semibold text-text-primary">Período da veiculação</h2>
        <div className="flex flex-wrap gap-4 mt-4">
          <label className="text-sm text-text-secondary">De
            <input type="date" value={period.since} max={period.until || today} onChange={event => { setPeriod(previous => ({ ...previous, since: event.target.value })); setPreview(null); }}
              className="block mt-1.5 rounded-lg border border-border bg-bg p-2 text-text-primary" />
          </label>
          <label className="text-sm text-text-secondary">Até
            <input type="date" value={period.until} min={period.since} max={latestCompleteDay} onChange={event => { setPeriod(previous => ({ ...previous, until: event.target.value })); setPreview(null); }}
              className="block mt-1.5 rounded-lg border border-border bg-bg p-2 text-text-primary" />
          </label>
        </div>
        <p className="text-xs text-text-secondary mt-3">Até 31 dias completos. O dia de hoje ainda não está disponível.</p>
        {!validPeriod && <p role="alert" className="text-sm text-amber-400 mt-2">Selecione um período válido de 1 a 31 dias, encerrado antes de hoje.</p>}
      </section>

      {loading ? <p className="flex gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Carregando agências...</p> : data && (
        <section className="grid gap-4 xl:grid-cols-3">
          {REPORT_RULES.map(rule => {
            const count = Object.values(data.agencyMap).filter(name => matchReportAgency(name) === rule.id).length;
            const last = data.history.find(item => item?.agency === rule.id);
            const Icon = rule.format === 'visual' ? Image : FileText;
            const hasMeta = data.setup.meta || Boolean(getStoredMetaToken());
            const ready = hasMeta && data.setup.slack[rule.id];
            return <article key={rule.id} className="rounded-2xl border border-border/50 bg-surface/50 p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary-light"><Icon size={21} /></div>
                <div><h2 className="text-lg font-semibold text-text-primary">{rule.label}</h2>
                  <p className="text-sm text-text-secondary">Relatório {rule.includeText ? 'visual e em texto' : rule.format === 'visual' ? 'visual' : 'em texto'} · {count} contas vinculadas</p>
                </div>
              </div>
              <p className="text-xs text-text-secondary">{ready ? 'Canal Slack configurado' : 'Envio indisponível até configurar o acesso Meta e o webhook desta agência.'}</p>
              <div className="flex flex-wrap gap-2 mt-auto">
                <button type="button" onClick={() => run(rule, 'preview')} disabled={!!busy || !validPeriod || !hasMeta}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-primary hover:bg-white/5 disabled:opacity-40">
                  {busy === `preview-${rule.id}` ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />} Prévia
                </button>
                <button type="button" onClick={() => run(rule, 'send')} disabled={!!busy || !validPeriod || !ready}
                  className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-light disabled:opacity-40">
                  {busy === `send-${rule.id}` ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar {rule.label}
                </button>
              </div>
              {last && <div className="border-t border-border/50 pt-3 text-xs text-text-secondary space-y-1">
                <p>Última tentativa: {new Date(last.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                <p>{last.sent} enviados · {last.skipped} já entregues · {last.uncertain} sem confirmação</p>
                {last.errors?.map((item, index) => <p key={index} className="text-amber-400">{item.accountName ? `${item.accountName}: ` : ''}{item.error}</p>)}
              </div>}
            </article>;
          })}
        </section>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error} {!data && <button type="button" onClick={load} className="underline ml-2">Tentar novamente</button>}</p>}
      {notice && <p role="status" className="flex gap-2 text-sm text-emerald-400"><CheckCircle2 size={18} />{notice}</p>}
      {preview && <section className="rounded-2xl border border-border/50 bg-surface/50 p-5 sm:p-6 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div><h2 className="font-semibold text-text-primary">Prévia · {preview.rule.label}</h2>
            <p className="text-xs text-text-secondary mt-1">{preview.reports.length} contas com veiculação · {preview.withoutDelivery} sem veiculação · {preview.errors.length} falhas na consulta</p>
            <p className="text-xs text-text-secondary mt-1">{preview.period.since.split('-').reverse().join('/')} a {preview.period.until.split('-').reverse().join('/')}</p>
          </div>
          <button type="button" aria-label="Fechar prévia" onClick={() => setPreview(null)} className="p-1 text-text-secondary"><X size={18} /></button>
        </div>
        {preview.errors.map((item, index) => <p key={index} className="text-xs text-amber-400">{item.accountName}: {item.error}</p>)}
        {preview.reports.length === 0 ? <p className="text-sm text-text-secondary">Nenhum relatório disponível para este período.</p> : <>
          <label className="block text-xs text-text-secondary">Conta
            <select value={previewIndex} onChange={event => setPreviewIndex(Number(event.target.value))} className="block w-full mt-2 p-2 rounded-lg bg-bg border border-border text-text-primary">
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
