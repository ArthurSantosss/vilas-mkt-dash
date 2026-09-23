import { useState } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { BalancesView } from '../meta-balances';
import { useGoogleBalances } from './useGoogleBalances';

const PLATFORM_KEY = 'balances_platform';

function readStoredPlatform() {
  try {
    const stored = localStorage.getItem(PLATFORM_KEY);
    return stored === 'google' ? 'google' : 'meta';
  } catch {
    return 'meta';
  }
}

/**
 * Aba única de Saldos. Os dois hooks rodam sempre (regras dos hooks), mas o
 * inativo não consulta a API — só a plataforma selecionada busca dados.
 */
export default function Balances() {
  const [platform, setPlatform] = useState(readStoredPlatform);

  const metaData = useMetaAds();
  const googleData = useGoogleBalances(platform === 'google');

  const handlePlatformChange = (next) => {
    setPlatform(next);
    try { localStorage.setItem(PLATFORM_KEY, next); } catch { /* modo privado: mantém só em memória */ }
  };

  return (
    <BalancesView
      platform={platform}
      data={platform === 'google' ? googleData : metaData}
      onPlatformChange={handlePlatformChange}
    />
  );
}
