import { useEffect, useState } from 'react';

function readMap(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Mapa salvo no localStorage, atualizado quando outra tela (ou a nuvem) grava a mesma chave. */
export function useStoredMap(key) {
  const [map, setMap] = useState(() => readMap(key));
  useEffect(() => {
    const onUpdate = (event) => {
      if (event?.detail?.key && event.detail.key !== key) return;
      setMap(event?.detail?.key === key && event.detail.value ? event.detail.value : readMap(key));
    };
    const onStorage = (event) => { if (!event.key || event.key === key) setMap(readMap(key)); };
    window.addEventListener('local-storage-map-updated', onUpdate);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('local-storage-map-updated', onUpdate);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);
  return map;
}
