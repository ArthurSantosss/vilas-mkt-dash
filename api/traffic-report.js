/* global process */

// Relatório completo (Tráfego Pago).
// Público (link do cliente, somente leitura):
//   GET ?shareId=…&inicio=YYYY-MM-DD&fim=YYYY-MM-DD&secao=core|instagram
// Plataforma (exige login):
//   GET  ?action=report&configId=…&inicio=…&fim=…&secao=…   relatório dentro do painel
//   GET  ?action=configs                                     lista as configurações
//   GET  ?action=options&meta=act_1&google=1234567890        campanhas, eventos e Instagram
//   POST ?action=save-config   { config }                    cria/atualiza
//   POST ?action=delete-config { id }
//   POST ?action=share         { id, slug }                  cria (ou devolve) o link do cliente
//
// As configurações ficam em app_preferences (chave traffic_report_configs). O link
// é uma linha comum de shared_reports com objective = 'trafego_pago'; o cliente só
// enxerga as contas gravadas na configuração ligada ao link.

import crypto from 'node:crypto';
import { getConfiguredAuth, isAuthenticatedRequest } from './_auth.js';
import { createReportStore } from './_automatic-reports.js';
import { getSupabase } from './_supabase-server.js';
import {
  YMD, addDays, daysBetween, previousRange, todayIn, normalizeTrafficConfig,
  collectMeta, collectGoogle, collectInstagram, collectOptions,
} from './_traffic-report-data.js';

export const TRAFFIC_OBJECTIVE = 'trafego_pago';
const CONFIGS_KEY = 'traffic_report_configs';
const MAX_RANGE_DAYS = 400;
const cache = new Map();
const CACHE_LIMIT = 200;

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

function clearCacheFor(configId) {
  for (const key of cache.keys()) if (key.startsWith(`${configId}|`)) cache.delete(key);
}

