import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import PeriodSelector from '../../shared/components/PeriodSelector';
import ReportCard from '../../shared/components/ReportCard';

function serializePeriod(period) {
  if (typeof period === 'object' && period?.type === 'custom') {
    return JSON.stringify({ type: 'custom', startDate: period.startDate, endDate: period.endDate });
  }
  return period;
}

export default function PublicReport() {
  const { shareId } = useParams();
  const [selectedPeriod, setSelectedPeriod] = useState('7d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const agencyType = data?.agency === 'tag' ? 'tag' : 'vilasmkt';
  const agencyLabel = agencyType === 'tag' ? 'Grupo Tag' : 'Vilas Growth Marketing';
  const agencyLogoSrc = agencyType === 'tag' ? '/logotag.png' : '/favicon.png';

  const fetchReport = useCallback(async () => {
    if (!shareId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        shareId,
        period: serializePeriod(selectedPeriod),
      });
      const res = await fetch(`/api/public-report?${params.toString()}`);
      const text = await res.text();
      const contentType = res.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        setError(
          `Endpoint não respondeu JSON (HTTP ${res.status}). ` +
          `Provavelmente a função /api/public-report ainda não foi deployada na Vercel.`
        );
        setData(null);
        return;
      }

      const json = JSON.parse(text);
      if (!res.ok) {
        setError(json.error || `Erro HTTP ${res.status}`);
        setData(null);
      } else if (json.empty) {
        setData(null);
        setError(json.message || 'Sem dados para o período selecionado.');
      } else {
        setData(json);
      }
    } catch (err) {
      setError(`Erro de rede: ${err.message}`);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [shareId, selectedPeriod]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const titleAccount = useMemo(() => data?.accountName || 'Relatório', [data]);

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <div className="mx-auto max-w-[1280px] px-4 py-6 lg:px-8 lg:py-10">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-light">{agencyLabel}</p>
            <h1 className="mt-1 text-2xl font-bold lg:text-3xl">{titleAccount}</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Relatório atualizado em tempo real. Selecione o período abaixo.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="z-50 w-full sm:w-[260px]">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-secondary">Período</label>
              <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} className="w-full" />
            </div>
            <button
              type="button"
              onClick={fetchReport}
              disabled={loading}
              className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl border border-primary/40 bg-surface px-4 text-sm font-semibold text-primary-light transition hover:bg-primary/10 disabled:opacity-40"
              title="Atualizar dados"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Atualizar
            </button>
          </div>
        </header>

        {loading && !data && (
          <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-border bg-surface">
            <div className="flex flex-col items-center gap-3 text-text-secondary">
              <Loader2 size={28} className="animate-spin text-primary-light" />
              <p className="text-sm">Carregando relatório...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-danger/30 bg-danger/5">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <AlertCircle size={28} className="text-danger" />
              <p className="text-sm text-danger">{error}</p>
              <button
                type="button"
                onClick={fetchReport}
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
              >
                <RefreshCw size={12} /> Tentar novamente
              </button>
            </div>
          </div>
        )}

        {data && !error && (
          <div className="overflow-x-auto pb-6">
            <ReportCard
              data={data}
              agencyLogoSrc={agencyLogoSrc}
              metaLogoSrc="/logometa.png"
              agencyLabel={agencyLabel}
              objective={data.objective || 'messages'}
              withBarChart
            />
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-text-secondary/70">
          Powered by {agencyLabel}
        </footer>
      </div>
    </div>
  );
}
