import { useState, useMemo } from 'react';
import { useClients } from '../../contexts/ClientsContext';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from '../../shared/utils/format';
import { Users, Plus, X, Search, Filter } from 'lucide-react';

const nicheLabels = {
  previdenciario: 'Previdenciário', trabalhista: 'Trabalhista', tributario: 'Tributário',
  civil: 'Civil', criminal: 'Criminal', outro: 'Outro'
};
const allStatuses = ['active', 'paused', 'onboarding', 'churned', 'defaulting'];
const allNiches = Object.keys(nicheLabels);

export default function Clients() {
  const { clients, addClient, updateClient } = useClients();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [nicheFilter, setNicheFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);

  const filtered = useMemo(() => {
    return clients.filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.contactName.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (nicheFilter !== 'all' && c.niche !== nicheFilter) return false;
      return true;
    });
  }, [clients, search, statusFilter, nicheFilter]);

  const handleSave = async (data) => {
    try {
      if (editingClient) {
        await updateClient(editingClient.id, data);
      } else {
        await addClient(data);
      }
      setShowModal(false);
      setEditingClient(null);
    } catch (err) {
      alert(`Erro ao salvar cliente: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-info/10"><Users size={24} className="text-info" /></div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Cadastro de Clientes</h1>
            <p className="text-sm text-text-secondary">{clients.length} clientes cadastrados</p>
          </div>
        </div>
        <button onClick={() => { setEditingClient(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-primary-light text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus size={16} /> Novo Cliente
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text" placeholder="Buscar por nome..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary">
          <option value="all">Todos os status</option>
          {allStatuses.map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
        </select>
        <select value={nicheFilter} onChange={e => setNicheFilter(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary">
          <option value="all">Todos os nichos</option>
          {allNiches.map(n => <option key={n} value={n}>{nicheLabels[n]}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-text-secondary font-medium">Cliente</th>
              <th className="text-left px-3 py-3 text-text-secondary font-medium">Contato</th>
              <th className="text-center px-3 py-3 text-text-secondary font-medium">Nicho</th>
              <th className="text-center px-3 py-3 text-text-secondary font-medium">Plataformas</th>
              <th className="text-right px-3 py-3 text-text-secondary font-medium">Budget Mensal</th>
              <th className="text-center px-3 py-3 text-text-secondary font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((client, i) => (
              <tr key={client.id} onClick={() => setSelectedClient(client)}
                className={`border-b border-border/50 hover:bg-surface-hover transition-colors cursor-pointer ${i % 2 === 0 ? 'bg-surface' : 'bg-bg/30'}`}>
                <td className="px-4 py-3 font-medium text-text-primary">{client.name}</td>
                <td className="px-3 py-3 text-text-secondary">{client.contactName}</td>
                <td className="px-3 py-3 text-center">
                  <span className="text-xs px-2 py-0.5 rounded bg-surface-hover text-text-secondary">{nicheLabels[client.niche]}</span>
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="flex justify-center gap-1">
                    {client.platforms.includes('meta') && <span className="text-xs px-1.5 py-0.5 rounded bg-meta/10 text-meta">Meta</span>}
                  </div>
                </td>
                <td className="px-3 py-3 text-right text-text-primary">{formatCurrency(client.monthlyBudget)}</td>
                <td className="px-3 py-3 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(client.status)}`}>{getStatusLabel(client.status)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Side Panel */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedClient(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-[480px] h-full bg-surface border-l border-border overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-text-primary">{selectedClient.name}</h2>
                <button onClick={() => setSelectedClient(null)} className="text-text-secondary hover:text-text-primary"><X size={20} /></button>
              </div>
              <div className="space-y-4 text-sm">
                <Field label="Contato" value={selectedClient.contactName} />
                <Field label="Telefone" value={selectedClient.phone} />
                <Field label="Email" value={selectedClient.email} />
                <Field label="Nicho" value={nicheLabels[selectedClient.niche]} />
                <Field label="Budget Mensal" value={formatCurrency(selectedClient.monthlyBudget)} />
                <Field label="Início do Contrato" value={formatDate(selectedClient.contractStartDate)} />
                <Field label="Vencimento" value={`Dia ${selectedClient.paymentDueDay}`} />
                <Field label="Status">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(selectedClient.status)}`}>
                    {getStatusLabel(selectedClient.status)}
                  </span>
                </Field>
                <Field label="Plataformas">
                  <div className="flex gap-1">
                    {selectedClient.platforms.filter(p => p === 'meta').map(p => (
                      <span key={p} className="text-xs px-2 py-0.5 rounded bg-meta/10 text-meta">
                        Meta
                      </span>
                    ))}
                  </div>
                </Field>
                {selectedClient.metaAccountId && <Field label="ID Meta" value={selectedClient.metaAccountId} />}
                <div>
                  <span className="text-text-secondary block mb-1">Observações</span>
                  <p className="text-text-primary bg-bg/50 p-3 rounded-lg border border-border/50">{selectedClient.notes}</p>
                </div>
              </div>
              <div className="mt-6 flex gap-2">
                <button onClick={() => { setEditingClient(selectedClient); setShowModal(true); setSelectedClient(null); }}
                  className="flex-1 px-4 py-2 bg-primary/20 text-primary-light rounded-lg text-sm font-medium hover:bg-primary/30 transition-colors">
                  Editar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ClientModal
          client={editingClient}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingClient(null); }}
        />
      )}
    </div>
  );
}

function Field({ label, value, children }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-text-secondary">{label}</span>
      {children || <span className="text-text-primary font-medium">{value}</span>}
    </div>
  );
}

function ClientModal({ client, onSave, onClose }) {
  const [form, setForm] = useState({
    name: client?.name || '',
    contactName: client?.contactName || '',
    phone: client?.phone || '',
    email: client?.email || '',
    niche: client?.niche || 'previdenciario',
    platforms: client?.platforms || ['meta'],
    metaAccountId: client?.metaAccountId || '',
    monthlyBudget: client?.monthlyBudget || 2000,
    contractStartDate: client?.contractStartDate || new Date().toISOString().split('T')[0],
    paymentDueDay: client?.paymentDueDay || 10,
    status: client?.status || 'active',
    notes: client?.notes || '',
  });

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const togglePlatform = (p) => {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p) ? prev.platforms.filter(x => x !== p) : [...prev.platforms, p]
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-surface rounded-xl border border-border w-[560px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-text-primary">{client ? 'Editar Cliente' : 'Novo Cliente'}</h2>
            <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X size={20} /></button>
          </div>
          <div className="space-y-4">
            <FormField label="Nome do Escritório">
              <input value={form.name} onChange={e => update('name', e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Contato">
                <input value={form.contactName} onChange={e => update('contactName', e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary" />
              </FormField>
              <FormField label="Telefone">
                <input value={form.phone} onChange={e => update('phone', e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary" />
              </FormField>
            </div>
            <FormField label="Email">
              <input type="email" value={form.email} onChange={e => update('email', e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Nicho">
                <select value={form.niche} onChange={e => update('niche', e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary">
                  {allNiches.map(n => <option key={n} value={n}>{nicheLabels[n]}</option>)}
                </select>
              </FormField>
              <FormField label="Status">
                <select value={form.status} onChange={e => update('status', e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary">
                  {allStatuses.map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Plataformas">
              <div className="flex gap-2">
                <button onClick={() => togglePlatform('meta')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${form.platforms.includes('meta') ? 'bg-meta/20 text-meta border-meta/40' : 'bg-bg text-text-secondary border-border'}`}>
                  Meta Ads
                </button>
              </div>
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Budget Mensal (R$)">
                <input type="number" value={form.monthlyBudget} onChange={e => update('monthlyBudget', +e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary" />
              </FormField>
              <FormField label="Dia Vencimento">
                <input type="number" min="1" max="31" value={form.paymentDueDay} onChange={e => update('paymentDueDay', +e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary" />
              </FormField>
            </div>
            <FormField label="Observações">
              <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={3}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary resize-none" />
            </FormField>
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

function FormField({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1">{label}</label>
      {children}
    </div>
  );
}