async function readConfigs(store) {
  const value = await store.get(CONFIGS_KEY);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function fetchShare(shareId) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error('Supabase não configurado no servidor.');
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_shared_report`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: shareId }),
  });
  if (!res.ok) throw new Error(`Supabase RPC ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

export function validateRange(inicio, fim, today) {
  if (!YMD.test(String(inicio || '')) || !YMD.test(String(fim || ''))) return 'Informe inicio e fim no formato AAAA-MM-DD.';
  if (inicio > fim) return 'A data de início precisa ser anterior à data de fim.';
  if (fim > today) return 'O período não pode terminar no futuro.';
  if (daysBetween(inicio, fim) + 1 > MAX_RANGE_DAYS) return `Escolha um período de até ${MAX_RANGE_DAYS} dias.`;
  return null;
}

/** Mantém só os campos conhecidos; o resto do JSON enviado é descartado. */
export function sanitizeSavedConfig(input, existing = null) {
  const normalized = normalizeTrafficConfig(input);
  return {
    id: existing?.id || String(input?.id || '') || crypto.randomUUID(),
    name: String(input?.name || '').trim().slice(0, 120) || 'Relatório sem nome',
    agency: String(input?.agency || '').trim().slice(0, 80) || null,
    shareId: existing?.shareId || null,
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
}

async function buildReport({ cacheKey, config, section, range, today, clientLabel, agency }) {
  const cached = readCache(cacheKey);
  if (cached) return cached;
  const ranges = { current: range, previous: previousRange(range) };
  let payload;
  if (section === 'instagram') {
    payload = { instagram: await collectInstagram(config, ranges, today) };
  } else {
    const [meta, google] = await Promise.all([collectMeta(config, ranges), collectGoogle(config, ranges)]);
    payload = {
      clientLabel,
      agency,
      audiences: config.audiences,
      funnels: config.funnels,
      hasInstagram: Boolean(config.instagramUserId),
      meta,
      google,
    };
  }
  payload = { ...payload, range: ranges.current, previousRange: ranges.previous, fetchedAt: new Date().toISOString() };
  // Períodos que tocam ontem/hoje ainda mudam: cache curto. Passado fechado: 1 hora.
  const recent = range.end >= addDays(today, -1);
  writeCache(cacheKey, payload, recent ? 5 * 60_000 : 60 * 60_000);
  return payload;
}

function readRangeOrError(query, today) {
  const error = validateRange(query.inicio, query.fim, today);
  return error ? { error } : { range: { start: query.inicio, end: query.fim } };
}

const slugify = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

async function createShare(db, config, requestedSlug) {
  const id = crypto.randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14).toLowerCase();
  const baseSlug = slugify(requestedSlug) || slugify(config.name) || id;
  const row = {
    id,
    owner_email: getConfiguredAuth().authorizedEmail || null,
    account_id: config.metaAccounts[0] || config.googleAccounts[0] || 'sem-conta',
    agency: config.agency,
    objective: TRAFFIC_OBJECTIVE,
    campaign_ids: null,
    client_label: config.name,
    public_slug: baseSlug,
  };
  let { error } = await db.from('shared_reports').insert(row);
  if (error?.code === '23505') ({ error } = await db.from('shared_reports').insert({ ...row, public_slug: `${baseSlug}-${id.slice(-4)}` }));
  if (error) throw new Error(`Não foi possível criar o link: ${error.message}`);
  const { data } = await db.from('shared_reports').select('id, public_slug').eq('id', id).maybeSingle();
  return data || { id, public_slug: row.public_slug };
}

async function handlePlatform(req, res, action) {
  if (!isAuthenticatedRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  const store = createReportStore();
  const split = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);

  if (action === 'options') {
    return res.status(200).json(await collectOptions({ metaAccounts: split(req.query.meta), googleAccounts: split(req.query.google) }));
  }

  if (action === 'configs') {
    const configs = await readConfigs(store);
    const db = getSupabase();
    const shareIds = Object.values(configs).map(c => c.shareId).filter(Boolean);
    const { data: shares } = shareIds.length
      ? await db.from('shared_reports').select('id, public_slug').in('id', shareIds)
      : { data: [] };
    const byId = new Map((shares || []).map(s => [s.id, s]));
    const list = Object.values(configs)
      .map(c => ({ ...c, share: byId.get(c.shareId) || null }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return res.status(200).json({ configs: list });
  }

  if (action === 'report') {
    const configs = await readConfigs(store);
    const saved = configs[String(req.query.configId || '')];
    if (!saved) return res.status(404).json({ error: 'Configuração não encontrada.' });
    const today = todayIn();
    const { range, error } = readRangeOrError(req.query, today);
    if (error) return res.status(400).json({ error });
    const section = req.query.secao === 'instagram' ? 'instagram' : 'core';
    const payload = await buildReport({
      cacheKey: `${saved.id}|${saved.updatedAt}|${section}|${range.start}|${range.end}`,
      config: normalizeTrafficConfig(saved), section, range, today,
      clientLabel: saved.name, agency: saved.agency,
    });
    return res.status(200).json(payload);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const configs = await readConfigs(store);

  if (action === 'save-config') {
    const existing = body.config?.id ? configs[body.config.id] : null;
    const saved = sanitizeSavedConfig(body.config, existing);
    if (!saved.metaAccounts.length && !saved.googleAccounts.length) return res.status(400).json({ error: 'Marque ao menos uma conta Meta ou Google.' });
    await store.set(CONFIGS_KEY, { ...configs, [saved.id]: saved });
    clearCacheFor(saved.id);
    if (saved.shareId) {
      await getSupabase().from('shared_reports')
        .update({ client_label: saved.name, agency: saved.agency, account_id: saved.metaAccounts[0] || saved.googleAccounts[0] || 'sem-conta' })
        .eq('id', saved.shareId);
    }
    return res.status(200).json({ config: saved });
  }

  if (action === 'delete-config') {
    const target = configs[body.id];
    if (!target) return res.status(404).json({ error: 'Configuração não encontrada.' });
    if (target.shareId) await getSupabase().from('shared_reports').delete().eq('id', target.shareId);
    const next = { ...configs };
    delete next[body.id];
    await store.set(CONFIGS_KEY, next);
    return res.status(200).json({ ok: true });
  }

  if (action === 'share') {
    const target = configs[body.id];
    if (!target) return res.status(404).json({ error: 'Configuração não encontrada.' });
    const db = getSupabase();
    if (target.shareId) {
      const { data } = await db.from('shared_reports').select('id, public_slug').eq('id', target.shareId).maybeSingle();
      if (data) return res.status(200).json({ share: data });
    }
    const share = await createShare(db, { ...target, ...normalizeTrafficConfig(target) }, body.slug);
    await store.set(CONFIGS_KEY, { ...configs, [target.id]: { ...target, shareId: share.id } });
    return res.status(200).json({ share });
  }

  return res.status(400).json({ error: 'Ação desconhecida.' });
}

async function handlePublic(req, res) {
  const shareId = String(req.query.shareId || '');
  if (!shareId) return res.status(400).json({ error: 'shareId obrigatório' });
  const today = todayIn();
  const { range, error } = readRangeOrError(req.query, today);
  if (error) return res.status(400).json({ error });

  const share = await fetchShare(shareId);
  if (!share || share.objective !== TRAFFIC_OBJECTIVE) return res.status(404).json({ error: 'Relatório não encontrado' });
  const saved = Object.values(await readConfigs(createReportStore())).find(c => c.shareId === share.id);
  if (!saved) return res.status(404).json({ error: 'A configuração deste relatório foi removida.' });

  const section = req.query.secao === 'instagram' ? 'instagram' : 'core';
  const payload = await buildReport({
    cacheKey: `${saved.id}|${saved.updatedAt}|${section}|${range.start}|${range.end}`,
    config: normalizeTrafficConfig(saved), section, range, today,
    clientLabel: saved.name || share.client_label, agency: saved.agency || share.agency,
  });
  return res.status(200).json(payload);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  req.query = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams.entries());
  try {
    const action = req.query.action;
    if (action) return await handlePlatform(req, res, action);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
    return await handlePublic(req, res);
  } catch (error) {
    console.error('[traffic-report] Error:', error);
    return res.status(500).json({ error: 'Não foi possível montar o relatório.', details: String(error.message || error) });
  }
}
