// Marcas das plataformas em um só lugar.
//
// `mono` pinta a marca com currentColor, para quando ela vai dentro de um
// contêiner da identidade do painel (quadro gradiente teal, item da sidebar).
// Sem `mono`, sai nas cores oficiais da marca.

import { useId } from 'react';

// Laço da Meta desenhado como uma curva contínua e simétrica. O traçado anterior
// (vindo de public/meta-ads-logo.svg) refazia trechos sobre si mesmo, o que suja
// as junções e fica pastoso abaixo de ~24px.
const META_MARK =
  'M50 32C44 18 34 9 24 9C12 9 4 19.5 4 32C4 44.5 12 55 24 55C34 55 44 46 50 32'
  + 'C56 18 66 9 76 9C88 9 96 19.5 96 32C96 44.5 88 55 76 55C66 55 56 46 50 32Z';

export function MetaIcon({ className = '', size, mono = false, title = 'Meta' }) {
  const dimension = size ? { width: size, height: size } : undefined;
  // id único por instância: a marca aparece várias vezes na mesma página.
  const gradientId = useId();

  return (
    <svg
      viewBox="0 0 100 64"
      className={className}
      style={dimension}
      role="img"
      aria-label={title}
      fill="none"
    >
      {!mono && (
        <defs>
          <linearGradient id={gradientId} x1="6" y1="10" x2="94" y2="54" gradientUnits="userSpaceOnUse">
            <stop stopColor="#168CFF" />
            <stop offset="1" stopColor="#0668E1" />
          </linearGradient>
        </defs>
      )}
      <path
        d={META_MARK}
        stroke={mono ? 'currentColor' : `url(#${gradientId})`}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GoogleAdsIcon({ className = '', size, mono = false, title = 'Google Ads' }) {
  const dimension = size ? { width: size, height: size } : undefined;

  return (
    <svg
      viewBox="11 9 42 46"
      className={className}
      style={dimension}
      role="img"
      aria-label={title}
    >
      <path
        fill={mono ? 'currentColor' : '#4285F4'}
        d="M19.8 12.6c4.2 0 7.7 2.8 8.9 6.6l15.3 27.6c1.8 3.2.6 7.3-2.6 9.1-3.2 1.8-7.3.6-9.1-2.6L17 25.8c-1.8-3.2-.6-7.3 2.6-9.1z"
      />
      <path
        fill={mono ? 'currentColor' : '#34A853'}
        d="M44.7 53.9c-3.7 0-6.8-3-6.8-6.8s3-6.8 6.8-6.8 6.8 3 6.8 6.8-3.1 6.8-6.8 6.8z"
      />
      <path
        fill={mono ? 'currentColor' : '#FBBC04'}
        d="M21.3 10.1c5.1 0 9.3 4.1 9.3 9.3s-4.1 9.3-9.3 9.3S12 24.6 12 19.4s4.2-9.3 9.3-9.3z"
      />
    </svg>
  );
}
