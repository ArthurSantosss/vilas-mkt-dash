import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import ReportFormatSelector from '../../shared/components/ReportFormatSelector';
import { FILTER_ROW, FILTER_FIELD, FILTER_LABEL, FILTER_CONTROL } from '../../shared/constants/filterStyles';
import TrafficReportConfig from './TrafficReportConfig';
import { buildShareUrl, deleteTrafficConfig, listTrafficConfigs, shareTrafficConfig } from './trafficReportApi';

const TrafficReport = lazy(() => import('../public-report/traffic/TrafficReport'));
const SELECTED_KEY = 'report_full_selected';

function readSelected() {
  try { return localStorage.getItem(SELECTED_KEY) || ''; } catch { return ''; }
}

export default function ReportFull() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(readSelected);
  const [editing, setEditing] = useState(null); // null | 'new' | config
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await listTrafficConfigs();
      setConfigs(list);
      setError(null);
      setSelectedId(prev => (list.some(c => c.id === prev) ? prev : list[0]?.id || ''));
    } catch (err) {
      setError(`Erro ao carregar relatórios: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    try { localStorage.setItem(SELECTED_KEY, selectedId); } catch { /* sem armazenamento local */ }
  }, [selectedId]);

  const selected = configs.find(c => c.id === selectedId) || null;

  const handleCopy = async () => {
    if (!selected) return;
    setCopying(true);
    setError(null);
    try {
      const share = selected.share || await shareTrafficConfig(selected.id);
      if (!selected.share) setConfigs(prev => prev.map(c => (c.id === selected.id ? { ...c, shareId: share.id, share } : c)));
      await navigator.clipboard.writeText(buildShareUrl(share));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(`Erro ao gerar o link: ${err.message}`);
    } finally {
      setCopying(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Remover o relatório de ${selected.name}? O link do cliente deixa de funcionar.`)) return;
    try {
      await deleteTrafficConfig(selected.id);
      await load();
    } catch (err) {
      setError(`Erro ao remover: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className={FILTER_ROW}>
        <ReportFormatSelector />
        <div className={FILTER_FIELD}>
          <label htmlFor="report-full-client" className={FILTER_LABEL}>Cliente</label>
          <select
            id="report-full-client"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className={FILTER_CONTROL}
            disabled={!configs.length}
          >
            {!configs.length && <option value="">Nenhum relatório criado</option>}
            {configs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setEditing('new')}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-primary hover:border-primary/40">
          <Plus size={16} /> Novo relatório completo
        </button>
        {selected && (
          <>
            <button type="button" onClick={() => setEditing(selected)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-primary hover:border-primary/40">
              <Pencil size={16} /> Configurar
            </button>
            <button type="button" onClick={handleCopy} disabled={copying}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {copying ? <Loader2 size={16} className="animate-spin" /> : copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Link copiado' : 'Copiar link do relatório'}
            </button>
            {selected.share && <code className="truncate text-xs text-text-secondary">{buildShareUrl(selected.share)}</code>}
            <button type="button" onClick={handleDelete} title="Remover relatório"
              className="ml-auto rounded-lg p-2 text-text-secondary hover:bg-danger/15 hover:text-danger">
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {loading && <p role="status" className="py-8 text-center text-text-secondary">Carregando relatórios...</p>}

      {!loading && !configs.length && (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-12 text-center text-sm text-text-secondary">
          Crie o primeiro relatório completo: escolha as contas Meta e Google do cliente, os públicos e os eventos de cada funil.
        </div>
      )}

      {selected && (
        <Suspense fallback={<p role="status" className="py-8 text-center text-text-secondary">Carregando relatório...</p>}>
          <TrafficReport key={`${selected.id}|${selected.updatedAt}`} source={{ configId: selected.id }} embedded />
        </Suspense>
      )}

      {editing && (
        <TrafficReportConfig
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (saved) => {
            await load();
            setSelectedId(saved.id);
          }}
        />
      )}
    </div>
  );
}
