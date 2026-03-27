import { useState, useMemo } from 'react';
import { useChangeLog } from '../../contexts/ChangeLogContext';
import { formatDateTime } from '../../shared/utils/format';
import { FileText, Plus, X, Search, ArrowRight, CheckCircle, XCircle, MinusCircle, Clock } from 'lucide-react';

const changeTypeLabels = {
  creative: 'Criativo', audience: 'Público', budget: 'Orçamento', bid: 'Lance',
  copy: 'Copy', targeting: 'Segmentação', new_campaign: 'Nova Campanha',
  pause: 'Pausar', reactivation: 'Reativação', other: 'Outro'
};
const changeTypeColors = {
  creative: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  audience: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  budget: 'bg-green-500/10 text-green-400 border-green-500/20',
  bid: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  copy: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  targeting: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  new_campaign: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pause: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  reactivation: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  other: 'bg-gray-500/10 text-gray-400 border-gray-500/20'
};
const impactIcons = {
  positive: <CheckCircle size={14} className="text-success" />,
  negative: <XCircle size={14} className="text-danger" />,
  neutral: <MinusCircle size={14} className="text-text-secondary" />,
  pending: <Clock size={14} className="text-warning" />
};

export default function ChangeLog() {
  const { entries, addEntry, updateImpact } = useChangeLog();
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (search && !e.description.toLowerCase().includes(search.toLowerCase()) && !e.clientName.toLowerCase().includes(search.toLowerCase())) return false;
      if (platformFilter !== 'all' && e.platform !== platformFilter) return false;
      if (typeFilter !== 'all' && e.changeType !== typeFilter) return false;
      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [entries, search, platformFilter, typeFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><FileText size={24} className="text-primary-light" /></div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Log de Alterações</h1>
            <p className="text-sm text-text-secondary">{entries.length} registros</p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-primary-light text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus size={16} /> Nova Alteração
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input type="text" placeholder="Buscar na descrição..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary" />
        </div>
        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary">
          <option value="all">Todas plataformas</option>
          <option value="meta">Meta Ads</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary">
          <option value="all">Todos os tipos</option>
          {Object.entries(changeTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {filtered.map(entry => (
          <div key={entry.id} className="bg-surface rounded-xl border border-border p-5 hover:bg-surface-hover transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded border ${changeTypeColors[entry.changeType]}`}>{changeTypeLabels[entry.changeType]}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-meta/10 text-meta">
                  Meta
                </span>
                <span className="text-xs text-text-secondary">{entry.clientName}</span>
              </div>
              <span className="text-xs text-text-secondary">{formatDateTime(entry.date)}</span>
            </div>
            {entry.campaignName && <p className="text-xs text-text-secondary mb-2">Campanha: {entry.campaignName}</p>}
            <p className="text-sm text-text-primary mb-3">{entry.description}</p>
            {(entry.previousValue || entry.newValue) && (
              <div className="flex items-center gap-2 text-xs bg-bg/50 p-2 rounded-lg border border-border/50">
                {entry.previousValue && <span className="text-text-secondary line-through">{entry.previousValue}</span>}
                {entry.previousValue && entry.newValue && <ArrowRight size={12} className="text-text-secondary" />}
                {entry.newValue && <span className="text-primary-light font-medium">{entry.newValue}</span>}
              </div>
            )}
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-text-secondary">Impacto:</span>
              {['positive', 'negative', 'neutral', 'pending'].map(impact => (
                <button key={impact} onClick={() => updateImpact(entry.id, impact)}
                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-all ${entry.impact === impact ? 'border-primary/40 bg-primary/10' : 'border-border bg-bg/30 opacity-50 hover:opacity-100'}`}>
                  {impactIcons[impact]}
                  {{ positive: 'Positivo', negative: 'Negativo', neutral: 'Neutro', pending: 'Pendente' }[impact]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && <LogEntryModal onSave={async (entry) => { await addEntry(entry); setShowModal(false); }} onClose={() => setShowModal(false)} />}
    </div>
  );
}

function LogEntryModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    platform: 'meta', clientName: '', accountId: '', campaignName: '',
    changeType: 'creative', description: '', previousValue: '', newValue: '', impact: 'pending'
  });
  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-surface rounded-xl border border-border w-[520px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-text-primary">Nova Alteração</h2>
            <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X size={20} /></button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Plataforma</label>
                <select value={form.platform} onChange={e => update('platform', e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary">
                  <option value="meta">Meta Ads</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Tipo</label>
                <select value={form.changeType} onChange={e => update('changeType', e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary">
                  {Object.entries(changeTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Cliente</label>
              <input value={form.clientName} onChange={e => update('clientName', e.target.value)}
                placeholder="Nome do cliente..."
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Campanha</label>
              <input value={form.campaignName} onChange={e => update('campaignName', e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Descrição da alteração</label>
              <textarea value={form.description} onChange={e => update('description', e.target.value)} rows={3}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Valor anterior</label>
                <input value={form.previousValue} onChange={e => update('previousValue', e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Novo valor</label>
                <input value={form.newValue} onChange={e => update('newValue', e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary" />
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 px-4 py-2 bg-bg border border-border rounded-lg text-sm text-text-secondary hover:bg-surface-hover transition-colors">Cancelar</button>
            <button onClick={() => onSave(form)} className="flex-1 px-4 py-2 bg-gradient-to-r from-primary to-primary-light text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
