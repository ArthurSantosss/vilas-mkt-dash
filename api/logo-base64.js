import { Buffer } from 'node:buffer';

function isPrivateHostname(hostname) {
  const normalized = (hostname || '').toLowerCase();

  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized === '::1') return true;
  if (normalized.endsWith('.local') || normalized.endsWith('.internal')) return true;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
    const [first, second] = normalized.split('.').map(Number);
    if (first === 10 || first === 127 || first === 0) return true;
    if (first === 169 && second === 254) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && second === 168) return true;
  }

  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUrl = typeof req.query?.url === 'string' ? req.query.url : '';
  if (!rawUrl) {
    return res.status(400).json({ error: 'url obrigatória' });
  }

  // Já é data URL — devolve direto.
  if (rawUrl.startsWith('data:image/')) {
    return res.status(200).json({ dataUrl: rawUrl });
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'url inválida' });
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return res.status(400).json({ error: 'protocolo não suportado' });
  }

  if (isPrivateHostname(targetUrl.hostname)) {
    return res.status(400).json({ error: 'host não permitido' });
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: { 
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `falha ao buscar imagem remota (${upstream.status})` });
    }

    const contentType = upstream.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ error: `recurso não é imagem (${contentType})` });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ dataUrl });
  } catch (error) {
    console.error('[logo-base64] error:', error);
    return res.status(502).json({ error: `não foi possível baixar a imagem: ${error?.message || 'erro desconhecido'}` });
  }
}
