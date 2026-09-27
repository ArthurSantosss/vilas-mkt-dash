import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ArrowUpRight } from 'lucide-react';
import { useAlerts } from '../../contexts/AlertsContext';

export default function AlertsPanel({ loading, error }) {
  const { alerts, thresholds, updateThreshold, markAsRead, markAllAsRead, loading: alertsLoading, error: alertsError } = useAlerts();
  const [filter, setFilter] = useState('pending');
  const filtered = alerts.filter(alert => filter === 'all' || (filter === 'critical' ? alert.type === 'critical' : !alert.read));
  const pending = alerts.filter(alert => !alert.read).length;
  const hasError = error || alertsError;

  return (
    <section id="avisos" className="bg-surface rounded-2xl border border-border p-5 h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Avisos e prioridades</h2>
          <p className="text-xs text-text-secondary mt-1">Pagamentos, saldos e resultados de hoje. Entrega no período selecionado.</p>
        </div>
        <label className="text-xs text-text-secondary flex items-center gap-2">
          Exibir
          <select value={filter} onChange={event => setFilter(event.target.value)} className="bg-bg border border-border rounded-lg p-2 text-text-primary">
            <option value="pending">Não lidos ({pending})</option>
            <option value="critical">Críticos ({alerts.filter(alert => alert.type === 'critical').length})</option>
            <option value="all">Todos ({alerts.length})</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 py-3 border-b border-border/60 text-xs text-text-secondary">
        <span aria-live="polite">{loading || alertsLoading ? 'Atualizando avisos…' : `${filtered.length} aviso(s) nesta lista`}</span>
        {pending > 0 && <button onClick={markAllAsRead} className="hover:text-primary-light transition-colors">Marcar todos como lidos</button>}
      </div>
      {hasError && <p role="alert" className="py-3 text-xs text-warning">{alertsError || 'Dados incompletos. Confira o status da atualização acima.'}</p>}
      <div className="max-h-[520px] overflow-y-auto divide-y divide-border/60">
        {filtered.map(alert => (
          <article key={alert.id} className="flex gap-3 py-4">
            <AlertTriangle size={17} className={`shrink-0 mt-1 ${alert.type === 'critical' ? 'text-danger' : 'text-warning'}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-text-primary">{alert.accountName}</span>
                <span className="text-[11px] text-text-secondary">Meta{alert.agency ? ` · ${alert.agency}` : ''}</span>
                {alert.read && <span className="text-[11px] text-text-secondary">Lido</span>}
              </div>
              <p className="text-sm text-text-primary mt-1">{alert.message}</p>
              {alert.detail && <p className="text-xs text-text-secondary mt-1">{alert.detail}</p>}
              <div className="flex flex-wrap items-center gap-4 mt-3">
                <Link to={alert.href} className="inline-flex items-center gap-1 text-xs text-primary-light hover:underline">{alert.href === '/saldos' ? 'Ver saldos' : 'Ver campanhas'}<ArrowUpRight size={13} /></Link>
                {!alert.read && <button onClick={() => markAsRead(alert.readKey)} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"><Check size={13} /> Marcar como lido</button>}
              </div>
            </div>
          </article>
        ))}
        {filtered.length === 0 && !loading && !alertsLoading && <p className="py-8 text-sm text-text-secondary text-center">{hasError ? 'Aguardando dados completos para avaliar os avisos.' : filter === 'pending' && alerts.length ? 'Todos os avisos foram lidos. Consulte “Todos” para acompanhar condições ainda ativas.' : 'Nenhum aviso neste filtro com os dados disponíveis.'}</p>}
      </div>
      <details className="border-t border-border/60 py-3 text-xs text-text-secondary">
        <summary className="cursor-pointer hover:text-text-primary">Limites dos avisos</summary>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          {[
            ['balance_critical', 'Saldo crítico (R$)'],
            ['balance_warning', 'Saldo em atenção (R$)'],
            ['high_cost_lead', 'Custo por lead (R$)'],
          ].map(([key, label]) => (
            <label key={key} className="flex flex-col gap-2">{label}
              <input type="number" min="0" step="1" value={thresholds[key]} onChange={event => { if (event.target.value !== '') updateThreshold(key, Number(event.target.value)); }} className="min-w-0 w-full rounded-lg bg-bg border border-border px-3 py-2 text-text-primary" />
            </label>
          ))}
        </div>
        <p className="mt-3">Envio programado ao Slack: diariamente às 12h (Brasília).</p>
      </details>
      <p className="pt-3 border-t border-border/60 text-[11px] text-text-secondary">Marcar como lido não resolve a condição nem altera o envio de alertas ao Slack.</p>
    </section>
  );
}
