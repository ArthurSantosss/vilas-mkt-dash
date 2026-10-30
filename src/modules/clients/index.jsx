import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users, Plus, X, Search, Pencil, Trash2, Pin, PinOff, StickyNote, Wallet, Building2,
  Link2, ArrowDownCircle, ArrowUpCircle, CheckCircle2, RotateCcw, CalendarPlus, AlertTriangle, Instagram,
} from 'lucide-react';
import { useClients } from '../../contexts/ClientsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useGoogleAds } from '../../contexts/GoogleAdsContext';
import { fetchInstagramAccounts } from '../../services/instagramApi';
import { MetaIcon, GoogleAdsIcon } from '../../shared/components/PlatformIcons';
import { formatCurrency, formatDate, formatDateTime } from '../../shared/utils/format';
import {
  LINK_PLATFORMS,
  TRANSACTION_TYPES,
  isPerClientAgency,
  agencyAccountKey,
  linkKey,
  summarizeTransactions,
  collectAgencyTransactions,
  collectAllTransactions,
  getTransactionState,
  sortTransactions,
  sortNotes,
  buildLinkOwnerMap,
  groupClientsByAgency,
  toLocalISODate,
} from '../../shared/utils/clients';

const AGENCY_TAB_KEY = 'clients_selected_agency';
const ALL = '__all__';
const NO_AGENCY = '__none__';

const TRX_STATE = {
  paid: { label: 'Pago', className: 'text-success bg-success/10 border-success/20' },
  pending: { label: 'Pendente', className: 'text-warning bg-warning/10 border-warning/20' },
  overdue: { label: 'Atrasado', className: 'text-danger bg-danger/10 border-danger/20' },
};

const INPUT = 'w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary';

const dateLabel = (iso) => (iso ? formatDate(`${iso}T00:00:00`) : '—');

function readStoredTab() {
  try { return localStorage.getItem(AGENCY_TAB_KEY) || ALL; } catch { return ALL; }
}

function PlatformGlyph({ platform, size = 14 }) {
  if (platform === 'meta') return <MetaIcon size={size} />;
  if (platform === 'google') return <GoogleAdsIcon size={size} />;
  return <Instagram size={size} className="text-pink-400" />;
}

function BillingChip({ agency }) {
  if (!agency) return null;
  return isPerClientAgency(agency)
    ? <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-light">Recebe por cliente</span>
    : <span className="rounded-full border border-border bg-bg/50 px-2 py-0.5 text-[10px] font-medium text-text-secondary">Salário fixo</span>;
}

/** Contas disponíveis para vínculo, de todas as plataformas conectadas. */
function useLinkableAccounts(enabled) {
  const { accounts: metaAccounts } = useMetaAds();
  const { rawAccounts: googleAccounts } = useGoogleAds();
  const instagramQuery = useQuery({
    queryKey: ['instagram-accounts'],
    queryFn: () => fetchInstagramAccounts(),
    staleTime: 10 * 60_000,
    enabled,
  });

  return useMemo(() => ({
    meta: (metaAccounts || []).map((a) => ({ platform: 'meta', id: String(a.id), name: a.clientName || a.id })),
    google: (googleAccounts || []).map((a) => ({ platform: 'google', id: String(a.accountId), name: a.name || a.accountId })),
    instagram: (instagramQuery.data?.accounts || []).map((a) => ({
      platform: 'instagram',
      id: String(a.id),
      name: a.username ? `@${a.username}` : (a.name || a.id),
    })),
    instagramLoading: instagramQuery.isLoading,
    instagramError: instagramQuery.error?.message || null,
  }), [metaAccounts, googleAccounts, instagramQuery.data, instagramQuery.isLoading, instagramQuery.error]);
}

