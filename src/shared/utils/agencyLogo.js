export const AGENCY_LOGOS_KEY = 'agency_logos';

// Logos que já vinham no projeto. Agências fora desta lista dependem da URL
// cadastrada em Configurações — antes elas caíam no logo da Vilas por engano.
const BUILT_IN_LOGOS = {
  tag: '/logotag.png',
  tagb: '/logotag.png',
  grupotag: '/logotag.png',
  vilas: '/favicon.png',
  vilasmkt: '/favicon.png',
  vilasgrowthmarketing: '/favicon.png',
};

const BUILT_IN_LABELS = {
  tag: 'Grupo Tag',
  tagb: 'Grupo Tag',
  grupotag: 'Grupo Tag',
  vilas: 'Vilas Growth Marketing',
  vilasmkt: 'Vilas Growth Marketing',
  vilasgrowthmarketing: 'Vilas Growth Marketing',
  gdm: 'GDM',
};

export function normalizeAgencyKey(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^agencia/, '');
}

export function readAgencyLogos() {
  try {
    const stored = JSON.parse(localStorage.getItem(AGENCY_LOGOS_KEY));
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}

export function saveAgencyLogo(agencyName, url) {
  const logos = readAgencyLogos();
  const trimmed = String(url || '').trim();
  if (trimmed) logos[agencyName] = trimmed;
  else delete logos[agencyName];

  localStorage.setItem(AGENCY_LOGOS_KEY, JSON.stringify(logos));
  window.dispatchEvent(new CustomEvent('local-storage-map-updated', {
    detail: { key: AGENCY_LOGOS_KEY, value: logos },
  }));
  return logos;
}

/** Logo cadastrada para a agência, comparando por nome normalizado. */
function findCustomLogo(logos, ...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (logos[candidate]) return logos[candidate];

    const key = normalizeAgencyKey(candidate);
    if (!key) continue;
    const match = Object.keys(logos).find(name => normalizeAgencyKey(name) === key);
    if (match && logos[match]) return logos[match];
  }
  return null;
}

/**
 * Fontes de logo em ordem de preferência. Sem nenhuma, o cartão mostra o nome da
 * agência em texto — melhor do que carimbar o logo de outra agência.
 */
export function getAgencyLogoSources(agencyName, agencyType, logos = readAgencyLogos()) {
  const custom = findCustomLogo(logos, agencyName, agencyType);
  const builtIn = BUILT_IN_LOGOS[normalizeAgencyKey(agencyType)]
    || BUILT_IN_LOGOS[normalizeAgencyKey(agencyName)]
    || null;

  return [custom, builtIn].filter(Boolean);
}

export function getAgencyLabel(agencyName, agencyType) {
  const known = BUILT_IN_LABELS[normalizeAgencyKey(agencyType)]
    || BUILT_IN_LABELS[normalizeAgencyKey(agencyName)];
  if (known) return known;
  return String(agencyName || agencyType || '').trim() || 'Agência';
}
