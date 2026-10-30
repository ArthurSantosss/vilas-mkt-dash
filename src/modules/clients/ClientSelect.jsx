import { useMemo } from 'react';
import { useClients } from '../../contexts/ClientsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { groupClientsByAgency, linkKey } from '../../shared/utils/clients';

/**
 * Seletor "Cliente" de cada conta em Configurações. Grava no mesmo cadastro da
 * aba Clientes: escolher aqui vincula a conta ao cliente (e tira de outro, se houver).
 */
export default function ClientSelect({ platform, id, name, className = '' }) {
  const { clients, assignAccount } = useClients();
  const { agencies } = useAgency();
  const groups = useMemo(() => groupClientsByAgency(clients, agencies).filter((g) => g.clients.length), [clients, agencies]);
  const key = linkKey({ platform, id: String(id) });
  const ownerId = clients.find((client) => client.links.some((link) => linkKey(link) === key))?.id || '';

  if (clients.length === 0) return null;

  return (
    <select
      value={ownerId}
      onChange={(e) => assignAccount({ platform, id: String(id), name: name || String(id) }, e.target.value)}
      aria-label={`Cliente de ${name || id}`}
      title="Cliente desta conta (aba Clientes)"
      className={`w-full bg-bg border rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-primary ${ownerId ? 'border-primary/30 text-text-primary' : 'border-border text-text-secondary'} ${className}`}
    >
      <option value="">Sem cliente</option>
      {groups.map((group) => (
        <optgroup key={group.agency || '__none__'} label={group.agency || 'Sem agência'}>
          {group.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
