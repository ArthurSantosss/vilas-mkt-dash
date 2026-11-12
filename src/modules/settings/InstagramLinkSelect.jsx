import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchInstagramAccounts } from '../../services/instagramApi';
import { filterAccountsByAgency } from '../../shared/utils/instagramMetrics';
import { ACCOUNT_INSTAGRAM_KEY, readAccountInstagram, saveAccountInstagram } from '../../shared/utils/accountInstagram';

/**
 * Escolhe o perfil do Instagram ligado a uma conta de anúncio (usado nos relatórios e na Visão Detalhada).
 * Com `agency` definida, só lista os perfis do Instagram atribuídos a essa mesma agência.
 */
export default function InstagramLinkSelect({ accountId, agency = '', accountAgencies = {}, className = '' }) {
  const [value, setValue] = useState(() => readAccountInstagram()[accountId] || '');
  const accountsQuery = useQuery({
    queryKey: ['instagram-accounts'],
    queryFn: () => fetchInstagramAccounts(),
    staleTime: 10 * 60_000,
  });
  const allProfiles = accountsQuery.data?.accounts;
  const profiles = useMemo(
    () => filterAccountsByAgency(allProfiles || [], accountAgencies, agency || 'all'),
    [allProfiles, accountAgencies, agency],
  );

  useEffect(() => {
    const sync = (event) => {
      if (event?.detail?.key && event.detail.key !== ACCOUNT_INSTAGRAM_KEY) return;
      setValue(readAccountInstagram()[accountId] || '');
    };
    window.addEventListener('local-storage-map-updated', sync);
    return () => window.removeEventListener('local-storage-map-updated', sync);
  }, [accountId]);

  // Vínculo salvo que ficou fora do filtro (outra agência) ou sem acesso continua visível para poder ser trocado.
  const linkedProfile = (allProfiles || []).find(profile => profile.id === value);
  const linkedOutside = value && accountsQuery.isSuccess && !profiles.some(profile => profile.id === value);
  const profileLabel = profile => (profile.username ? `@${profile.username}` : profile.name || profile.id);

  return (
    <select
      value={value}
      onChange={e => { setValue(e.target.value); saveAccountInstagram(accountId, e.target.value); }}
      disabled={accountsQuery.isLoading}
      title="Perfil do Instagram desta conta"
      aria-label="Perfil do Instagram desta conta"
      className={`w-full bg-bg border border-border rounded-lg px-2 py-2 text-xs text-text-primary focus:outline-none focus:border-primary disabled:opacity-50 ${className}`}
    >
      <option value="">
        {accountsQuery.isLoading ? 'Carregando Instagram…' : agency && !profiles.length ? `Nenhum Instagram da ${agency}` : 'Sem Instagram'}
      </option>
      {linkedOutside && (
        <option value={value}>
          {linkedProfile ? `${profileLabel(linkedProfile)} (outra agência)` : `Perfil ${value} (sem acesso)`}
        </option>
      )}
      {profiles.map(profile => (
        <option key={profile.id} value={profile.id}>{profileLabel(profile)}</option>
      ))}
    </select>
  );
}
