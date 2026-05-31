import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useAgency } from '../../contexts/AgencyContext';
import { formatCurrency } from '../../shared/utils/format';
import { Image, Download, Loader2, Sparkles, Copy, Check, Send, CheckCircle2, Target, Link2, X, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import PeriodSelector from '../../shared/components/PeriodSelector';
import ReportCard from '../../shared/components/ReportCard';
import {
  fetchAccountInsights, fetchCampaignsWithInsights,
  fetchCampaignDailyInsights, getPreviousPeriodRange
} from '../../services/metaApi';
import { PRESETS } from '../../shared/utils/dateUtils';
import { toPng } from 'html-to-image';

const SHARE_BASE_URL = (import.meta.env.VITE_PUBLIC_SHARE_BASE_URL || '').trim();
const META_LOGO_SOURCES = ['/meta-ads-logo.png', '/logometa.png'];

function matchAgencyVisual(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('tag')) return 'tag';
  if (n.includes('vilas')) return 'vilasmkt';
  return null;
}

// ── Helpers ──
function getActionValue(actions, actionType) {
  if (!actions || !Array.isArray(actions)) return 0;
  const found = actions.find(a => a.action_type === actionType);
  return found ? parseInt(found.value, 10) : 0;
}

function getActionValueMulti(actions, actionTypes) {
  if (!actions || !Array.isArray(actions)) return 0;
  for (const t of actionTypes) {
    const v = getActionValue(actions, t);
    if (v > 0) return v;
  }
  return 0;
}

function formatPeriodLabel(period) {
  if (typeof period === 'object' && period.type === 'custom') {
    const fmt = (d) => { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; };
    const fmtShort = (d) => { const p = d.split('-'); return `${p[2]}-${p[1]}`; };
    return { start: fmt(period.startDate), end: fmt(period.endDate), startShort: fmtShort(period.startDate), endShort: fmtShort(period.endDate) };
  }
  const preset = PRESETS.find(p => p.id === period);
  if (preset) {
    const range = preset.getRange();
    const fmtFull = (d) => { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; };
    const fmtShort = (d) => { const p = d.split('-'); return `${p[2]}-${p[1]}`; };
    return { start: fmtFull(range.startDate), end: fmtFull(range.endDate), startShort: fmtShort(range.startDate), endShort: fmtShort(range.endDate) };
  }
  return { start: '??/??/????', end: '??/??/????', startShort: '??-??', endShort: '??-??' };
}

function calcDiff(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous * 100).toFixed(1);
}

const LEAD_ACTION_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
];

const ENGAGEMENT_ACTION_TYPES = ['post_engagement', 'page_engagement'];

const IG_PROFILE_VISIT_ACTION_TYPES = [
  'onsite_conversion.ig_profile_visit_total',
  'ig_profile_visit',
  'omni_profile_visit',
  'profile_visit',
];

const OBJECTIVE_OPTIONS = [
  { id: 'messages', label: 'Mensagens' },
  { id: 'clicks', label: 'Cliques no link' },
  { id: 'engagements', label: 'Engajamentos' },
];

function aggregateCampaignMetrics(campaigns = []) {
  const summary = campaigns.reduce((acc, campaign) => {
    const insight = campaign.insights?.data?.[0];
    const actions = insight?.actions || [];

    acc.spend += parseFloat(insight?.spend || 0);
    acc.impressions += parseInt(insight?.impressions || 0, 10);
    acc.reach += parseInt(insight?.reach || 0, 10);
    acc.clicks += parseInt(insight?.inline_link_clicks || 0, 10);
    acc.leads += getActionValueMulti(actions, LEAD_ACTION_TYPES);
    acc.engagements += getActionValueMulti(actions, ENGAGEMENT_ACTION_TYPES);
    acc.igProfileVisits += getActionValueMulti(actions, IG_PROFILE_VISIT_ACTION_TYPES);

    return acc;
  }, {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    leads: 0,
    engagements: 0,
    igProfileVisits: 0,
  });

  return {
    ...summary,
    costPerLead: summary.leads > 0 ? summary.spend / summary.leads : 0,
    costPerEngagement: summary.engagements > 0 ? summary.spend / summary.engagements : 0,
  };
}

function buildCampaignScopeLabel(selectedCampaigns, totalCampaignCount) {
  if (!selectedCampaigns.length) {
    return `Todas as campanhas (${totalCampaignCount})`;
  }

  if (selectedCampaigns.length === 1) {
    return `Campanha filtrada: ${selectedCampaigns[0].name}`;
  }

  return `${selectedCampaigns.length} campanhas filtradas`;
}

function slugifyShareLabel(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function makePublicSlug(label, fallbackId) {
  const baseSlug = slugifyShareLabel(label);
  return baseSlug || fallbackId;
}

function getShareBaseUrl() {
  if (SHARE_BASE_URL) return SHARE_BASE_URL.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

// ── Helper: convert image URL to base64 for html-to-image compatibility ──
function resolveAssetUrl(url) {
  if (typeof window === 'undefined' || !url?.startsWith('/')) return url;
  return new URL(url, window.location.origin).toString();
}

function buildImageProxyUrl(url) {
  if (!url) return null;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

function readClientLogos() {
  try {
    return JSON.parse(localStorage.getItem('client_logos')) || {};
  } catch {
    return {};
  }
}

function getAgencyLogoSources(agencyType) {
  return agencyType === 'tag' ? ['/logotag.png'] : ['/favicon.png'];
}

async function fetchImageBlob(url) {
  if (!url) return null;
  if (url.startsWith('data:')) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return blob.type.startsWith('image/') ? blob : null;
    } catch {
      return null;
    }
  }

  const fullUrl = resolveAssetUrl(url);
  const candidates = [fullUrl];

  if (typeof window !== 'undefined') {
    try {
      const targetUrl = new URL(fullUrl, window.location.origin);
      if (targetUrl.origin !== window.location.origin) {
        candidates.push(buildImageProxyUrl(fullUrl));
      }
    } catch {
      candidates.push(buildImageProxyUrl(fullUrl));
    }
  }

  for (const candidate of candidates.filter(Boolean)) {
    try {
      const res = await fetch(candidate);
      if (!res.ok) continue;

      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) continue;
      return blob;
    } catch {
      // Try the next candidate source.
    }
  }

  console.warn('[fetchImageBlob] não foi possível baixar a imagem:', url);
  return null;
}

async function blobToDataUrl(blob) {
  if (!blob) return null;

  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(blob);
  });
}

async function toBase64(url) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;

  const blob = await fetchImageBlob(url);
  if (!blob) {
    console.warn('[toBase64] não foi possível converter a imagem:', url);
    return null;
  }

  return blobToDataUrl(blob);
}

