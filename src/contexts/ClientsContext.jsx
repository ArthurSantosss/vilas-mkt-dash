import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { dispatchLocalStorageMapUpdated } from '../shared/utils/cloudBackup';
import { useAgency } from './AgencyContext';
import {
  CLIENTS_STORAGE_KEY,
  AGENCY_BILLING_STORAGE_KEY,
  createId,
  normalizeClient,
  normalizeAgencyBilling,
  normalizeTransaction,
  validateClient,
  buildMonthlyFeeTransaction,
  buildSalaryTransaction,
  releaseLinksFromOthers,
  assignLinkToClient,
  agencyAccountKey,
} from '../shared/utils/clients';

// Clientes e o financeiro das agências ficam no localStorage e entram no backup
// da nuvem (app_preferences), como as demais configurações do painel.
//
// Lançamentos financeiros pertencem a um "dono":
//   { kind: 'client', id: <id do cliente> } — mensalidades (Vilas MKT)
//   { kind: 'agency', id: <nome da agência> } — salário fixo das demais agências

const ClientsContext = createContext();

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function readStoredClients() {
  const list = readJson(CLIENTS_STORAGE_KEY, []);
  return Array.isArray(list) ? list.map((client) => normalizeClient(client)) : [];
}

function readStoredBilling() {
  const map = readJson(AGENCY_BILLING_STORAGE_KEY, {});
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  return Object.fromEntries(Object.entries(map).map(([agency, billing]) => [agency, normalizeAgencyBilling(billing)]));
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    dispatchLocalStorageMapUpdated(key, value);
  } catch {
    /* modo privado: mantém só em memória */
  }
}

