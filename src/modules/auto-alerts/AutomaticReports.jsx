import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Eye, FileText, Image, Loader2, Save, X } from 'lucide-react';
import { REPORT_RULES, matchReportAgency } from '../../shared/constants/automaticReports';
import { buildAutomaticReportSvg } from '../../shared/utils/automaticReportVisual';

async function reportRequest(options) {
  const res = await fetch('/api/alerts/reports', options);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error || 'Não foi possível acessar os relatórios automáticos.');
  return data;
}

function VisualPreview({ report }) {
  const svg = buildAutomaticReportSvg(report, {
    agencyLogo: new URL(report.agency === 'tagb' ? '/logotag.png' : '/favicon.png', window.location.origin).href,
    metaLogo: new URL('/meta-ads-logo.png', window.location.origin).href,
  });
  // Inline SVG allows the same local brand assets used by the server renderer.
  return <div className="[&>svg]:w-full [&>svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function AutomaticReports() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewing, setPreviewing] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await reportRequest();
      setData(result);
      setSettings(result.settings);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await reportRequest({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      setData(previous => ({ ...previous, settings: result.settings }));
      setNotice('Configuração salva no servidor.');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const showPreview = async rule => {
    setPreviewing(rule.id); setError(''); setPreview(null);
    try {
      const result = await reportRequest({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agency: rule.id }) });
      setPreview({ ...result, rule }); setPreviewIndex(0);
    } catch (err) { setError(err.message); }
    finally { setPreviewing(''); }
  };

  const dirty = settings && JSON.stringify(settings) !== JSON.stringify(data?.settings);
  const missingSetup = data && (!data.setup.meta || !data.setup.cron || REPORT_RULES.some(rule => !data.setup.slack[rule.id]));
  const currentReport = preview?.reports[previewIndex];

  return (
    <section className="bg-surface/50 rounded-2xl border border-border/50 overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50 flex items-start gap-3">
        <CalendarClock size={20} className="text-primary-light mt-1 shrink-0" />
        <div>
          <h2 className="text-lg font-bold text-text-primary">Relatórios automáticos no Slack</h2>
          <p className="text-xs text-text-secondary mt-1">Um relatório por cliente com veiculação nos últimos 7 dias completos. Horários de Brasília.</p>
        </div>
      </div>
      {loading ? <p className="p-6 text-sm text-text-secondary flex gap-2"><Loader2 size={18} className="animate-spin" /> Carregando programação...</p> : data && settings && (
        <>
          <div className="divide-y divide-border/40">
            {REPORT_RULES.map(rule => {
              const count = Object.values(data.agencyMap).filter(name => matchReportAgency(name) === rule.id).length;
              const last = data.history.find(item => item?.agency === rule.id);
              const Icon = rule.format === 'visual' ? Image : FileText;
              const ready = data.setup.meta && data.setup.cron && data.setup.slack[rule.id];
              return (
                <div key={rule.id} className="px-6 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Icon size={19} className="text-primary-light mt-1" />
                      <div>
                        <h3 className="font-semibold text-text-primary">{rule.label}</h3>
                        <p className="text-sm text-text-secondary">{rule.dayLabel} às 05h · Relatório {rule.format === 'visual' ? 'visual (imagem)' : 'em texto'}</p>
                        <p className="text-xs text-text-secondary/70 mt-1">{count} contas vinculadas · Apenas clientes com gasto ou impressões no período</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <button type="button" onClick={() => showPreview(rule)} disabled={!!previewing || !data.setup.meta}
                        className="flex items-center gap-1.5 text-xs text-primary-light hover:text-text-primary disabled:opacity-40">
                        {previewing === rule.id ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
                        Prévia
                      </button>
                      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                        <input type="checkbox" aria-label={`Ativar relatórios ${rule.label}`} checked={settings.enabled[rule.id]} disabled={saving}
                          onChange={event => { setNotice(''); setSettings(previous => ({ enabled: { ...previous.enabled, [rule.id]: event.target.checked } })); }}
                          className="accent-primary w-4 h-4" />
                        {settings.enabled[rule.id] ? (ready ? 'Ativo' : 'A configurar') : 'Pausado'}
                      </label>
                    </div>
                  </div>
                  {last && <div className={`mt-3 text-xs ${last.status === 'error' ? 'text-amber-400' : 'text-text-secondary'}`}>
                    Última execução: {new Date(last.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {last.sent} enviados · {last.skipped} já entregues
                    {last.uncertain > 0 && <p className="mt-1">{last.uncertain} entregas sem confirmação. Confira o canal antes de reenviar.</p>}
                    {last.errors?.map((item, i) => <p key={i} className="mt-1">{item.accountName ? `${item.accountName}: ` : ''}{item.error}</p>)}
                    {last.linkedAccounts === 0 && <p className="mt-1">Nenhuma conta vinculada encontrada no Meta Ads.</p>}
                  </div>}
                </div>
              );
            })}
          </div>
          {missingSetup && <p className="mx-6 mb-4 p-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            A automação depende da configuração do servidor: {!data.setup.meta && 'acesso ao Meta Ads; '}{!data.setup.cron && 'agendador; '}
            {REPORT_RULES.filter(rule => !data.setup.slack[rule.id]).map(rule => `conexão Slack da ${rule.label}`).join(', ')}.
          </p>}
          <div className="px-6 pb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-text-secondary max-w-xl">Os envios funcionam com o painel fechado. A prévia consulta os dados atuais e não envia mensagens.</p>
            <button type="button" onClick={save} disabled={saving || !dirty}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-primary text-white hover:bg-primary-light disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar programação
            </button>
          </div>
        </>
      )}
      {error && <div role="alert" className="mx-6 my-4 text-sm text-red-400">{error} {!data && <button type="button" onClick={load} className="underline ml-2">Tentar novamente</button>}</div>}
      {notice && <p role="status" className="mx-6 mb-4 flex items-center gap-2 text-sm text-emerald-400"><CheckCircle2 size={16} />{notice}</p>}
      {preview && <div className="border-t border-border/50 p-4 sm:p-6 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h3 className="font-semibold text-text-primary">Prévia · {preview.rule.label}</h3>
            <p className="text-xs text-text-secondary mt-1">{preview.reports.length} clientes com veiculação · {preview.withoutDelivery} sem veiculação · {preview.errors.length} falhas na consulta</p>
            <p className="text-xs text-text-secondary mt-1">{preview.period.since.split('-').reverse().join('/')} a {preview.period.until.split('-').reverse().join('/')}</p>
          </div>
          <button type="button" aria-label="Fechar prévia" onClick={() => setPreview(null)} className="p-1 text-text-secondary"><X size={18} /></button>
        </div>
        {preview.errors.map((item, i) => <p key={i} className="text-xs text-amber-400">{item.accountName}: {item.error}</p>)}
        {preview.reports.length === 0 ? <p className="text-sm text-text-secondary">Nenhum relatório disponível para este período.</p> : <>
          <label className="block text-xs text-text-secondary">Cliente
            <select value={previewIndex} onChange={event => setPreviewIndex(Number(event.target.value))} className="block w-full mt-2 p-2 rounded-lg bg-bg border border-border text-text-primary">
              {preview.reports.map((report, index) => <option key={report.accountId} value={index}>{report.accountName}</option>)}
            </select>
          </label>
          {preview.rule.format === 'visual' ? <VisualPreview report={currentReport} /> : <pre className="whitespace-pre-wrap text-sm text-text-primary bg-bg rounded-xl p-4 max-h-[600px] overflow-y-auto font-sans">{currentReport.accountName}{'\n\n'}{currentReport.text}</pre>}
        </>}
      </div>}
    </section>
  );
}