async function loadImageElement(src, { crossOrigin } = {}) {
  if (!src || typeof window === 'undefined') return null;

  return await new Promise((resolve, reject) => {
    const img = new window.Image();
    img.decoding = 'async';
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function rasterizeImageToPngDataUrl(img) {
  const rawWidth = img.naturalWidth || img.width || 256;
  const rawHeight = img.naturalHeight || img.height || 256;
  const maxEdge = 512;
  const scale = Math.min(1, maxEdge / Math.max(rawWidth, rawHeight));
  const width = Math.max(1, Math.round(rawWidth * scale));
  const height = Math.max(1, Math.round(rawHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

async function fetchDataUrlFromServer(url) {
  if (!url || typeof window === 'undefined') return null;
  try {
    const res = await fetch(`/api/logo-base64?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      console.warn(`[client-logo] /api/logo-base64 retornou HTTP ${res.status}`);
      return null;
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      console.warn('[client-logo] /api/logo-base64 não retornou JSON (provavelmente rota não deployada)');
      return null;
    }
    const json = await res.json();
    return typeof json.dataUrl === 'string' ? json.dataUrl : null;
  } catch (err) {
    console.warn('[client-logo] erro chamando /api/logo-base64:', err?.message || err);
    return null;
  }
}

async function toRasterizedPngDataUrl(url) {
  if (!url) return null;
  if (typeof window === 'undefined') return null;

  // Se já for data URL, rasterizamos diretamente no cliente para evitar enviar mega-strings pro servidor (414 URI Too Long)
  if (url.startsWith('data:')) {
    try {
      const img = await loadImageElement(url);
      if (img) {
        const rasterized = rasterizeImageToPngDataUrl(img);
        if (rasterized) return rasterized;
      }
    } catch (e) {
      console.warn('[client-logo] falha ao rasterizar data URL original', e);
    }
    // Se a rasterização falhar, retorna a original (se for PNG/JPEG) ou arrisca
    return url;
  }

  // Estratégia 0: pedir pro servidor converter e devolver data URL pronta.
  // Funciona em produção (Vercel) e dispensa CORS no browser. Em dev sem
  // `vercel dev`, retorna null e a gente cai pras outras estratégias.
  const serverDataUrl = await fetchDataUrlFromServer(url);
  if (serverDataUrl) {
    try {
      const img = await loadImageElement(serverDataUrl);
      if (img) {
        const rasterized = rasterizeImageToPngDataUrl(img);
        if (rasterized) {
          console.info('[client-logo] convertida via /api/logo-base64 e rasterizada (formato seguro garantido)');
          return rasterized;
        }
      }
    } catch (err) {
      console.warn('[client-logo] Falha ao rasterizar imagem recebida do servidor', err);
    }
    // Fallback: retorna o dataUrl bruto (pode falhar no html-to-image se for SVG não tratado ou formato incompatível).
    console.info('[client-logo] convertida via /api/logo-base64 (sem rasterização)');
    return serverDataUrl;
  }

  const resolved = url.startsWith('data:') ? url : resolveAssetUrl(url);
  const isCrossOrigin = (() => {
    if (resolved.startsWith('data:')) return false;
    try {
      return new URL(resolved, window.location.origin).origin !== window.location.origin;
    } catch {
      return true;
    }
  })();

  // Estratégia 1: carregar a imagem direto com crossOrigin="anonymous". Funciona
  // quando o servidor (ex: Supabase Storage) já manda CORS. Bem mais rápido que
  // ir buscar blob via fetch e mexer com object URL.
  const attempts = [];
  if (resolved.startsWith('data:')) {
    attempts.push({ src: resolved });
  } else if (isCrossOrigin) {
    attempts.push({ src: resolved, crossOrigin: 'anonymous' });
    const proxied = buildImageProxyUrl(resolved);
    if (proxied) attempts.push({ src: proxied });
  } else {
    attempts.push({ src: resolved });
  }

  for (const attempt of attempts) {
    const label = attempt.crossOrigin
      ? `direct+CORS (${attempt.src.slice(0, 60)})`
      : attempt.src.startsWith('/api/image-proxy')
        ? `proxy (${attempt.src.slice(0, 60)})`
        : `direct (${attempt.src.slice(0, 60)})`;
    try {
      const img = await loadImageElement(attempt.src, { crossOrigin: attempt.crossOrigin });
      if (!img) {
        console.warn(`[client-logo] estratégia ${label} → img nula`);
        continue;
      }
      try {
        const dataUrl = rasterizeImageToPngDataUrl(img);
        if (dataUrl) {
          console.info(`[client-logo] rasterizada via ${label}`);
          return dataUrl;
        }
        console.warn(`[client-logo] estratégia ${label} → toDataURL retornou null`);
      } catch (rasterError) {
        console.warn(`[client-logo] estratégia ${label} → canvas tainted ou erro:`, rasterError?.message);
      }
    } catch (loadError) {
      console.warn(`[client-logo] estratégia ${label} → img não carregou:`, loadError?.message || loadError);
    }
  }

  // Último recurso: o caminho antigo via fetchImageBlob (proxy + blob URL).
  // Mantém compatibilidade para casos onde nem CORS direto nem img-via-proxy
  // funcionaram, mas o blob pode ser baixado e desenhado.
  const blob = await fetchImageBlob(url);
  if (!blob) return null;

  if (blob.type === 'image/png') {
    return blobToDataUrl(blob);
  }

  const isSafeRasterBlob = ['image/jpeg', 'image/jpg', 'image/webp'].includes(blob.type);
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await loadImageElement(objectUrl);
    if (!img) return isSafeRasterBlob ? blobToDataUrl(blob) : null;
    const dataUrl = rasterizeImageToPngDataUrl(img);
    return dataUrl || (isSafeRasterBlob ? blobToDataUrl(blob) : null);
  } catch {
    return isSafeRasterBlob ? blobToDataUrl(blob) : null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getSafeExportLogoSrc(_url, rasterizedDataUrl) {
  // Para o export precisamos de uma data URL inline. Se a rasterização falhou,
  // omitimos a logo do PNG — é melhor que travar o html-to-image com uma img
  // remota / via proxy que pode quebrar dentro do clone.
  return rasterizedDataUrl || null;
}

async function toBase64FromSources(sources) {
  for (const source of sources) {
    const base64 = await toBase64(source);
    if (base64) return base64;
  }
  return null;
}

async function fetchImageAsDataUrl(src) {
  if (!src) return null;
  if (src.startsWith('data:')) return src;

  try {
    const res = await fetch(resolveAssetUrl(src));
    if (!res.ok) return null;

    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;

    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function waitForImages(container) {
  if (!container) return;
  const images = Array.from(container.querySelectorAll('img'));

  await Promise.all(images.map((img) => new Promise((resolve) => {
    if (!img.currentSrc && !img.src) {
      resolve();
      return;
    }

    // complete=true cobre tanto imagem carregada quanto imagem que já falhou antes.
    if (img.complete) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve();
    };

    const timeoutId = setTimeout(finish, 4000);
    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
  })));

  await Promise.all(images.map((img) => {
    if (!img.complete || img.naturalWidth <= 0 || typeof img.decode !== 'function') {
      return Promise.resolve();
    }

    return Promise.race([
      img.decode().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }));
}

function preloadImage(src) {
  if (!src || typeof window === 'undefined') return Promise.resolve();

  return new Promise((resolve) => {
    const img = new window.Image();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve();
    };

    img.onload = done;
    img.onerror = done;
    img.decoding = 'async';
    img.src = src;

    const timeoutId = setTimeout(done, 4000);

    if (img.complete) done();
  });
}

async function prepareExportImages(container) {
  if (!container) return;

  const images = Array.from(container.querySelectorAll('img'));

  await Promise.all(images.map(async (img) => {
    const src = img.currentSrc || img.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) return;

    const dataUrl = await Promise.race([
      fetchImageAsDataUrl(src),
      new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    if (dataUrl) {
      img.src = dataUrl;
      return;
    }

    // Evita que uma imagem externa quebrada faça o html-to-image abortar o PNG inteiro.
    img.removeAttribute('src');
    img.style.visibility = 'hidden';
  }));
}

function scrubBrokenImages(container) {
  if (!container) return;
  const images = Array.from(container.querySelectorAll('img'));
  for (const img of images) {
    const src = img.currentSrc || img.getAttribute('src') || '';
    // Nunca remove data URLs: mesmo que naturalWidth ainda esteja 0 (race
    // condition logo após setar src), o html-to-image consegue inlinar bem.
    if (src.startsWith('data:')) continue;
    const broken = !src || (img.complete && img.naturalWidth === 0);
    if (broken) {
      img.removeAttribute('src');
      img.removeAttribute('srcset');
      img.style.display = 'none';
    }
  }
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

async function renderPngWithFallbacks(node) {
  // IMPORTANT: cacheBust deve ser sempre false. Quando true o html-to-image
  // anexa "?<random>" no fim de TODA src — inclusive data URLs — corrompendo
  // as logos pré-convertidas em base64 e gerando um PNG sem nenhuma imagem.
  const attempts = [
    {
      quality: 1,
      pixelRatio: 1,
      backgroundColor: '#0d1520',
      cacheBust: false,
      skipFonts: false,
    },
    {
      quality: 1,
      pixelRatio: 1,
      backgroundColor: '#0d1520',
      cacheBust: false,
      skipFonts: true,
    },
    {
      quality: 0.95,
      pixelRatio: 1,
      backgroundColor: '#0d1520',
      cacheBust: false,
      skipFonts: true,
    },
  ];

  let lastError = null;

  for (let i = 0; i < attempts.length; i++) {
    const options = attempts[i];
    try {
      const result = await withTimeout(
        toPng(node, options),
        20000,
        'A exportação do PNG demorou demais.'
      );
      if (i > 0) {
        console.info(`[report-visual] PNG exportado na tentativa ${i + 1}/${attempts.length} (skipFonts=${options.skipFonts})`);
      }
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[report-visual] tentativa ${i + 1} falhou:`, options, error);
    }
  }

  const clientLogo = node.querySelector('img[data-export-role="client-logo"]');
  if (clientLogo) {
    const previousDisplay = clientLogo.style.display;
    clientLogo.style.display = 'none';

    try {
      for (const options of attempts) {
        try {
          return await withTimeout(
            toPng(node, options),
            20000,
            'A exportação do PNG demorou demais.'
          );
        } catch (error) {
          lastError = error;
          console.warn('[report-visual] fallback sem logo do cliente falhou:', options, error);
        }
      }
    } finally {
      clientLogo.style.display = previousDisplay;
    }
  }

  throw lastError || new Error('Falha ao exportar PNG.');
}

function getExportCacheKey(reportData) {
  if (!reportData) return '';
  return JSON.stringify({
    accountName: reportData.accountName,
    scopeLabel: reportData.scopeLabel,
    start: reportData.period?.startShort,
    end: reportData.period?.endShort,
    objective: reportData.objective,
    spend: reportData.spend,
    leads: reportData.leads,
    clicks: reportData.clicks,
    engagements: reportData.engagements,
    igProfileVisits: reportData.igProfileVisits,
    agencyLogoB64: reportData.agencyLogoB64?.slice(0, 64),
    metaLogoB64: reportData.metaLogoB64?.slice(0, 64),
    clientLogoExportSrc: reportData.clientLogoExportSrc,
  });
}

export default function ReportVisual() {
  const { accounts, campaigns, selectedPeriod, setSelectedPeriod } = useMetaAds();
  const { agencies, accountAgencies } = useAgency();
  const [selectedAccount, setSelectedAccount] = useState('');

  const [clientLogos, setClientLogos] = useState(() => readClientLogos());
  const [selectedAgency, setSelectedAgency] = useState('');
  const [selectedObjective, setSelectedObjective] = useState('messages');
  const [selectedCampaignIds, setSelectedCampaignIds] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const reportRef = useRef(null);
  const previewFrameRef = useRef(null);
  const exportCacheRef = useRef({ key: '', dataUrl: null });
  const exportImagesReadyRef = useRef(Promise.resolve());
  const [previewScale, setPreviewScale] = useState(1);

  // Filter agencies to only vilasmkt and tag
  const allowedAgencyList = useMemo(() => {
    return agencies.filter(ag => matchAgencyVisual(ag) !== null);
  }, [agencies]);

  const hasAgencies = allowedAgencyList.length > 0;

  useEffect(() => {
    if (!selectedAgency) {
      if (hasAgencies) {
        setSelectedAgency(allowedAgencyList[0]);
      } else {
        setSelectedAgency('__all__');
      }
    }
  }, [allowedAgencyList, selectedAgency, hasAgencies]);

  useEffect(() => {
    const syncClientLogos = () => setClientLogos(readClientLogos());

    window.addEventListener('storage', syncClientLogos);
    window.addEventListener('local-storage-map-updated', syncClientLogos);

    return () => {
      window.removeEventListener('storage', syncClientLogos);
      window.removeEventListener('local-storage-map-updated', syncClientLogos);
    };
  }, []);

  const agencyType = useMemo(() => {
    // When __all__ mode, detect agency from account assignment OR account name
    if (selectedAgency === '__all__' && selectedAccount) {
      // First try accountAgencies map
      const accAgency = accountAgencies[selectedAccount];
      if (accAgency) {
        const detected = matchAgencyVisual(accAgency);
        if (detected) return detected;
      }
      // Fallback: detect by account name containing "tag"
      const acc = accounts.find(a => a.id === selectedAccount);
      if (acc) {
        const name = (acc.clientName || acc.name || '').toLowerCase();
        if (name.includes('tag')) return 'tag';
      }
    }
    if (selectedAgency === '__all__') return 'vilasmkt';
    return matchAgencyVisual(selectedAgency) || 'vilasmkt';
  }, [selectedAgency, selectedAccount, accountAgencies, accounts]);

  const logoSources = useMemo(() => getAgencyLogoSources(agencyType), [agencyType]);
  const agencyLabel = agencyType === 'tag' ? 'Grupo Tag' : 'Vilas Growth Marketing';

  const filteredAccounts = useMemo(() => {
    if (selectedAgency === '__all__') return accounts;
    if (!selectedAgency) return [];
    return accounts.filter(a => accountAgencies[a.id] === selectedAgency);
  }, [accounts, selectedAgency, accountAgencies]);

  const accountCampaigns = useMemo(() => {
    if (!selectedAccount) return [];

    return campaigns
      .filter(campaign => campaign.accountId === selectedAccount && (campaign.metrics?.spend || 0) > 0)
      .sort((a, b) => {
        const spendDiff = (b.metrics?.spend || 0) - (a.metrics?.spend || 0);
        if (spendDiff !== 0) return spendDiff;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [campaigns, selectedAccount]);

  const selectedCampaigns = useMemo(() => {
    if (!selectedCampaignIds.length) return [];
    const selectedSet = new Set(selectedCampaignIds);
    return accountCampaigns.filter(campaign => selectedSet.has(campaign.id));
  }, [accountCampaigns, selectedCampaignIds]);

  const hasCampaignFilter = selectedCampaignIds.length > 0;
  const campaignScopeLabel = useMemo(
    () => buildCampaignScopeLabel(selectedCampaigns, accountCampaigns.length),
    [selectedCampaigns, accountCampaigns.length]
  );

  useEffect(() => {
    const element = previewFrameRef.current;
    if (!element) return undefined;

    const updateScale = () => {
      const nextScale = Math.min(1, element.clientWidth / 1200);
      setPreviewScale(nextScale > 0 ? nextScale : 1);
    };

    updateScale();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
    }

    const observer = new ResizeObserver(updateScale);
    observer.observe(element);

    return () => observer.disconnect();
  }, [reportData]);

  useEffect(() => {
    if (!reportData) {
      exportImagesReadyRef.current = Promise.resolve();
      return;
    }

    const imageSources = [
      reportData.agencyLogoB64,
      reportData.metaLogoB64,
      reportData.clientLogoExportSrc,
    ].filter(Boolean);

    exportImagesReadyRef.current = Promise.all(imageSources.map(preloadImage));
  }, [
    reportData,
    reportData?.agencyLogoB64,
    reportData?.metaLogoB64,
    reportData?.clientLogoExportSrc,
  ]);

  useEffect(() => {
    if (filteredAccounts.length > 0 && !filteredAccounts.find(a => a.id === selectedAccount)) {
      setSelectedAccount(filteredAccounts[0].id);
    }
  }, [filteredAccounts, selectedAccount]);

  useEffect(() => {
    if (!selectedAccount) {
      setSelectedCampaignIds([]);
      return;
    }

    const availableIds = new Set(accountCampaigns.map(campaign => campaign.id));
    setSelectedCampaignIds(prev => prev.filter(id => availableIds.has(id)));
  }, [selectedAccount, accountCampaigns]);

  const handleGenerate = useCallback(async () => {
    if (!selectedAccount) return;
    setGenerating(true);
    setReportData(null);
    exportCacheRef.current = { key: '', dataUrl: '', blob: null };

    try {
      const prevPeriod = getPreviousPeriodRange(selectedPeriod);
      let spend = 0;
      let impressions = 0;
      let reach = 0;
      let clicks = 0;
      let leads = 0;
      let engagements = 0;
      let igProfileVisits = 0;
      let prevIgProfileVisits = 0;
      let costPerLead = 0;
      let costPerEngagement = 0;
      let prevSpend = 0;
      let prevImpressions = 0;
      let prevReach = 0;
      let prevClicks = 0;
      let prevLeads = 0;
      let prevEngagements = 0;
      let prevCostPerLead = 0;
      let prevCostPerEngagement = 0;
      let prevCostPerClick = 0;
      let campData = [];
      let selectedCampaignNames = [];

      if (hasCampaignFilter) {
        const selectedCampaignSet = new Set(selectedCampaignIds);
        const [currentCampaigns, previousCampaigns] = await Promise.all([
          fetchCampaignsWithInsights(selectedAccount, selectedPeriod),
          fetchCampaignsWithInsights(selectedAccount, prevPeriod),
        ]);

        campData = currentCampaigns.filter(campaign => selectedCampaignSet.has(campaign.id));
        const prevCampData = previousCampaigns.filter(campaign => selectedCampaignSet.has(campaign.id));

        if (!campData.length) {
          setReportData({ error: 'Nenhuma das campanhas selecionadas teve dados no período escolhido.' });
          return;
        }

        const currentSummary = aggregateCampaignMetrics(campData);
        const previousSummary = aggregateCampaignMetrics(prevCampData);

        spend = currentSummary.spend;
        impressions = currentSummary.impressions;
        reach = currentSummary.reach;
        clicks = currentSummary.clicks;
        leads = currentSummary.leads;
        engagements = currentSummary.engagements;
        igProfileVisits = currentSummary.igProfileVisits;
        costPerLead = currentSummary.costPerLead;
        costPerEngagement = currentSummary.costPerEngagement;
        prevSpend = previousSummary.spend;
        prevImpressions = previousSummary.impressions;
        prevReach = previousSummary.reach;
        prevClicks = previousSummary.clicks;
        prevLeads = previousSummary.leads;
        prevEngagements = previousSummary.engagements;
        prevIgProfileVisits = previousSummary.igProfileVisits;
        prevCostPerLead = previousSummary.costPerLead;
        prevCostPerEngagement = previousSummary.costPerEngagement;
        prevCostPerClick = previousSummary.clicks > 0 ? previousSummary.spend / previousSummary.clicks : 0;
        selectedCampaignNames = selectedCampaigns.map(campaign => campaign.name);
      } else {
        const [insights, prevInsights, currentCampaigns] = await Promise.all([
          fetchAccountInsights(selectedAccount, selectedPeriod),
          fetchAccountInsights(selectedAccount, prevPeriod),
          fetchCampaignsWithInsights(selectedAccount, selectedPeriod),
        ]);

        if (!insights) {
          setReportData({ error: 'Sem dados para o período selecionado.' });
          return;
        }

        const actions = insights.actions || [];
        const prevActions = prevInsights?.actions || [];

        spend = parseFloat(insights.spend || 0);
        impressions = parseInt(insights.impressions || 0, 10);
        reach = parseInt(insights.reach || 0, 10);
        clicks = parseInt(insights.inline_link_clicks || 0, 10);
        prevSpend = parseFloat(prevInsights?.spend || 0);
        prevImpressions = parseInt(prevInsights?.impressions || 0, 10);
        prevReach = parseInt(prevInsights?.reach || 0, 10);
        prevClicks = parseInt(prevInsights?.inline_link_clicks || 0, 10);
        leads = getActionValueMulti(actions, LEAD_ACTION_TYPES);
        prevLeads = getActionValueMulti(prevActions, LEAD_ACTION_TYPES);
        engagements = getActionValueMulti(actions, ENGAGEMENT_ACTION_TYPES);
        prevEngagements = getActionValueMulti(prevActions, ENGAGEMENT_ACTION_TYPES);
        igProfileVisits = getActionValueMulti(actions, IG_PROFILE_VISIT_ACTION_TYPES);
        prevIgProfileVisits = getActionValueMulti(prevActions, IG_PROFILE_VISIT_ACTION_TYPES);
        costPerLead = leads > 0 ? spend / leads : 0;
        prevCostPerLead = prevLeads > 0 ? prevSpend / prevLeads : 0;
        costPerEngagement = engagements > 0 ? spend / engagements : 0;
        prevCostPerEngagement = prevEngagements > 0 ? prevSpend / prevEngagements : 0;
        prevCostPerClick = prevClicks > 0 ? prevSpend / prevClicks : 0;
        campData = currentCampaigns;
      }

      const costPerClick = clicks > 0 ? spend / clicks : 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const prevCtr = prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : 0;

      const diffs = {
        spend: calcDiff(spend, prevSpend),
        reach: calcDiff(reach, prevReach),
        clicks: calcDiff(clicks, prevClicks),
        leads: calcDiff(leads, prevLeads),
        ctr: calcDiff(ctr, prevCtr),
        costPerLead: calcDiff(costPerLead, prevCostPerLead),
        costPerClick: calcDiff(costPerClick, prevCostPerClick),
        engagements: calcDiff(engagements, prevEngagements),
        costPerEngagement: calcDiff(costPerEngagement, prevCostPerEngagement),
        igProfileVisits: calcDiff(igProfileVisits, prevIgProfileVisits),
      };

      // Daily series: leads, clicks, engagements from the same campaign fetch
      let dailyLeads = [];
      let dailyClicks = [];
      let dailyEngagements = [];
      if (campData.length > 0) {
        try {
          const allDaily = await Promise.all(
            campData.map(c => fetchCampaignDailyInsights(c.id, selectedPeriod))
          );
          const dayMap = {};
          for (const daily of allDaily) {
            for (const d of daily) {
              const date = d.date_start;
              if (!dayMap[date]) dayMap[date] = { date, leads: 0, clicks: 0, engagements: 0 };
              dayMap[date].leads += getActionValueMulti(d.actions || [], LEAD_ACTION_TYPES);
              dayMap[date].clicks += parseInt(d.inline_link_clicks || 0, 10);
              dayMap[date].engagements += getActionValueMulti(d.actions || [], ENGAGEMENT_ACTION_TYPES);
            }
          }
          const sorted = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
          const formatDay = (date) => `${date.split('-')[2]}/${date.split('-')[1]}`;
          dailyLeads = sorted.map(d => ({ date: formatDay(d.date), leads: d.leads }));
          dailyClicks = sorted.map(d => ({ date: formatDay(d.date), clicks: d.clicks }));
          dailyEngagements = sorted.map(d => ({ date: formatDay(d.date), engagements: d.engagements }));
        } catch { /* empty */ }
      }

      const account = accounts.find(a => a.id === selectedAccount);
      const periodDates = formatPeriodLabel(selectedPeriod);

      // Achar cliente associado para obter a logo
      const clientLogoUrl = clientLogos[selectedAccount] ||
        (account && clientLogos[account.accountId]) ||
        (account && clientLogos[account.id]) ||
        null;

      // Convert export assets ahead of time so html-to-image doesn't depend on external logo URLs.
      const [agencyLogoB64, metaLogoB64, clientLogoRasterizedB64] = await Promise.all([
        toBase64FromSources(logoSources),
        toBase64FromSources(META_LOGO_SOURCES),
        clientLogoUrl
          ? Promise.race([
            toRasterizedPngDataUrl(clientLogoUrl),
            new Promise((resolve) => setTimeout(() => resolve(null), 15000)),
          ])
          : Promise.resolve(null),
      ]);
      const clientLogoExportSrc = getSafeExportLogoSrc(clientLogoUrl, clientLogoRasterizedB64);
      if (clientLogoUrl) {
        console.info('[client-logo] URL configurada:', clientLogoUrl);
        if (!clientLogoRasterizedB64) {
          console.warn('[client-logo] não pôde ser rasterizada e foi omitida do PNG (preview continua mostrando):', clientLogoUrl);
        } else {
          console.info('[client-logo] rasterizada com sucesso, vai entrar no PNG.');
        }
      }

      setReportData({
        accountName: account?.clientName || 'Conta',
        scopeLabel: hasCampaignFilter ? campaignScopeLabel : 'Conta inteira',
        selectedCampaignNames,
        filteredCampaignCount: hasCampaignFilter ? selectedCampaignIds.length : 0,
        period: periodDates,
        objective: selectedObjective,
        spend, impressions, reach, clicks, leads, engagements, igProfileVisits,
        costPerLead, costPerEngagement, costPerClick, ctr,
        diffs,
        dailyLeads, dailyClicks, dailyEngagements,
        agencyLogoB64, metaLogoB64,
        clientLogoExportSrc,
        clientLogoUrl,
      });
    } catch (err) {
      console.error('Erro ao gerar relatório visual:', err);
      setReportData({ error: `Erro: ${err.message}` });
    } finally {
      setGenerating(false);
    }
  }, [
    selectedAccount,
    selectedPeriod,
    selectedObjective,
    accounts,
    logoSources,
    hasCampaignFilter,
    selectedCampaignIds,
    selectedCampaigns,
    campaignScopeLabel,
    clientLogos,
  ]);

  const buildExportAsset = useCallback(async () => {
    if (!reportRef.current || !reportData) return null;

    const cacheKey = getExportCacheKey(reportData);
    if (exportCacheRef.current.key === cacheKey && exportCacheRef.current.dataUrl) {
      return exportCacheRef.current;
    }

    await exportImagesReadyRef.current;
    await waitForImages(reportRef.current);
    await prepareExportImages(reportRef.current);
    await waitForImages(reportRef.current);
    scrubBrokenImages(reportRef.current);

    // Diagnóstico: estado de cada <img> imediatamente antes do toPng.
    const debugImages = Array.from(reportRef.current.querySelectorAll('img')).map((img) => ({
      alt: img.alt,
      srcPrefix: (img.currentSrc || img.src || '').slice(0, 60),
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      display: img.style.display || getComputedStyle(img).display,
    }));
    console.info('[report-visual] imgs no container de export:', debugImages);

    const dataUrl = await renderPngWithFallbacks(reportRef.current);

    const asset = { key: cacheKey, dataUrl };
    exportCacheRef.current = asset;
    return asset;
  }, [reportData]);

  const handleDownload = useCallback(async () => {
    if (!reportRef.current || !reportData) return;
    setDownloading(true);
    try {
      const asset = await buildExportAsset();
      const link = document.createElement('a');
      const accountSlug = (reportData.accountName || 'meta').replace(/\s+/g, '-').toLowerCase();
      const periodSlug = reportData.period ? `${reportData.period.startShort}_${reportData.period.endShort}` : '';
      link.download = `relatorio-${accountSlug}-${periodSlug}.png`;
      link.href = asset.dataUrl;
      link.click();
    } catch (err) {
      console.error('Erro ao exportar PNG:', err);
      console.error('Detalhes:', { name: err?.name, message: err?.message, stack: err?.stack });
      const detail = err?.message || err?.name || (typeof err === 'string' ? err : '');
      alert(`Erro ao gerar PNG${detail ? `: ${detail}` : '. Tente novamente.'}`);
    } finally {
      setDownloading(false);
    }
  }, [reportData, buildExportAsset]);



  // ── Share link with client ──
  const { user } = useAuth();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareList, setShareList] = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCreating, setShareCreating] = useState(false);
  const [shareError, setShareError] = useState(null);
  const [copiedShareId, setCopiedShareId] = useState(null);
  const [customSlugInput, setCustomSlugInput] = useState('');
  const [editingShareId, setEditingShareId] = useState(null);
  const [editingSlugInput, setEditingSlugInput] = useState('');
  const [slugSaving, setSlugSaving] = useState(false);

  useEffect(() => {
    const account = accounts.find(a => a.id === selectedAccount);
    setCustomSlugInput(slugifyShareLabel(account?.clientName || ''));
  }, [selectedAccount, accounts]);

  const buildShareUrl = useCallback((share) => {
    if (!share) return '';
    const baseUrl = getShareBaseUrl();
    if (SHARE_BASE_URL && share.public_slug) {
      return `${baseUrl}/${encodeURIComponent(share.public_slug)}`;
    }
    return `${baseUrl}/r/${share.id}`;
  }, []);

  const loadShares = useCallback(async () => {
    if (!selectedAccount) return;
    setShareLoading(true);
    setShareError(null);
    try {
      const { data, error } = await supabase
        .from('shared_reports')
        .select('*')
        .eq('account_id', selectedAccount)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setShareList(data || []);
    } catch (err) {
      setShareError(`Erro ao carregar links: ${err.message}`);
    } finally {
      setShareLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (shareModalOpen) loadShares();
  }, [shareModalOpen, loadShares]);

  const handleCreateShare = useCallback(async () => {
    if (!selectedAccount) return;
    setShareCreating(true);
    setShareError(null);
    try {
      const account = accounts.find(a => a.id === selectedAccount);
      const id = Array.from(crypto.getRandomValues(new Uint8Array(9)))
        .map(b => b.toString(36).padStart(2, '0'))
        .join('')
        .slice(0, 14);

      const customSlug = slugifyShareLabel(customSlugInput);
      const baseSlug = customSlug || makePublicSlug(account?.clientName, id);
      let { error } = await supabase
        .from('shared_reports')
        .insert({
          id,
          owner_email: user?.email || null,
          account_id: selectedAccount,
          agency: agencyType,
          objective: selectedObjective,
          campaign_ids: hasCampaignFilter ? selectedCampaignIds : null,
          client_label: account?.clientName || null,
          public_slug: baseSlug,
        });
      if (error?.code === '23505') {
        const retrySlug = `${baseSlug}-${id.slice(-4)}`;
        ({ error } = await supabase
          .from('shared_reports')
          .insert({
            id,
            owner_email: user?.email || null,
            account_id: selectedAccount,
            agency: agencyType,
            objective: selectedObjective,
            campaign_ids: hasCampaignFilter ? selectedCampaignIds : null,
            client_label: account?.clientName || null,
            public_slug: retrySlug,
          }));
      }
      if (error) throw error;
      await loadShares();
    } catch (err) {
      setShareError(`Erro ao criar link: ${err.message}`);
    } finally {
      setShareCreating(false);
    }
  }, [selectedAccount, accounts, user, agencyType, selectedObjective, hasCampaignFilter, selectedCampaignIds, customSlugInput, loadShares]);

  const startEditSlug = useCallback((share) => {
    setEditingShareId(share.id);
    setEditingSlugInput(share.public_slug || '');
    setShareError(null);
  }, []);

  const cancelEditSlug = useCallback(() => {
    setEditingShareId(null);
    setEditingSlugInput('');
  }, []);

  const handleSaveSlug = useCallback(async (id) => {
    const newSlug = slugifyShareLabel(editingSlugInput);
    if (!newSlug) {
      setShareError('Digite um nome válido (letras, números ou hífens).');
      return;
    }
    setSlugSaving(true);
    setShareError(null);
    try {
      const { error } = await supabase
        .from('shared_reports')
        .update({ public_slug: newSlug })
        .eq('id', id);
      if (error?.code === '23505') {
        setShareError('Esse nome já está em uso por outro link. Escolha outro.');
        return;
      }
      if (error) throw error;
      setShareList(prev => prev.map(s => s.id === id ? { ...s, public_slug: newSlug } : s));
      setEditingShareId(null);
      setEditingSlugInput('');
    } catch (err) {
      setShareError(`Erro ao renomear: ${err.message}`);
    } finally {
      setSlugSaving(false);
    }
  }, [editingSlugInput]);

  const handleDeleteShare = useCallback(async (id) => {
    if (!confirm('Remover este link? O cliente perderá acesso imediatamente.')) return;
    try {
      const { error } = await supabase.from('shared_reports').delete().eq('id', id);
      if (error) throw error;
      setShareList(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      setShareError(`Erro ao remover: ${err.message}`);
    }
  }, []);

  const handleCopyShareLink = useCallback(async (id) => {
    try {
      const share = shareList.find(item => item.id === id);
      await navigator.clipboard.writeText(buildShareUrl(share));
      setCopiedShareId(id);
      setTimeout(() => setCopiedShareId(null), 2000);
    } catch (err) {
      setShareError(`Não foi possível copiar: ${err.message}`);
    }
  }, [buildShareUrl, shareList]);

  const d = reportData;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="relative z-10 rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-5 lg:p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>

        {/* Title aligned LEFT */}
        <div className="relative flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
            <Image size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-text-primary tracking-tight">Relatório Visual</h1>
            <p className="text-xs lg:text-sm text-text-secondary">Gere relatórios visuais em PNG para envio ao cliente</p>
          </div>
        </div>

        {/* Selectors */}
        <div className="relative mt-5 grid grid-cols-1 min-[560px]:grid-cols-2 sm:flex sm:flex-wrap items-end justify-center gap-3 sm:gap-5">
          {hasAgencies ? (
            <div className="flex flex-col gap-1.5 col-span-1 sm:w-[210px]">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Agência</label>
              <select
                value={selectedAgency}
                onChange={e => {
                  setSelectedAgency(e.target.value);
                  setSelectedAccount('');
                  setSelectedCampaignIds([]);
                }}
                className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
              >
                {allowedAgencyList.map(ag => <option key={ag} value={ag}>{ag}</option>)}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[295px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Conta</label>
            <select
              value={selectedAccount}
              onChange={e => {
                setSelectedAccount(e.target.value);
                setSelectedCampaignIds([]);
              }}
              className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
            >
              <option value="">Selecione uma conta</option>
              {filteredAccounts.map(a => <option key={a.id} value={a.id}>{a.clientName}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 col-span-1 sm:w-[210px]">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Target size={12} className="text-primary-light" />
              Objetivo
            </label>
            <select
              value={selectedObjective}
              onChange={e => setSelectedObjective(e.target.value)}
              className="w-full bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer"
            >
              {OBJECTIVE_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 col-span-1 min-[560px]:col-span-2 sm:col-span-1 sm:w-[210px] z-50">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Período</label>
            <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} className="w-full" />
          </div>
        </div>

        {selectedAccount && (
          <div className="relative mt-5 rounded-2xl border border-border/60 bg-surface/45 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Filtro por campanhas</h3>
                <p className="mt-1 text-xs text-text-secondary">
                  Deixe vazio para considerar a conta inteira ou marque apenas as campanhas que quer incluir no relatório visual.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCampaignIds([])}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    !hasCampaignFilter
                      ? 'bg-primary/15 text-primary-light border border-primary/30'
                      : 'bg-bg/60 text-text-secondary border border-border hover:text-text-primary hover:border-primary/20'
                  }`}
                >
                  Todas as campanhas ({accountCampaigns.length})
                </button>
                {hasCampaignFilter && (
                  <button
                    type="button"
                    onClick={() => setSelectedCampaignIds([])}
                    className="rounded-xl border border-border bg-bg/60 px-3 py-2 text-xs font-medium text-text-secondary transition hover:border-primary/20 hover:text-text-primary"
                  >
                    Limpar filtro
                  </button>
                )}
              </div>
            </div>

            {accountCampaigns.length > 0 ? (
              <>
                <div className="mt-4 grid max-h-56 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                  {accountCampaigns.map((campaign) => {
                    const checked = selectedCampaignIds.includes(campaign.id);
                    return (
                      <label
                        key={campaign.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                          checked
                            ? 'border-primary/35 bg-primary/10'
                            : 'border-border/70 bg-bg/50 hover:border-primary/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedCampaignIds((prev) => (
                              prev.includes(campaign.id)
                                ? prev.filter(id => id !== campaign.id)
                                : [...prev, campaign.id]
                            ));
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-border bg-bg text-primary focus:ring-primary/40"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text-primary">
                            {campaign.name}
                          </span>
                          <span className="mt-1 block text-[11px] text-text-secondary">
                            Investimento: {formatCurrency(campaign.metrics?.spend || 0)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
                  <span className="rounded-full border border-border bg-bg/50 px-2.5 py-1">
                    Escopo atual: <span className="font-semibold text-text-primary">{campaignScopeLabel}</span>
                  </span>
                  {hasCampaignFilter && selectedCampaigns.length > 0 && (
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary-light">
                      {selectedCampaigns.length} selecionada(s)
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-border bg-bg/35 px-4 py-5 text-sm text-text-secondary">
                Nenhuma campanha encontrada para esta conta no período atual.
              </div>
            )}
          </div>
        )}

        {/* Action Row */}
        <div className="relative mt-6 flex items-center justify-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={!selectedAccount || generating}
            className="group relative inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-primary to-primary-light text-white shadow-lg shadow-primary/25
              hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
              transition-all duration-300 ease-out"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generating ? 'Gerando...' : 'Gerar Relatório'}
            <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>

          {d && !d.error && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
                bg-surface border border-primary/40 text-primary-light shadow-sm
                hover:bg-primary/10 hover:scale-[1.02] active:scale-[0.98]
                disabled:opacity-40 transition-all duration-300 ease-out"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {downloading ? 'Exportando...' : 'Baixar PNG'}
            </button>
          )}

          {selectedAccount && (
            <button
              onClick={() => setShareModalOpen(true)}
              className="group relative inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
                bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/25
                hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98]
                transition-all duration-300 ease-out"
              title="Gerar link compartilhável com o cliente"
            >
              <Link2 size={16} />
              Compartilhar com cliente
              <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          )}


        </div>


      </div>

      {/* REPORT CANVAS */}
      {d && !d.error && (
        <div className="pb-4">
          <div className="rounded-[28px] border border-border/60 bg-gradient-to-b from-surface/90 to-bg/90 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 px-1 sm:px-2">
              <div>
                <p className="text-sm font-semibold text-text-primary">Pré-visualização</p>
                <p className="text-xs text-text-secondary">A tela e a exportação agora usam o mesmo componente-base.</p>
              </div>
              <span className="rounded-full border border-border bg-bg/60 px-3 py-1 text-[11px] font-medium text-text-secondary">
                Escala {Math.round(previewScale * 100)}%
              </span>
            </div>
            <div
              ref={previewFrameRef}
              className="overflow-x-auto rounded-2xl border border-border/50 bg-[#0a1018] p-3 sm:p-4"
            >
              <div
                style={{
                  width: `${1200 * previewScale}px`,
                  height: `${750 * previewScale}px`,
                  minWidth: previewScale < 1 ? `${1200 * previewScale}px` : 'auto',
                  margin: '0 auto',
                }}
              >
                <div
                  style={{
                    width: 1200,
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top center',
                  }}
                >
                  <ReportCard
                    data={d}
                    agencyLogoSrc={d.agencyLogoB64 ? [d.agencyLogoB64] : logoSources}
                    metaLogoSrc={d.metaLogoB64 ? [d.metaLogoB64] : META_LOGO_SOURCES}
                    clientLogoSrc={d.clientLogoUrl}
                    agencyLabel={agencyLabel}
                    showAccountName={false}
                    objective={d.objective || selectedObjective}
                    withBarChart
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {d?.error && (
        <div className="bg-surface rounded-2xl border border-danger/30 p-6 text-center">
          <p className="text-danger text-sm">{d.error}</p>
        </div>
      )}

      {!d && !generating && (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center">
          <Image size={48} className="text-text-secondary/20 mx-auto mb-4" />
          <p className="text-text-secondary text-sm">Selecione uma agência, conta, período e clique em "Gerar Relatório"</p>
        </div>
      )}

      {d && !d.error && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-200vw',
            top: 0,
            opacity: 0,
            pointerEvents: 'none',
          }}
        >
          <ReportCard
            data={d}
            agencyLogoSrc={d.agencyLogoB64 ? [d.agencyLogoB64] : logoSources}
            metaLogoSrc={d.metaLogoB64 ? [d.metaLogoB64] : META_LOGO_SOURCES}
            clientLogoSrc={d.clientLogoExportSrc}
            agencyLabel={agencyLabel}
            showAccountName={false}
            objective={d.objective || selectedObjective}
            withBarChart
            innerRef={reportRef}
          />
        </div>
      )}

      {shareModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShareModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div>
                <div className="flex items-center gap-2">
                  <Link2 size={18} className="text-emerald-400" />
                  <h2 className="text-lg font-bold text-text-primary">Links compartilháveis</h2>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  O cliente vê o relatório atualizado em tempo real e pode escolher o período. Sem expiração e sem senha.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                className="rounded-lg p-1.5 text-text-secondary transition hover:bg-bg/60 hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-text-secondary">
                <p>
                  <span className="font-semibold text-emerald-400">Conta selecionada:</span>{' '}
                  {accounts.find(a => a.id === selectedAccount)?.clientName || '—'}
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-emerald-400">Objetivo:</span>{' '}
                  {OBJECTIVE_OPTIONS.find(o => o.id === selectedObjective)?.label || selectedObjective}
                  {hasCampaignFilter && (
                    <> · <span className="font-semibold text-emerald-400">Campanhas:</span> {selectedCampaignIds.length} filtrada(s)</>
                  )}
                </p>
              </div>

              <div className="mb-3">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Nome do link (URL)
                </label>
                <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-bg/40 focus-within:border-emerald-500/40">
                  <span className="flex items-center px-3 text-xs text-text-secondary border-r border-border bg-bg/50 whitespace-nowrap">
                    /
                  </span>
                  <input
                    type="text"
                    value={customSlugInput}
                    onChange={(e) => setCustomSlugInput(slugifyShareLabel(e.target.value))}
                    placeholder="nome-do-cliente"
                    className="flex-1 bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-[11px] text-text-secondary/70">
                  Apenas letras, números e hífens. Caracteres inválidos são removidos automaticamente.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCreateShare}
                disabled={shareCreating || !selectedAccount}
                className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:shadow-xl hover:shadow-emerald-500/30 disabled:opacity-40"
              >
                {shareCreating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {shareCreating ? 'Gerando link...' : 'Gerar novo link'}
              </button>

              {shareError && (
                <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {shareError}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Links existentes ({shareList.length})
                </p>

                {shareLoading && (
                  <div className="flex items-center justify-center py-8 text-text-secondary">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                )}

                {!shareLoading && shareList.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border bg-bg/30 px-4 py-6 text-center text-sm text-text-secondary">
                    Nenhum link gerado para esta conta ainda.
                  </div>
                )}

                {!shareLoading && shareList.map((share) => {
                  const url = buildShareUrl(share);
                  const isCopied = copiedShareId === share.id;
                  const isEditing = editingShareId === share.id;
                  const filterCount = Array.isArray(share.campaign_ids) ? share.campaign_ids.length : 0;
                  const created = new Date(share.created_at).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  });
                  return (
                    <div
                      key={share.id}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-bg/40 p-3 transition hover:border-primary/30"
                    >
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="flex items-stretch overflow-hidden rounded-lg border border-emerald-500/40 bg-bg/60">
                            <span className="flex items-center px-2 text-[11px] text-text-secondary border-r border-border bg-bg/60 whitespace-nowrap">
                              /
                            </span>
                            <input
                              autoFocus
                              type="text"
                              value={editingSlugInput}
                              onChange={(e) => setEditingSlugInput(slugifyShareLabel(e.target.value))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveSlug(share.id);
                                if (e.key === 'Escape') cancelEditSlug();
                              }}
                              placeholder="nome-do-cliente"
                              className="flex-1 bg-transparent px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/60 focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <code className="truncate text-xs font-medium text-text-primary">{url}</code>
                          </div>
                        )}
                        <p className="mt-1 text-[11px] text-text-secondary">
                          {OBJECTIVE_OPTIONS.find(o => o.id === share.objective)?.label || share.objective}
                          {filterCount > 0 ? ` · ${filterCount} campanha(s)` : ' · conta inteira'}
                          {' · '}
                          criado em {created}
                        </p>
                      </div>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSaveSlug(share.id)}
                            disabled={slugSaving}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-40"
                          >
                            {slugSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditSlug}
                            disabled={slugSaving}
                            className="rounded-lg p-1.5 text-text-secondary transition hover:bg-bg/60 hover:text-text-primary disabled:opacity-40"
                            title="Cancelar"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleCopyShareLink(share.id)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                              isCopied
                                ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-400'
                                : 'border-primary/30 bg-primary/10 text-primary-light hover:bg-primary/15'
                            }`}
                          >
                            {isCopied ? <Check size={12} /> : <Copy size={12} />}
                            {isCopied ? 'Copiado!' : 'Copiar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditSlug(share)}
                            className="rounded-lg p-1.5 text-text-secondary transition hover:bg-primary/15 hover:text-primary-light"
                            title="Renomear link"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteShare(share.id)}
                            className="rounded-lg p-1.5 text-text-secondary transition hover:bg-danger/15 hover:text-danger"
                            title="Remover link"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
