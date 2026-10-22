import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Instagram, ChevronDown, RefreshCw } from 'lucide-react';
import { useAgency } from '../../contexts/AgencyContext';
import { fetchInstagramAccounts } from '../../services/instagramApi';
import { instagramAgencyKey } from '../../shared/utils/instagramMetrics';
import { formatNumber } from '../../shared/utils/format';

/** Vincula cada perfil do Instagram a uma agência (mesmo mapa das contas de anúncio, chave `ig_<id>`). */
export default function InstagramAgencies() {
  const { agencies, accountAgencies, setAccountAgency } = useAgency();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ['instagram-accounts'],
    queryFn: () => fetchInstagramAccounts(),
    staleTime: 10 * 60_000,
  });
  const accounts = useMemo(() => accountsQuery.data?.accounts || [], [accountsQuery.data]);
  const agencyOf = (account) => accountAgencies[instagramAgencyKey(account.id)] || '';

  const sorted = useMemo(() => [...accounts].sort((a, b) => {
    const aAgency = (accountAgencies[instagramAgencyKey(a.id)] || '').toLowerCase() || '￿';
    const bAgency = (accountAgencies[instagramAgencyKey(b.id)] || '').toLowerCase() || '￿';
    const agencyCmp = aAgency.localeCompare(bAgency, 'pt-BR');
    if (agencyCmp !== 0) return agencyCmp;
    return String(a.name || a.username || '').localeCompare(String(b.name || b.username || ''), 'pt-BR');
  }), [accounts, accountAgencies]);

  const assignedCount = accounts.filter(account => agencyOf(account)).length;
  const displayed = onlyUnassigned ? sorted.filter(account => !agencyOf(account)) : sorted;

  const refresh = async () => {
    setSyncing(true);
    try {
      queryClient.setQueryData(['instagram-accounts'], await fetchInstagramAccounts({ refresh: true }));
    } catch (error) {
      console.error('[instagram] Falha ao sincronizar perfis:', error);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <div className="bg-gradient-to-r from-[#DD2A7B]/5 to-transparent px-4 py-4 sm:px-6 border-b border-border/50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          className="flex items-center gap-3 text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] flex items-center justify-center shrink-0">
            <Instagram size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary">Instagram</h2>
            <p className="text-xs text-text-secondary">
              {accountsQuery.isLoading
                ? 'Buscando perfis...'
                : open
                  ? 'Escolha a agência de cada perfil (sem agência no final)'
                  : `${accounts.length} perfil(is) — clique para expandir`}
            </p>
          </div>
          <ChevronDown size={16} className={`text-text-secondary shrink-0 transition-transform group-hover:text-text-primary ${open ? 'rotate-180' : ''}`} />
        </button>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          {open && (
            <>
              <button
                type="button"
                onClick={refresh}
                disabled={syncing || accountsQuery.isFetching}
                className="inline-flex w-full items-center justify-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-border bg-surface text-text-secondary hover:text-text-primary hover:border-primary/30 disabled:opacity-50 sm:w-auto"
              >
                <RefreshCw size={13} className={syncing || accountsQuery.isFetching ? 'animate-spin' : ''} /> Sincronizar perfis
              </button>
              <button
                type="button"
                onClick={() => setOnlyUnassigned(v => !v)}
                className={`w-full sm:w-auto text-xs px-3 py-1.5 rounded-lg border transition-all ${onlyUnassigned ? 'bg-primary/15 text-primary-light border-primary/30' : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-primary/30'}`}
              >
                {onlyUnassigned ? 'Mostrar todos' : 'Só sem agência'}
              </button>
            </>
          )}
          <div className="bg-surface border border-border rounded-lg px-4 py-2 text-sm text-center sm:text-left">
            <span className="text-text-secondary">Com agência: </span>
            <span className="font-bold text-text-primary">{assignedCount}/{accounts.length}</span>
          </div>
        </div>
      </div>

      {open && (
        <div>
          {accountsQuery.error && (
            <p className="px-6 py-4 text-sm text-danger">Erro ao listar os perfis: {accountsQuery.error.message}</p>
          )}
          {agencies.length === 0 && accounts.length > 0 && (
            <p className="px-6 py-3 text-xs text-warning border-b border-border/50">Crie as agências no quadro "Agencias" abaixo para poder vincular os perfis.</p>
          )}
          {accountsQuery.isSuccess && !accounts.length && (
            <p className="px-6 py-8 text-center text-sm text-text-secondary">Nenhum perfil do Instagram encontrado pelos tokens Meta.</p>
          )}
          <div className="divide-y divide-border/50">
            {displayed.map(account => (
              <div key={account.id} className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-surface-hover/50 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  {account.picture ? (
                    <img src={account.picture} alt="" className="w-8 h-8 rounded-full object-cover border border-border shrink-0" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#DD2A7B]/10 flex items-center justify-center shrink-0">
                      <Instagram size={15} className="text-[#DD2A7B]" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{account.name || account.username || account.id}</p>
                    <p className="text-xs text-text-secondary truncate">
                      {account.username ? `@${account.username}` : account.id}
                      {typeof account.followers === 'number' && ` • ${formatNumber(account.followers)} seguidores`}
                    </p>
                  </div>
                </div>
                {agencies.length > 0 && (
                  <select
                    value={agencyOf(account)}
                    onChange={e => setAccountAgency(instagramAgencyKey(account.id), e.target.value)}
                    aria-label={`Agência de ${account.name || account.username}`}
                    className="w-full bg-bg border border-border rounded-lg px-2 py-2 text-xs text-text-primary focus:outline-none focus:border-primary sm:w-[180px]"
                  >
                    <option value="">Sem agencia</option>
                    {agencies.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
