import { isAuthenticatedRequest } from './_auth.js';
import { addDays, previousRange, todayIn } from './_traffic-report-data.js';
import { validateRange } from './traffic-report.js';
import { listInstagramAccounts, collectInstagramOverview } from './_instagram-data.js';

const cache = new Map();
const CACHE_LIMIT = 100;
const ACCOUNTS_TTL_MS = 10 * 60_000;

function readCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key, value, ttlMs) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function handleAccounts(req, res) {
  const cacheKey = 'accounts';
  const cached = req.query.refresh ? null : readCache(cacheKey);
  if (cached) return res.status(200).json(cached);
  const payload = { ...(await listInstagramAccounts()), fetchedAt: new Date().toISOString() };
  if (payload.accounts.length) writeCache(cacheKey, payload, ACCOUNTS_TTL_MS);
  return res.status(200).json(payload);
}

async function handleOverview(req, res) {
  const igId = String(req.query.igId || '');
  if (!/^\d+$/.test(igId)) return res.status(400).json({ error: 'Conta do Instagram inválida.' });
  const today = todayIn();
  const rangeError = validateRange(req.query.inicio, req.query.fim, today);
  if (rangeError) return res.status(400).json({ error: rangeError });

  const range = { start: req.query.inicio, end: req.query.fim };
  const cacheKey = `overview|${igId}|${range.start}|${range.end}`;
  const cached = req.query.refresh ? null : readCache(cacheKey);
  if (cached) return res.status(200).json(cached);

  const ranges = { current: range, previous: previousRange(range) };
  let data;
  try {
    data = await collectInstagramOverview(igId, ranges, today);
  } catch (error) {
    return res.status(403).json({ error: error.message });
  }
  const payload = { ...data, range: ranges.current, previousRange: ranges.previous, fetchedAt: new Date().toISOString() };
  const recent = range.end >= addDays(today, -1);
  writeCache(cacheKey, payload, recent ? 5 * 60_000 : 60 * 60_000);
  return res.status(200).json(payload);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  req.query = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams.entries());
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  if (!isAuthenticatedRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (req.query.action === 'accounts') return await handleAccounts(req, res);
    if (req.query.action === 'overview') return await handleOverview(req, res);
    return res.status(400).json({ error: 'Ação desconhecida.' });
  } catch (error) {
    console.error('[instagram] Error:', error);
    return res.status(500).json({ error: 'Não foi possível ler o Instagram.', details: String(error.message || error) });
  }
}
