import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { toPng } from 'html-to-image';
import ReportCard from '../components/ReportCard';
import { getAgencyLogoSources, getAgencyLabel } from './agencyLogo';
import { toVisualReportData } from './visualReportData';
import { supabase } from '../../services/supabase';

const assetCache = new Map();

async function asDataUrl(src) {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  if (!assetCache.has(src)) {
    assetCache.set(src, (async () => {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Não foi possível carregar a logo (${response.status}).`);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Não foi possível ler a logo.'));
        reader.readAsDataURL(blob);
      });
    })());
  }
  return assetCache.get(src);
}

async function clientLogoDataUrl(report) {
  let logos;
  try { logos = JSON.parse(localStorage.getItem('client_logos')) || {}; }
  catch { return null; }
  const source = logos[report.accountId] || logos[report.accountNumber];
  if (!source) return null;
  try {
    const dataUrl = source.startsWith('data:') ? source : source.startsWith('/')
      ? await asDataUrl(source)
      : (await (await fetch(`/api/logo-base64?url=${encodeURIComponent(source)}`)).json()).dataUrl;
    if (!dataUrl) return null;
    const image = new window.Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function waitForCard(node) {
  await document.fonts.ready;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (node.querySelector('.recharts-surface')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  for (const image of node.querySelectorAll('img')) {
    if (!image.complete) await image.decode();
  }
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export async function renderVisualReportPng(report) {
  const agencyLogoSources = getAgencyLogoSources(report.agencyName, report.agency);
  const agencyLogo = agencyLogoSources.length ? await asDataUrl(agencyLogoSources[0]) : null;
  const platformLogo = await asDataUrl(report.platform === 'google' ? '/google-ads-logo.svg' : '/meta-ads-logo.png');
  const clientLogo = await clientLogoDataUrl(report);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-200vw;top:0;opacity:0;pointer-events:none;width:1200px;z-index:-1';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(
      <ReportCard
        data={toVisualReportData(report)}
        agencyLogoSrc={agencyLogo ? [agencyLogo] : []}
        platformLogoSrc={[platformLogo]}
        clientLogoSrc={clientLogo}
        agencyLabel={getAgencyLabel(report.agencyName, report.agency)}
        showAccountName={false}
        objective="messages"
        withBarChart
      />
    ));
    const card = host.firstElementChild;
    await waitForCard(card);
    let lastError;
    for (const skipFonts of [false, true]) {
      try {
        const dataUrl = await Promise.race([
          toPng(card, { quality: 1, pixelRatio: 1, backgroundColor: '#0d1520', cacheBust: false, skipFonts }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('A exportação do PNG demorou demais.')), 20000)),
        ]);
        return await (await fetch(dataUrl)).blob();
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Não foi possível exportar o Relatório Visual.');
  } finally {
    flushSync(() => root.unmount());
    host.remove();
  }
}

export async function uploadVisualReport(report) {
  const png = await renderVisualReportPng(report);
  const path = `manual/${report.agency}/${report.accountId}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage.from('report-images').upload(path, png, {
    contentType: 'image/png', upsert: false,
  });
  if (error) throw new Error(`Falha ao armazenar o relatório visual de ${report.accountName}: ${error.message}`);
  return path;
}