export default function Clients() {
  const { clients, agencyBilling, saveClient, deleteClient } = useClients();
  const { agencies } = useAgency();
  const [storedTab, setStoredTab] = useState(readStoredTab);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null = fechado, {} = novo, cliente = edição
  const [selectedId, setSelectedId] = useState(null);

  const today = toLocalISODate();
  const groups = useMemo(() => groupClientsByAgency(clients, agencies), [clients, agencies]);
  const hasOrphans = groups.some((group) => group.agency === '');
  // Agência lembrada que deixou de existir volta para "Todas".
  const tab = storedTab === ALL || agencies.includes(storedTab) || (storedTab === NO_AGENCY && hasOrphans) ? storedTab : ALL;
  const selectedAgency = tab === ALL ? null : tab === NO_AGENCY ? '' : tab;
  const selected = clients.find((client) => client.id === selectedId) || null;

  const changeTab = (next) => {
    setStoredTab(next);
    try { localStorage.setItem(AGENCY_TAB_KEY, next); } catch { /* modo privado */ }
  };

  const totals = useMemo(() => summarizeTransactions(
    selectedAgency === null
      ? collectAllTransactions(clients, agencyBilling)
      : collectAgencyTransactions(selectedAgency, clients, agencyBilling),
    today,
  ), [clients, agencyBilling, selectedAgency, today]);

  const visibleGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return groups
      .filter((group) => selectedAgency === null || group.agency === selectedAgency)
      .map((group) => ({
        ...group,
        clients: group.clients.filter((client) => !term
          || client.name.toLowerCase().includes(term)
          || client.links.some((link) => link.name.toLowerCase().includes(term) || link.id.includes(term))),
      }))
      .filter((group) => group.clients.length > 0 || (selectedAgency !== null && !term));
  }, [groups, selectedAgency, search]);

  const handleSave = (data) => {
    try {
      const saved = saveClient(data);
      setEditing(null);
      setSelectedId(saved.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = (client) => {
    if (!window.confirm(`Excluir o cliente "${client.name}"? Anotações e lançamentos também serão apagados.`)) return;
    deleteClient(client.id);
    setSelectedId(null);
  };

  const defaultAgency = selectedAgency || agencies.find(isPerClientAgency) || agencies[0] || '';
  const tabs = [
    { value: ALL, label: 'Todas', count: clients.length },
    ...agencies.map((agency) => ({ value: agency, label: agency, count: clients.filter((c) => c.agency === agency).length })),
    ...(hasOrphans ? [{ value: NO_AGENCY, label: 'Sem agência', count: groups.find((g) => g.agency === '').clients.length }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Users size={24} className="text-primary-light" /></div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Clientes</h1>
            <p className="text-sm text-text-secondary">
              {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'} em {agencies.length} {agencies.length === 1 ? 'agência' : 'agências'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ agency: defaultAgency })}
          className="flex w-full items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-primary-light text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity sm:w-auto"
        >
          <Plus size={16} /> Novo cliente
        </button>
      </div>

      {agencies.length === 0 && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Nenhuma agência cadastrada. Crie as agências em Configurações → Agências para organizar os clientes.
        </p>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(({ value, label, count }) => (
          <button
            key={value}
            type="button"
            onClick={() => changeTab(value)}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${tab === value
              ? 'border-primary/40 bg-primary/10 text-primary-light'
              : 'border-border bg-surface/60 text-text-secondary hover:text-text-primary'}`}
          >
            {value !== ALL && value !== NO_AGENCY && <Building2 size={14} />}
            {label}
            <span className="rounded-full bg-white/[0.06] px-1.5 text-[11px]">{count}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="A receber" value={totals.toReceive} icon={ArrowDownCircle} tone="text-primary-light" />
        <SummaryCard label="Recebido no mês" value={totals.receivedThisMonth} icon={CheckCircle2} tone="text-success" />
        <SummaryCard label="Em atraso" value={totals.overdueReceivable + totals.overduePayable} icon={AlertTriangle} tone="text-danger"
          hint={totals.overdueCount ? `${totals.overdueCount} ${totals.overdueCount === 1 ? 'lançamento' : 'lançamentos'}` : null} />
        <SummaryCard label="A pagar" value={totals.toPay} icon={ArrowUpCircle} tone="text-warning" />
      </div>

      {selectedAgency && !isPerClientAgency(selectedAgency) && (
        <AgencySalaryPanel key={selectedAgency} agency={selectedAgency} today={today} />
      )}

      <div className="relative w-full sm:max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
        <input
          type="text"
          placeholder="Buscar por cliente ou conta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-[42px] w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl pl-10 pr-4 text-sm font-medium text-text-primary placeholder:text-text-secondary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm"
        />
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/40 px-6 py-14 text-center">
          <Users size={32} className="mx-auto mb-3 text-text-secondary" />
          <p className="text-text-primary font-medium">Nenhum cliente cadastrado</p>
          <p className="mt-1 text-sm text-text-secondary">Cadastre clientes por agência e vincule as contas de anúncio e Instagram — aqui ou em Configurações, em cada conta.</p>
          <button type="button" onClick={() => setEditing({ agency: defaultAgency })} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 text-primary-light text-sm font-medium hover:bg-primary/30 transition-colors">
            <Plus size={16} /> Cadastrar primeiro cliente
          </button>
        </div>
      ) : visibleGroups.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-secondary">Nenhum cliente encontrado.</p>
      ) : (
        <div className="space-y-8">
          {visibleGroups.map((group) => (
            <section key={group.agency || NO_AGENCY}>
              {selectedAgency === null && (
                <div className="mb-3 flex items-center gap-2">
                  <Building2 size={15} className="text-primary-light" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-text-primary">{group.agency || 'Sem agência'}</h2>
                  <BillingChip agency={group.agency} />
                  <span className="text-xs text-text-secondary">· {group.clients.length}</span>
                </div>
              )}
              {group.clients.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-secondary">Nenhum cliente nesta agência.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.clients.map((client) => (
                    <ClientCard key={client.id} client={client} today={today} onOpen={() => setSelectedId(client.id)} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {selected && (
        <ClientDrawer
          key={selected.id}
          client={selected}
          today={today}
          onClose={() => setSelectedId(null)}
          onEdit={() => setEditing(selected)}
          onDelete={() => handleDelete(selected)}
        />
      )}

      {editing && (
        <ClientModal
          client={editing}
          clients={clients}
          agencies={agencies}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// eslint-disable-next-line no-unused-vars -- Icon é usado no JSX
function SummaryCard({ label, value, icon: Icon, tone, hint }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">{label}</span>
        <Icon size={16} className={tone} />
      </div>
      <p className={`mt-2 text-lg font-bold sm:text-xl ${tone}`}>{formatCurrency(value)}</p>
      {hint && <p className="mt-0.5 text-xs text-text-secondary">{hint}</p>}
    </div>
  );
}

function AgencySalaryPanel({ agency, today }) {
  const { agencyBilling, saveAgencyBilling } = useClients();
  const billing = agencyBilling[agency] || { salary: 0, dueDay: null, transactions: [] };
  const [salary, setSalary] = useState(billing.salary || '');
  const [dueDay, setDueDay] = useState(billing.dueDay || '');
  const dirty = Number(salary || 0) !== billing.salary || Number(dueDay || 0) !== Number(billing.dueDay || 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2"><Wallet size={18} className="text-primary-light" /></div>
          <div>
            <h2 className="text-base font-bold text-text-primary">Salário fixo · {agency}</h2>
            <p className="text-xs text-text-secondary">Esta agência paga um valor fixo mensal, independente dos clientes.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="Salário (R$)">
            <input type="number" min="0" step="0.01" value={salary} onChange={(e) => setSalary(e.target.value)} className={`${INPUT} sm:w-36`} />
          </FormField>
          <FormField label="Dia de pagamento">
            <input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} className={`${INPUT} sm:w-28`} />
          </FormField>
          <button type="button" disabled={!dirty} onClick={() => saveAgencyBilling(agency, { salary, dueDay })}
            className="rounded-lg bg-primary/20 px-3 py-2 text-sm font-medium text-primary-light hover:bg-primary/30 disabled:opacity-40">
            Salvar
          </button>
        </div>
      </div>
      <FinancePanel
        owner={{ kind: 'agency', id: agency }}
        transactions={billing.transactions}
        today={today}
        recurring={billing.salary > 0 ? { buttonLabel: 'Lançar salário do mês', amount: billing.salary } : null}
      />
    </div>
  );
}

function ClientCard({ client, today, onOpen }) {
  const perClient = isPerClientAgency(client.agency);
  const finance = summarizeTransactions(client.transactions, today);
  const counts = Object.keys(LINK_PLATFORMS)
    .map((platform) => ({ platform, count: client.links.filter((link) => link.platform === platform).length }))
    .filter((item) => item.count > 0);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/30 hover:bg-surface-hover"
    >
      <p className="truncate font-semibold text-text-primary">{client.name}</p>

      <div className="flex flex-wrap gap-1.5 min-h-[24px]">
        {counts.length === 0 && <span className="text-xs text-text-secondary">Nenhuma conta vinculada</span>}
        {counts.map(({ platform, count }) => (
          <span key={platform} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg/50 px-2 py-0.5 text-xs text-text-secondary">
            <PlatformGlyph platform={platform} size={12} /> {count}
          </span>
        ))}
        {client.notes.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg/50 px-2 py-0.5 text-xs text-text-secondary">
            <StickyNote size={12} /> {client.notes.length}
          </span>
        )}
      </div>

      {perClient && (
        <div className="flex items-end justify-between gap-2 border-t border-border/60 pt-3 text-xs">
          <div>
            <p className="text-text-secondary">Mensalidade</p>
            <p className="font-medium text-text-primary">
              {client.monthlyFee ? formatCurrency(client.monthlyFee) : '—'}
              {client.monthlyFee && client.paymentDueDay ? <span className="text-text-secondary"> · dia {client.paymentDueDay}</span> : null}
            </p>
          </div>
          {finance.overdueReceivable > 0 ? (
            <span className="rounded-md bg-danger/10 px-2 py-1 font-medium text-danger">{formatCurrency(finance.overdueReceivable)} em atraso</span>
          ) : finance.toReceive > 0 ? (
            <span className="rounded-md bg-primary/10 px-2 py-1 font-medium text-primary-light">{formatCurrency(finance.toReceive)} a receber</span>
          ) : null}
        </div>
      )}
    </button>
  );
}

function ClientDrawer({ client, today, onClose, onEdit, onDelete }) {
  const perClient = isPerClientAgency(client.agency);
  const tabs = [
    { id: 'accounts', label: 'Contas', icon: Link2 },
    { id: 'notes', label: 'Anotações', icon: StickyNote },
    ...(perClient ? [{ id: 'finance', label: 'Financeiro', icon: Wallet }] : []),
  ];
  const [tab, setTab] = useState(perClient ? 'finance' : 'notes');
  const activeTab = tabs.some((item) => item.id === tab) ? tab : 'notes';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative flex h-full w-full max-w-[560px] flex-col border-l border-border bg-surface" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-text-primary">{client.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                <span className="inline-flex items-center gap-1"><Building2 size={12} /> {client.agency || 'Sem agência'}</span>
                <BillingChip agency={client.agency} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconButton title="Editar cliente" onClick={onEdit}><Pencil size={16} /></IconButton>
              <IconButton title="Excluir cliente" onClick={onDelete} danger><Trash2 size={16} /></IconButton>
              <IconButton title="Fechar" onClick={onClose}><X size={18} /></IconButton>
            </div>
          </div>

          <div className="mt-4 flex gap-1 rounded-xl border border-border bg-bg/50 p-1">
            {/* eslint-disable-next-line no-unused-vars -- Icon é usado no JSX */}
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm ${activeTab === id ? 'bg-primary/15 text-primary-light' : 'text-text-secondary hover:text-text-primary'}`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'accounts' && <AccountsTab client={client} onEdit={onEdit} />}
          {activeTab === 'notes' && <NotesTab client={client} />}
          {activeTab === 'finance' && (
            <FinancePanel
              owner={{ kind: 'client', id: client.id }}
              transactions={client.transactions}
              today={today}
              recurring={client.monthlyFee > 0 ? { buttonLabel: 'Lançar mensalidade do mês', amount: client.monthlyFee } : null}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function IconButton({ children, title, onClick, danger }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-white/[0.04] ${danger ? 'hover:text-danger' : 'hover:text-text-primary'}`}
    >
      {children}
    </button>
  );
}

function AccountsTab({ client, onEdit }) {
  return (
    <div className="space-y-5">
      {Object.entries(LINK_PLATFORMS).map(([platform, label]) => {
        const links = client.links.filter((link) => link.platform === platform);
        return (
          <section key={platform}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
              <PlatformGlyph platform={platform} size={13} /> {label}
            </h3>
            {links.length === 0 ? (
              <p className="text-sm text-text-secondary">Nenhuma conta vinculada.</p>
            ) : (
              <ul className="space-y-1.5">
                {links.map((link) => (
                  <li key={link.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-bg/40 px-3 py-2 text-sm">
                    <span className="truncate text-text-primary">{link.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-text-secondary">{link.id}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-sm font-medium text-primary-light hover:bg-primary/25 transition-colors">
          <Link2 size={15} /> Gerenciar vínculos
        </button>
        <span className="text-xs text-text-secondary">Também dá para escolher o cliente de cada conta em Configurações.</span>
      </div>
    </div>
  );
}

function NotesTab({ client }) {
  const { addNote, updateNote, deleteNote } = useClients();
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const notes = sortNotes(client.notes);

  const submit = () => {
    if (!draft.trim()) return;
    addNote(client.id, draft);
    setDraft('');
  };

  const saveEdit = () => {
    if (editingText.trim()) updateNote(client.id, editingId, { text: editingText.trim() });
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          rows={3}
          placeholder="Nova anotação sobre o cliente..."
          className={`${INPUT} resize-none`}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-text-secondary">Ctrl/⌘ + Enter para salvar</span>
          <button type="button" onClick={submit} disabled={!draft.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-primary-light px-3 py-1.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-40">
            <Plus size={14} /> Adicionar
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">Nenhuma anotação ainda.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className={`rounded-lg border p-3 ${note.pinned ? 'border-primary/30 bg-primary/[0.04]' : 'border-border/60 bg-bg/40'}`}>
              {editingId === note.id ? (
                <div className="space-y-2">
                  <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} rows={3} className={`${INPUT} resize-none`} autoFocus />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-lg px-3 py-1 text-xs text-text-secondary hover:text-text-primary">Cancelar</button>
                    <button type="button" onClick={saveEdit} className="rounded-lg bg-primary/20 px-3 py-1 text-xs font-medium text-primary-light hover:bg-primary/30">Salvar</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm text-text-primary">{note.text}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-text-secondary">{formatDateTime(note.createdAt)}</span>
                    <div className="flex items-center gap-0.5">
                      <IconButton title={note.pinned ? 'Desafixar' : 'Fixar no topo'} onClick={() => updateNote(client.id, note.id, { pinned: !note.pinned })}>
                        {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                      </IconButton>
                      <IconButton title="Editar" onClick={() => { setEditingId(note.id); setEditingText(note.text); }}><Pencil size={14} /></IconButton>
                      <IconButton title="Excluir" danger onClick={() => { if (window.confirm('Excluir esta anotação?')) deleteNote(client.id, note.id); }}>
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Lançamentos de um cliente (mensalidades) ou de uma agência (salário fixo). */
function FinancePanel({ owner, transactions, today, recurring }) {
  const { saveTransaction, deleteTransaction, generateRecurring } = useClients();
  const [editing, setEditing] = useState(null); // null = fechado, {type} = novo, lançamento = edição
  const [filter, setFilter] = useState('all');
  const finance = summarizeTransactions(transactions, today);
  const visible = sortTransactions(transactions).filter((trx) => filter === 'all' || trx.type === filter);

  const handleGenerate = () => {
    if (!generateRecurring(owner)) alert('O lançamento deste mês já foi feito.');
  };

  const togglePaid = (trx) => {
    saveTransaction(owner, trx.status === 'paid'
      ? { ...trx, status: 'pending', paidAt: null }
      : { ...trx, status: 'paid', paidAt: today });
  };

  const handleSave = (data) => {
    try {
      saveTransaction(owner, data);
      setEditing(null);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MiniStat label="A receber" value={finance.toReceive} extra={finance.overdueReceivable ? `${formatCurrency(finance.overdueReceivable)} em atraso` : null} tone="text-primary-light" />
        <MiniStat label="Recebido no mês" value={finance.receivedThisMonth} tone="text-success" />
        <MiniStat label="A pagar" value={finance.toPay} extra={finance.overduePayable ? `${formatCurrency(finance.overduePayable)} em atraso` : null} tone="text-warning" />
        <MiniStat label="Pago no mês" value={finance.paidThisMonth} tone="text-text-primary" />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditing({ type: 'receivable' })} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-sm font-medium text-primary-light hover:bg-primary/25">
          <ArrowDownCircle size={15} /> Recebimento
        </button>
        <button type="button" onClick={() => setEditing({ type: 'payable' })} className="inline-flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning/20">
          <ArrowUpCircle size={15} /> Pagamento
        </button>
        {recurring && (
          <button type="button" onClick={handleGenerate} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-white/[0.04]">
            <CalendarPlus size={15} /> {recurring.buttonLabel}
          </button>
        )}
      </div>

      <div className="flex gap-1 text-xs">
        {[['all', 'Todos'], ['receivable', 'Recebimentos'], ['payable', 'Pagamentos']].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1 ${filter === value ? 'border-primary/40 bg-primary/10 text-primary-light' : 'border-border text-text-secondary hover:text-text-primary'}`}>
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">Nenhum lançamento registrado.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((trx) => {
            const state = TRX_STATE[getTransactionState(trx, today)];
            const isReceivable = trx.type === 'receivable';
            return (
              <li key={trx.id} className="rounded-lg border border-border/60 bg-bg/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    {isReceivable
                      ? <ArrowDownCircle size={16} className="mt-0.5 shrink-0 text-primary-light" />
                      : <ArrowUpCircle size={16} className="mt-0.5 shrink-0 text-warning" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text-primary">{trx.description}</p>
                      <p className="text-[11px] text-text-secondary">
                        {TRANSACTION_TYPES[trx.type]} · vence {dateLabel(trx.dueDate)}
                        {trx.status === 'paid' && trx.paidAt ? ` · pago em ${dateLabel(trx.paidAt)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-semibold ${isReceivable ? 'text-primary-light' : 'text-warning'}`}>
                      {isReceivable ? '+' : '−'} {formatCurrency(trx.amount)}
                    </p>
                    <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${state.className}`}>{state.label}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-end gap-0.5 border-t border-border/40 pt-2">
                  <button type="button" onClick={() => togglePaid(trx)} className="mr-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-secondary hover:bg-white/[0.04] hover:text-text-primary">
                    {trx.status === 'paid'
                      ? <><RotateCcw size={13} /> Marcar como pendente</>
                      : <><CheckCircle2 size={13} /> {isReceivable ? 'Marcar como recebido' : 'Marcar como pago'}</>}
                  </button>
                  <IconButton title="Editar" onClick={() => setEditing(trx)}><Pencil size={14} /></IconButton>
                  <IconButton title="Excluir" danger onClick={() => { if (window.confirm('Excluir este lançamento?')) deleteTransaction(owner, trx.id); }}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <TransactionModal transaction={editing} defaultAmount={recurring?.amount} today={today} onSave={handleSave} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function MiniStat({ label, value, extra, tone }) {
  return (
    <div className="rounded-lg border border-border/60 bg-bg/40 p-3">
      <p className="text-[11px] uppercase tracking-wider text-text-secondary">{label}</p>
      <p className={`mt-1 text-base font-bold ${tone}`}>{formatCurrency(value)}</p>
      {extra && <p className="text-[11px] text-danger">{extra}</p>}
    </div>
  );
}

function ModalShell({ title, onClose, children, footer, maxWidth = 'max-w-[560px]' }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className={`relative mx-3 flex max-h-[90vh] w-[calc(100vw-1.5rem)] ${maxWidth} flex-col rounded-xl border border-border bg-surface`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-6">
          <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          <IconButton title="Fechar" onClick={onClose}><X size={20} /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        <div className="flex gap-3 border-t border-border px-4 py-4 sm:px-6">{footer}</div>
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-text-secondary">{label}</label>
      {children}
    </div>
  );
}

function ModalActions({ onClose, onSave }) {
  return (
    <>
      <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-border bg-bg px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors">Cancelar</button>
      <button type="button" onClick={onSave} className="flex-1 rounded-lg bg-gradient-to-r from-primary to-primary-light px-4 py-2 text-sm font-medium text-black hover:opacity-90 transition-opacity">Salvar</button>
    </>
  );
}

function ClientModal({ client, clients, agencies, onSave, onClose }) {
  const [form, setForm] = useState({
    id: client.id,
    name: client.name || '',
    agency: client.agency || '',
    monthlyFee: client.monthlyFee || '',
    paymentDueDay: client.paymentDueDay || '',
    links: client.links || [],
  });
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const perClient = isPerClientAgency(form.agency);
  // Agência atual do cliente pode ter sido removida; continua como opção para não sumir do select.
  const agencyOptions = form.agency && !agencies.includes(form.agency) ? [...agencies, form.agency] : agencies;

  return (
    <ModalShell
      title={client.id ? 'Editar cliente' : 'Novo cliente'}
      onClose={onClose}
      maxWidth="max-w-[640px]"
      footer={<ModalActions onClose={onClose} onSave={() => onSave(form)} />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Nome do cliente *">
            <input value={form.name} onChange={(e) => update('name', e.target.value)} className={INPUT} autoFocus />
          </FormField>
          <FormField label="Agência">
            <select value={form.agency} onChange={(e) => update('agency', e.target.value)} className={INPUT}>
              <option value="">Sem agência</option>
              {agencyOptions.map((agency) => <option key={agency} value={agency}>{agency}</option>)}
            </select>
          </FormField>
        </div>

        {perClient ? (
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Mensalidade (R$)">
              <input type="number" min="0" step="0.01" value={form.monthlyFee} onChange={(e) => update('monthlyFee', e.target.value)} className={INPUT} />
            </FormField>
            <FormField label="Dia de vencimento">
              <input type="number" min="1" max="31" value={form.paymentDueDay} onChange={(e) => update('paymentDueDay', e.target.value)} className={INPUT} />
            </FormField>
          </div>
        ) : form.agency ? (
          <p className="rounded-lg border border-border bg-bg/40 px-3 py-2 text-xs text-text-secondary">
            {form.agency} paga salário fixo — o recebimento é controlado na aba da agência, não por cliente.
          </p>
        ) : null}

        <LinkPicker
          links={form.links}
          agency={form.agency}
          onChange={(links) => update('links', links)}
          owners={buildLinkOwnerMap(clients, client.id)}
        />
      </div>
    </ModalShell>
  );
}

function LinkPicker({ links, agency, onChange, owners }) {
  const { accountAgencies } = useAgency();
  const [platform, setPlatform] = useState('meta');
  const [search, setSearch] = useState('');
  const available = useLinkableAccounts(platform === 'instagram');
  const selectedKeys = new Set(links.map(linkKey));

  // Contas da mesma agência do cliente primeiro. Vínculos salvos que sumiram da API
  // continuam visíveis para poder removê-los.
  const options = useMemo(() => {
    const list = [...available[platform]];
    const ids = new Set(list.map((item) => item.id));
    links.filter((link) => link.platform === platform && !ids.has(link.id)).forEach((link) => list.push(link));
    const term = search.trim().toLowerCase();
    const sameAgency = (item) => (agency && accountAgencies[agencyAccountKey(item)] === agency ? 0 : 1);
    return list
      .filter((item) => !term || item.name.toLowerCase().includes(term) || item.id.includes(term))
      .sort((a, b) => sameAgency(a) - sameAgency(b) || a.name.localeCompare(b.name, 'pt-BR'));
  }, [available, platform, links, search, agency, accountAgencies]);

  const toggle = (item) => {
    const key = linkKey(item);
    onChange(selectedKeys.has(key)
      ? links.filter((link) => linkKey(link) !== key)
      : [...links, { platform: item.platform, id: item.id, name: item.name }]);
  };

  return (
    <div className="rounded-xl border border-border bg-bg/30 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary"><Link2 size={13} /> Contas vinculadas</span>
        <span className="text-xs text-text-secondary">{links.length} selecionada{links.length === 1 ? '' : 's'}</span>
      </div>

      <div className="mb-2 flex gap-1">
        {Object.entries(LINK_PLATFORMS).map(([value, label]) => {
          const count = links.filter((link) => link.platform === value).length;
          return (
            <button key={value} type="button" onClick={() => { setPlatform(value); setSearch(''); }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium ${platform === value ? 'border-primary/40 bg-primary/10 text-text-primary' : 'border-border text-text-secondary hover:text-text-primary'}`}>
              <PlatformGlyph platform={value} size={12} />
              <span className="hidden sm:inline">{label}</span>
              {count > 0 && <span className="rounded-full bg-primary/20 px-1.5 text-[10px] text-primary-light">{count}</span>}
            </button>
          );
        })}
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conta..." className={`${INPUT} mb-2`} />

      <div className="max-h-56 space-y-1 overflow-y-auto">
        {platform === 'instagram' && available.instagramLoading && <p className="py-3 text-center text-xs text-text-secondary">Carregando perfis do Instagram...</p>}
        {platform === 'instagram' && available.instagramError && <p className="py-3 text-center text-xs text-danger">Não foi possível carregar os perfis: {available.instagramError}</p>}
        {options.length === 0 && !(platform === 'instagram' && available.instagramLoading) && (
          <p className="py-3 text-center text-xs text-text-secondary">Nenhuma conta {LINK_PLATFORMS[platform]} encontrada.</p>
        )}
        {options.map((item) => {
          const key = linkKey(item);
          const checked = selectedKeys.has(key);
          const owner = owners[key];
          const accountAgency = accountAgencies[agencyAccountKey(item)];
          return (
            <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors ${checked ? 'bg-primary/10' : 'hover:bg-white/[0.03]'}`}>
              <input type="checkbox" checked={checked} onChange={() => toggle(item)} className="accent-[#0FA5AE]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-text-primary">{item.name}</span>
                <span className="block truncate text-[10px] text-text-secondary">
                  <span className="font-mono">{item.id}</span>{accountAgency ? ` · ${accountAgency}` : ''}
                </span>
              </span>
              {owner && (
                <span className="shrink-0 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning"
                  title={checked ? 'Ao salvar, a conta sai deste outro cliente' : 'Conta vinculada a outro cliente'}>
                  {checked ? `sai de ${owner.name}` : owner.name}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function TransactionModal({ transaction, defaultAmount, today, onSave, onClose }) {
  const isNew = !transaction.id;
  const [form, setForm] = useState({
    id: transaction.id,
    createdAt: transaction.createdAt,
    type: transaction.type || 'receivable',
    description: transaction.description || '',
    amount: transaction.amount ?? (transaction.type === 'receivable' && defaultAmount ? defaultAmount : ''),
    dueDate: transaction.dueDate || today,
    status: transaction.status || 'pending',
    paidAt: transaction.paidAt || today,
  });
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <ModalShell
      title={isNew ? `Novo ${TRANSACTION_TYPES[form.type].toLowerCase()}` : 'Editar lançamento'}
      onClose={onClose}
      footer={<ModalActions onClose={onClose} onSave={() => onSave(form)} />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(TRANSACTION_TYPES).map(([value, label]) => (
            <button key={value} type="button" onClick={() => update('type', value)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${form.type === value
                ? (value === 'receivable' ? 'border-primary/40 bg-primary/10 text-primary-light' : 'border-warning/40 bg-warning/10 text-warning')
                : 'border-border text-text-secondary'}`}>
              {label}
            </button>
          ))}
        </div>
        <FormField label="Descrição *">
          <input value={form.description} onChange={(e) => update('description', e.target.value)}
            placeholder={form.type === 'receivable' ? 'Ex.: Mensalidade 11/2026, salário, setup...' : 'Ex.: Repasse, ferramenta, freelancer...'}
            className={INPUT} autoFocus />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Valor (R$) *">
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => update('amount', e.target.value)} className={INPUT} />
          </FormField>
          <FormField label="Vencimento">
            <input type="date" value={form.dueDate || ''} onChange={(e) => update('dueDate', e.target.value)} className={INPUT} />
          </FormField>
          <FormField label="Situação">
            <select value={form.status} onChange={(e) => update('status', e.target.value)} className={INPUT}>
              <option value="pending">Pendente</option>
              <option value="paid">{form.type === 'receivable' ? 'Recebido' : 'Pago'}</option>
            </select>
          </FormField>
          {form.status === 'paid' && (
            <FormField label={form.type === 'receivable' ? 'Data do recebimento' : 'Data do pagamento'}>
              <input type="date" value={form.paidAt || ''} onChange={(e) => update('paidAt', e.target.value)} className={INPUT} />
            </FormField>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
