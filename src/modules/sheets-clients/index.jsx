import { useState, useEffect, useMemo } from 'react';
import { fetchAllSheetClients } from '../../services/googleSheets';
import { Search, RefreshCw, Users, Building2, CheckCircle2, PauseCircle, AlertCircle, FileSpreadsheet } from 'lucide-react';

const STATUS_CONFIG = {
  active: { label: 'Ativo', color: 'bg-success/15 text-success border-success/20', dot: 'bg-success' },
  paused: { label: 'Pausado', color: 'bg-warning/15 text-warning border-warning/20', dot: 'bg-warning' },
  note: { label: 'Nota', color: 'bg-info/15 text-info border-info/20', dot: 'bg-info' },
  inactive: { label: 'Inativo', color: 'bg-text-secondary/10 text-text-secondary border-border', dot: 'bg-text-secondary' },
};

const AGENCY_TABS = [
  { key: 'all', label: 'Todas', icon: Users },
  { key: 'TAG', label: 'TAG', icon: Building2 },
  { key: 'GDM', label: 'GDM', icon: Building2 },
  { key: 'LAQUILA', label: "L'Aquila", icon: Building2 },
];

function StatusBadge({ status, value }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.inactive;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {value || cfg.label}
    </span>
  );
}

function SkeletonRows() {
  return Array.from({ length: 8 }).map((_, i) => (
    <tr key={i} className="border-b border-border/30">
      {Array.from({ length: 7 }).map((_, j) => (
        <td key={j} className="px-4 py-3.5">
          <div className="skeleton h-4 rounded" style={{ width: `${50 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  ));
}

export default function SheetsClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await fetchAllSheetClients();
      setClients(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    return clients.filter(c => {
      if (agencyFilter !== 'all' && c.agency !== agencyFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return c.name.toLowerCase().includes(s) || c.nicho?.toLowerCase().includes(s);
      }
      return true;
    });
  }, [clients, agencyFilter, search]);

  const stats = useMemo(() => {
    const target = agencyFilter === 'all' ? clients : clients.filter(c => c.agency === agencyFilter);
    return {
      total: target.length,
      active: target.filter(c => c.facebookStatus === 'active' || c.googleStatus === 'active').length,
      paused: target.filter(c => c.facebookStatus === 'paused' || c.googleStatus === 'paused').length,
    };
  }, [clients, agencyFilter]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <FileSpreadsheet size={22} className="text-primary-light" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Planilha de Clientes</h1>
            <p className="text-sm text-text-secondary">
              {loading ? 'Carregando...' : `${clients.length} clientes em ${new Set(clients.map(c => c.agency)).size} agências`}
            </p>
          </div>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:border-primary/30 transition-all disabled:opacity-50"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: Users, iconColor: 'text-primary-light', bgColor: 'bg-primary/10' },
          { label: 'Ativos', value: stats.active, icon: CheckCircle2, iconColor: 'text-success', bgColor: 'bg-success/10' },
          { label: 'Pausados', value: stats.paused, icon: PauseCircle, iconColor: 'text-warning', bgColor: 'bg-warning/10' },
        ].map(({ label, value, icon: Icon, iconColor, bgColor }) => (
          <div key={label} className="bg-surface border border-border rounded-xl p-4 card-hover glow-border">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${bgColor}`}>
                <Icon size={18} className={iconColor} />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{loading ? '—' : value}</p>
                <p className="text-xs text-text-secondary">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Agency Tabs + Search ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="overflow-x-auto pb-1">
          <div className="flex w-max gap-1 rounded-xl border border-border bg-surface p-1">
          {AGENCY_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setAgencyFilter(tab.key)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                agencyFilter === tab.key
                  ? 'bg-gradient-to-r from-primary/20 to-primary-light/10 text-primary-light shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.03]'
              }`}
            >
              {tab.label}
            </button>
          ))}
          </div>
        </div>
        <div className="relative w-full flex-1 sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary/50" />
          <input
            type="text"
            placeholder="Buscar cliente ou nicho..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
        </div>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="flex items-center gap-3 bg-danger/10 border border-danger/20 rounded-xl px-5 py-4 text-sm text-danger">
          <AlertCircle size={18} className="shrink-0" />
          <div>
            <p className="font-medium">Erro ao carregar dados</p>
            <p className="text-danger/70 text-xs mt-0.5">{error}</p>
          </div>
          <button onClick={() => loadData()} className="ml-auto text-xs font-medium underline underline-offset-2 hover:text-danger/80">
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-hover/50 border-b border-border">
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Agência</th>
                <th className="text-left px-4 py-3 font-medium">Facebook</th>
                <th className="text-left px-4 py-3 font-medium">Google</th>
                <th className="text-left px-4 py-3 font-medium">Verba</th>
                <th className="text-left px-4 py-3 font-medium">Valor</th>
                <th className="text-left px-4 py-3 font-medium">Nicho</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-text-secondary">
                    {search || agencyFilter !== 'all' ? 'Nenhum cliente encontrado com esses filtros.' : 'Nenhum cliente na planilha.'}
                  </td>
                </tr>
              ) : (
                filtered.map((client, idx) => (
                  <tr key={`${client.agency}-${client.name}-${idx}`} className="border-b border-border/30 hover:bg-surface-hover/30 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-text-primary">{client.name}</td>
                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary-light border border-primary/20">
                        {client.agency}
                      </span>
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={client.facebookStatus} value={client.facebook} /></td>
                    <td className="px-4 py-3.5"><StatusBadge status={client.googleStatus} value={client.google} /></td>
                    <td className="px-4 py-3.5 text-text-secondary">{client.verba || '—'}</td>
                    <td className="px-4 py-3.5 text-text-secondary">{client.valor || '—'}</td>
                    <td className="px-4 py-3.5 text-text-secondary text-xs">{client.nicho || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border/30 text-xs text-text-secondary/60">
            Exibindo {filtered.length} de {clients.length} clientes
          </div>
        )}
      </div>
    </div>
  );
}
