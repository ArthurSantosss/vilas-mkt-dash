// Regras puras da aba Clientes: cadastro por agência, vínculos com contas,
// anotações e lançamentos financeiros. Sem React nem storage, para poder ser
// testado em Node.
//
// Cobrança: a Vilas MKT recebe por cliente (mensalidade de cada um); as demais
// agências pagam um salário fixo, controlado no financeiro da própria agência.

export const CLIENTS_STORAGE_KEY = 'agency_clients';
export const AGENCY_BILLING_STORAGE_KEY = 'agency_billing';

export const LINK_PLATFORMS = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  instagram: 'Instagram',
};

export const TRANSACTION_TYPES = {
  receivable: 'Recebimento',
  payable: 'Pagamento',
};

export function createId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

function toAmount(value) {
  const num = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
}

function toDueDay(value) {
  const day = parseInt(value, 10);
  if (!Number.isFinite(day)) return null;
  return Math.min(31, Math.max(1, day));
}

function normalizeName(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** A Vilas MKT cobra por cliente; as outras agências pagam salário fixo. */
export function isPerClientAgency(agencyName) {
  return normalizeName(agencyName).includes('vilas');
}

export const linkKey = (link) => `${link.platform}:${link.id}`;

/** Chave usada no mapa de agências por conta (`account_agencies`). */
export function agencyAccountKey(link) {
  return link.platform === 'instagram' ? `ig_${link.id}` : String(link.id);
}

export function normalizeLink(link) {
  if (!link || !LINK_PLATFORMS[link.platform] || !link.id) return null;
  return { platform: link.platform, id: String(link.id), name: link.name ? String(link.name) : String(link.id) };
}

export function normalizeTransaction(raw = {}) {
  return {
    id: raw.id || createId('trx'),
    type: raw.type === 'payable' ? 'payable' : 'receivable',
    description: String(raw.description || '').trim(),
    amount: toAmount(raw.amount),
    dueDate: raw.dueDate || null,
    status: raw.status === 'paid' ? 'paid' : 'pending',
    paidAt: raw.status === 'paid' ? (raw.paidAt || raw.dueDate || null) : null,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

export function normalizeClient(raw = {}, now = new Date().toISOString()) {
  const seenLinks = new Set();
  const links = (Array.isArray(raw.links) ? raw.links : [])
    .map(normalizeLink)
    .filter((link) => {
      if (!link || seenLinks.has(linkKey(link))) return false;
      seenLinks.add(linkKey(link));
      return true;
    });

  return {
    id: raw.id || createId('cli'),
    name: String(raw.name || '').trim(),
    agency: String(raw.agency || '').trim(),
    monthlyFee: toAmount(raw.monthlyFee),
    paymentDueDay: toDueDay(raw.paymentDueDay),
    links,
    notes: Array.isArray(raw.notes) ? raw.notes.filter((n) => n && n.text) : [],
    transactions: Array.isArray(raw.transactions) ? raw.transactions.map(normalizeTransaction) : [],
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
  };
}

export function normalizeAgencyBilling(raw = {}) {
  return {
    salary: toAmount(raw.salary),
    dueDay: toDueDay(raw.dueDay),
    transactions: Array.isArray(raw.transactions) ? raw.transactions.map(normalizeTransaction) : [],
  };
}

export function validateClient(client) {
  if (!client.name) return 'Informe o nome do cliente.';
  return null;
}

// Data local no formato YYYY-MM-DD (evita o deslocamento de fuso do toISOString).
export function toLocalISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isOverdue(transaction, today = toLocalISODate()) {
  return transaction.status === 'pending' && Boolean(transaction.dueDate) && transaction.dueDate < today;
}

export function getTransactionState(transaction, today = toLocalISODate()) {
  if (transaction.status === 'paid') return 'paid';
  return isOverdue(transaction, today) ? 'overdue' : 'pending';
}

function monthKey(isoDate) {
  return isoDate ? isoDate.slice(0, 7) : null;
}

/**
 * Totais financeiros de uma lista de lançamentos.
 * "No mês" considera a data de pagamento (paidAt) do mês de referência.
 */
export function summarizeTransactions(transactions = [], today = toLocalISODate()) {
  const currentMonth = monthKey(today);
  const summary = {
    toReceive: 0,
    overdueReceivable: 0,
    receivedThisMonth: 0,
    toPay: 0,
    overduePayable: 0,
    paidThisMonth: 0,
    overdueCount: 0,
  };

  for (const trx of transactions) {
    const overdue = isOverdue(trx, today);
    if (overdue) summary.overdueCount += 1;

    if (trx.type === 'receivable') {
      if (trx.status === 'pending') {
        summary.toReceive += trx.amount;
        if (overdue) summary.overdueReceivable += trx.amount;
      } else if (monthKey(trx.paidAt) === currentMonth) {
        summary.receivedThisMonth += trx.amount;
      }
    } else if (trx.status === 'pending') {
      summary.toPay += trx.amount;
      if (overdue) summary.overduePayable += trx.amount;
    } else if (monthKey(trx.paidAt) === currentMonth) {
      summary.paidThisMonth += trx.amount;
    }
  }

  for (const key of Object.keys(summary)) {
    if (key !== 'overdueCount') summary[key] = Math.round(summary[key] * 100) / 100;
  }
  return summary;
}

/** Lançamentos de uma agência: salário (agências fixas) ou mensalidades dos clientes (Vilas MKT). */
export function collectAgencyTransactions(agency, clients = [], agencyBilling = {}) {
  const fromClients = clients.filter((client) => client.agency === agency).flatMap((client) => client.transactions || []);
  return [...fromClients, ...(agencyBilling[agency]?.transactions || [])];
}

export function collectAllTransactions(clients = [], agencyBilling = {}) {
  return [
    ...clients.flatMap((client) => client.transactions || []),
    ...Object.values(agencyBilling).flatMap((billing) => billing?.transactions || []),
  ];
}

/** Data de vencimento no mês de `today`, respeitando meses curtos. */
export function getMonthlyDueDate(dueDay, today = toLocalISODate()) {
  const [year, month] = today.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(dueDay || 1, lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function recurringDescription(label, today = toLocalISODate()) {
  const [year, month] = today.split('-');
  return `${label} ${month}/${year}`;
}

/**
 * Lançamento recorrente do mês corrente (mensalidade ou salário), ou null
 * quando não há valor definido ou o lançamento do mês já existe.
 */
export function buildRecurringTransaction({ label, amount, dueDay, transactions = [] }, today = toLocalISODate()) {
  if (!amount) return null;
  const description = recurringDescription(label, today);
  const exists = transactions.some((trx) => trx.type === 'receivable' && trx.description === description);
  if (exists) return null;
  return normalizeTransaction({
    type: 'receivable',
    description,
    amount,
    dueDate: getMonthlyDueDate(dueDay, today),
  });
}

export function buildMonthlyFeeTransaction(client, today = toLocalISODate()) {
  return buildRecurringTransaction({
    label: 'Mensalidade',
    amount: client.monthlyFee,
    dueDay: client.paymentDueDay,
    transactions: client.transactions,
  }, today);
}

export function buildSalaryTransaction(billing, today = toLocalISODate()) {
  return buildRecurringTransaction({
    label: 'Salário',
    amount: billing.salary,
    dueDay: billing.dueDay,
    transactions: billing.transactions,
  }, today);
}

export function sortTransactions(transactions = []) {
  // Pendentes primeiro (vencimento mais próximo no topo), depois pagos mais recentes.
  return [...transactions].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    if (a.status === 'pending') return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
    return String(b.paidAt || '').localeCompare(String(a.paidAt || ''));
  });
}

export function sortNotes(notes = []) {
  return [...notes].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

/** Mapa "plataforma:id" → cliente dono da conta. */
export function buildLinkOwnerMap(clients = [], exceptClientId = null) {
  const map = {};
  for (const client of clients) {
    if (client.id === exceptClientId) continue;
    for (const link of client.links || []) map[linkKey(link)] = client;
  }
  return map;
}

/**
 * Cada conta pertence a no máximo um cliente: tira os vínculos de `links`
 * dos demais clientes. Não altera `updatedAt` de quem não mudou.
 */
export function releaseLinksFromOthers(clients, ownerId, links, now = new Date().toISOString()) {
  const keys = new Set(links.map(linkKey));
  if (keys.size === 0) return clients;
  return clients.map((client) => {
    if (client.id === ownerId) return client;
    const kept = client.links.filter((link) => !keys.has(linkKey(link)));
    return kept.length === client.links.length ? client : { ...client, links: kept, updatedAt: now };
  });
}

/** Define (ou remove, com clientId vazio) o cliente dono de uma conta. */
export function assignLinkToClient(clients, link, clientId, now = new Date().toISOString()) {
  const normalized = normalizeLink(link);
  if (!normalized) return clients;
  const released = clients.map((client) => {
    const kept = client.links.filter((item) => linkKey(item) !== linkKey(normalized));
    return kept.length === client.links.length ? client : { ...client, links: kept, updatedAt: now };
  });
  if (!clientId) return released;
  return released.map((client) => (
    client.id === clientId ? { ...client, links: [...client.links, normalized], updatedAt: now } : client
  ));
}

/** Clientes agrupados por agência, na ordem das agências cadastradas; sem agência no final. */
export function groupClientsByAgency(clients = [], agencies = []) {
  const known = new Set(agencies);
  const groups = agencies.map((agency) => ({ agency, clients: clients.filter((client) => client.agency === agency) }));
  const orphan = clients.filter((client) => !known.has(client.agency));
  if (orphan.length) groups.push({ agency: '', clients: orphan });
  return groups.map((group) => ({
    ...group,
    clients: [...group.clients].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  }));
}
