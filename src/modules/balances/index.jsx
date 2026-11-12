import { useState } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { BalancesView } from '../meta-balances';
import { useGoogleBalances } from './useGoogleBalances';

const PLATFORM_KEY = 'balances_platform_v2'; // v2: padrão passou a ser "Todas"
const PLATFORMS = ['all', 'meta', 'google'];

function readStoredPlatform() {
  try {
    const stored = localStorage.getItem(PLATFORM_KEY);
    return PLATFORMS.includes(stored) ? stored : 'all';
  } catch {
    return 'all';
  }
}

/**
 * Aba única de Saldos: Meta e Google juntos ("Todas") ou só uma plataforma.
 * Os dois hooks rodam sempre (regras dos hooks); o Google só consulta a API quando aparece.
 */
export default function Balances() {
  const [platform, setPlatform] = useState(readStoredPlatform);

  const metaData = useMetaAds();
  const googleData = useGoogleBalances(platform !== 'meta');

  const handlePlatformChange = (next) => {
    setPlatform(next);
    try { localStorage.setItem(PLATFORM_KEY, next); } catch { /* modo privado: mantém só em memória */ }
  };

  const sections = [
    platform !== 'google' && { platform: 'meta', data: metaData },
    platform !== 'meta' && { platform: 'google', data: googleData },
  ].filter(Boolean);

  return <BalancesView sections={sections} platform={platform} onPlatformChange={handlePlatformChange} />;
}