export function ClientsProvider({ children }) {
  const { setAccountAgency } = useAgency();
  const [clients, setClients] = useState(readStoredClients);
  const [agencyBilling, setAgencyBilling] = useState(readStoredBilling);

  // Backup da nuvem aplicado depois da montagem → recarrega do localStorage.
  useEffect(() => {
    const handleCloud = (event) => {
      if (!event?.detail?.fromCloud) return;
      setClients(readStoredClients());
      setAgencyBilling(readStoredBilling());
    };
    window.addEventListener('local-storage-map-updated', handleCloud);
    return () => window.removeEventListener('local-storage-map-updated', handleCloud);
  }, []);

  const commitClients = useCallback((updater) => {
    setClients((prev) => {
      const next = updater(prev);
      persist(CLIENTS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const commitBilling = useCallback((updater) => {
    setAgencyBilling((prev) => {
      const next = updater(prev);
      persist(AGENCY_BILLING_STORAGE_KEY, next);
      return next;
    });
  }, []);

  // A conta vinculada passa a pertencer também à agência do cliente.
  const syncAccountAgencies = useCallback((links, agency) => {
    if (!agency) return;
    links.forEach((link) => setAccountAgency(agencyAccountKey(link), agency));
  }, [setAccountAgency]);

  const updateClientWith = useCallback((clientId, updater) => {
    commitClients((prev) => prev.map((client) => (
      client.id === clientId ? { ...updater(client), updatedAt: new Date().toISOString() } : client
    )));
  }, [commitClients]);

  const updateBillingWith = useCallback((agency, updater) => {
    commitBilling((prev) => ({ ...prev, [agency]: updater(prev[agency] || normalizeAgencyBilling()) }));
  }, [commitBilling]);

  /** Aplica `updater` à lista de lançamentos do dono (cliente ou agência). */
  const updateTransactionsOf = useCallback((owner, updater) => {
    if (owner.kind === 'agency') {
      updateBillingWith(owner.id, (billing) => ({ ...billing, transactions: updater(billing.transactions) }));
    } else {
      updateClientWith(owner.id, (client) => ({ ...client, transactions: updater(client.transactions) }));
    }
  }, [updateBillingWith, updateClientWith]);

  const saveClient = useCallback((data) => {
    const now = new Date().toISOString();
    const existing = data.id ? clients.find((client) => client.id === data.id) : null;
    const client = normalizeClient({ ...existing, ...data, updatedAt: now }, now);
    const error = validateClient(client);
    if (error) throw new Error(error);

    commitClients((prev) => {
      const list = existing
        ? prev.map((item) => (item.id === client.id ? client : item))
        : [client, ...prev];
      return releaseLinksFromOthers(list, client.id, client.links, now);
    });
    syncAccountAgencies(client.links, client.agency);
    return client;
  }, [clients, commitClients, syncAccountAgencies]);

  const deleteClient = useCallback((clientId) => {
    commitClients((prev) => prev.filter((client) => client.id !== clientId));
  }, [commitClients]);

  /** Usado nas Configurações: define o cliente de uma conta (clientId vazio remove o vínculo). */
  const assignAccount = useCallback((link, clientId) => {
    commitClients((prev) => assignLinkToClient(prev, link, clientId));
    const client = clients.find((item) => item.id === clientId);
    if (client) syncAccountAgencies([link], client.agency);
  }, [clients, commitClients, syncAccountAgencies]);

  const addNote = useCallback((clientId, text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    const note = { id: createId('note'), text: trimmed, pinned: false, createdAt: new Date().toISOString() };
    updateClientWith(clientId, (client) => ({ ...client, notes: [note, ...client.notes] }));
  }, [updateClientWith]);

  const updateNote = useCallback((clientId, noteId, changes) => {
    updateClientWith(clientId, (client) => ({
      ...client,
      notes: client.notes.map((note) => (note.id === noteId ? { ...note, ...changes } : note)),
    }));
  }, [updateClientWith]);

  const deleteNote = useCallback((clientId, noteId) => {
    updateClientWith(clientId, (client) => ({ ...client, notes: client.notes.filter((note) => note.id !== noteId) }));
  }, [updateClientWith]);

  const saveTransaction = useCallback((owner, data) => {
    const transaction = normalizeTransaction(data);
    if (!transaction.description) throw new Error('Informe a descrição do lançamento.');
    if (transaction.amount <= 0) throw new Error('Informe um valor maior que zero.');
    updateTransactionsOf(owner, (list) => (list.some((trx) => trx.id === transaction.id)
      ? list.map((trx) => (trx.id === transaction.id ? transaction : trx))
      : [transaction, ...list]));
  }, [updateTransactionsOf]);

  const deleteTransaction = useCallback((owner, transactionId) => {
    updateTransactionsOf(owner, (list) => list.filter((trx) => trx.id !== transactionId));
  }, [updateTransactionsOf]);

  /** Lança a mensalidade (cliente) ou o salário (agência) do mês; false quando já existe ou não há valor. */
  const generateRecurring = useCallback((owner) => {
    const transaction = owner.kind === 'agency'
      ? buildSalaryTransaction(agencyBilling[owner.id] || normalizeAgencyBilling())
      : (() => {
        const client = clients.find((item) => item.id === owner.id);
        return client ? buildMonthlyFeeTransaction(client) : null;
      })();
    if (!transaction) return false;
    updateTransactionsOf(owner, (list) => [transaction, ...list]);
    return true;
  }, [agencyBilling, clients, updateTransactionsOf]);

  const saveAgencyBilling = useCallback((agency, { salary, dueDay }) => {
    updateBillingWith(agency, (billing) => normalizeAgencyBilling({ ...billing, salary, dueDay }));
  }, [updateBillingWith]);

  const value = useMemo(() => ({
    clients,
    agencyBilling,
    saveClient,
    deleteClient,
    assignAccount,
    addNote,
    updateNote,
    deleteNote,
    saveTransaction,
    deleteTransaction,
    generateRecurring,
    saveAgencyBilling,
  }), [
    clients, agencyBilling, saveClient, deleteClient, assignAccount, addNote, updateNote, deleteNote,
    saveTransaction, deleteTransaction, generateRecurring, saveAgencyBilling,
  ]);

  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useClients() {
  const ctx = useContext(ClientsContext);
  if (!ctx) throw new Error('useClients must be used within ClientsProvider');
  return ctx;
}
