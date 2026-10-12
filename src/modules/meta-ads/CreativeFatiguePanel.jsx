import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { fetchCreativeFatigue } from '../../services/metaApi';
import { formatCurrency, formatPercent } from '../../shared/utils/format';
import { FATIGUE_WINDOW_DAYS } from '../../shared/utils/creativeFatigue';

const SEVERITY = {
  critical: { label: 'Trocar já', className: 'bg-danger/10 text-danger border-danger/20' },
  warning: { label: 'Atenção', className: 'bg-warning/10 text-warning border-warning/20' },
};

function formatShortDate(ymd) {
  const [, month, day] = ymd.split('-');
  return `${day}/${month}`;
}

function Change({ value, higherIsWorse = true }) {
  if (value == null) return null;
  const worse = higherIsWorse ? value > 0 : value < 0;
  return (
    <span className={`ml-1 text-[11px] font-semibold ${worse ? 'text-danger' : 'text-success'}`}>
      {value > 0 ? '+' : ''}{value.toFixed(0)}%
    </span>
  );
}

export default function CreativeFatiguePanel({ accountId, accountName }) {
  // Each response is tagged with the request key; loading = no response for the current key yet.
  const [response, setResponse] = useState({ key: null, error: null, result: null });
  const [expanded, setExpanded] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${accountId}:${reloadKey}`;

  useEffect(() => {
    let cancelled = false;
    fetchCreativeFatigue(accountId)
      .then((result) => { if (!cancelled) setResponse({ key: requestKey, error: null, result }); })
      .catch((err) => { if (!cancelled) setResponse({ key: requestKey, error: err.message, result: null }); });
    return () => { cancelled = true; };
  }, [accountId, requestKey]);

  const loading = response.key !== requestKey;
  const error = loading ? null : response.error;
  const result = loading ? null : response.result;
  const ads = result?.ads || [];
  const criticalCount = ads.filter((ad) => ad.severity === 'critical').length;

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-[0_2px_12px_-4px_rgba(0,0,0,0.25)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          {expanded ? <ChevronDown size={16} className="shrink-0 text-text-secondary" /> : <ChevronRight size={16} className="shrink-0 text-text-secondary" />}
          <AlertTriangle size={16} className={`shrink-0 ${ads.length ? 'text-warning' : 'text-text-secondary'}`} />
          <span className="text-sm font-semibold text-text-primary truncate">Criativos cansados — {accountName}</span>
          {!loading && !error && (
            <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${ads.length ? SEVERITY[criticalCount ? 'critical' : 'warning'].className : 'bg-success/10 text-success border-success/20'}`}>
              {ads.length ? `${ads.length} anúncio${ads.length !== 1 ? 's' : ''}` : 'Nenhum'}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={loading}
          className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg text-text-secondary hover:text-primary hover:border-primary/30 disabled:opacity-40 transition-colors"
          aria-label="Analisar novamente"
          title="Analisar novamente"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border/60 px-4 py-3 lg:px-5">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 size={14} className="animate-spin" /> Comparando os últimos {FATIGUE_WINDOW_DAYS} dias com a semana anterior...
            </div>
          )}

          {error && <p className="text-sm text-danger">Não foi possível analisar os criativos: {error}</p>}

          {result && (
            <>
              <p className="mb-3 text-xs text-text-secondary">
                Anúncios ativos de {formatShortDate(result.windows.recent.since)} a {formatShortDate(result.windows.recent.until)} comparados
                com {formatShortDate(result.windows.previous.since)} a {formatShortDate(result.windows.previous.until)}. Sinal de fadiga:
                frequência alta com queda no CTR de link.
              </p>

              {ads.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 size={15} /> Nenhum criativo com sinal de fadiga.
                </div>
              ) : (
                <div className="space-y-2">
                  {ads.map((ad) => (
                    <div key={ad.adId} className="rounded-xl border border-border/60 bg-bg/40 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary break-words">{ad.adName}</p>
                          <p className="text-[11px] text-text-secondary break-words">
                            {ad.campaignName}{ad.adsetName ? ` › ${ad.adsetName}` : ''}
                          </p>
                        </div>
                        <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${SEVERITY[ad.severity].className}`}>
                          {SEVERITY[ad.severity].label}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider text-text-secondary">Frequência</span>
                          <span className="text-text-primary">{ad.previousFrequency?.toFixed(1)} → <strong>{ad.frequency.toFixed(1)}</strong></span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider text-text-secondary">CTR de link</span>
                          <span className="text-text-primary">{formatPercent(ad.ctr)}</span>
                          <Change value={ad.ctrChange} higherIsWorse={false} />
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider text-text-secondary">Custo / lead</span>
                          <span className="text-text-primary">{ad.costPerLead != null ? formatCurrency(ad.costPerLead) : '—'}</span>
                          <Change value={ad.costPerLeadChange} />
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider text-text-secondary">Gasto {FATIGUE_WINDOW_DAYS}d</span>
                          <span className="text-text-primary">{formatCurrency(ad.spend)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
