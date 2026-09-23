import { isAuthenticatedRequest } from './_auth.js';
import {
  deleteMetaConnection,
  fetchMetaAdAccounts,
  fetchMetaProfile,
  inspectMetaToken,
  newConnectionId,
  owner,
  publicMetaTokenSnapshot,
  readMetaConnections,
  writeMetaConnection,
} from './_meta-tokens.js';

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

async function describeToken(token) {
  const [profile, accounts, inspection] = await Promise.all([
    fetchMetaProfile(token),
    fetchMetaAdAccounts(token),
    inspectMetaToken(token),
  ]);
  return { profile, accounts, inspection };
}

async function handleAdd(res, body) {
  const token = String(body.token || '').trim();
  const label = String(body.label || '').trim();
  if (!token) return json(res, 400, { error: 'Cole o token de usuário do sistema da BM.' });
  if (!label) return json(res, 400, { error: 'Dê um nome ao token (ex.: BM Vilas Marketing).' });

  let described;
  try {
    described = await describeToken(token);
  } catch (error) {
    return json(res, 400, { error: `A Meta recusou este token: ${error.message}` });
  }

  const { profile, accounts, inspection } = described;
  if (accounts.length === 0) {
    return json(res, 400, {
      error: 'O token é válido mas não enxerga nenhuma conta de anúncio. Confira as permissões do usuário do sistema na BM.',
    });
  }

  const existing = (await readMetaConnections()).find((connection) => connection.meta_user_id === profile.id);
  const now = new Date().toISOString();

  await writeMetaConnection({
    owner_email: owner(),
    id: existing?.id || newConnectionId(),
    label,
    token,
    kind: inspection.kind,
    meta_user_id: profile.id || null,
    meta_user_name: profile.name || null,
    business_name: String(body.businessName || '').trim() || null,
    never_expires: inspection.neverExpires,
    expires_at: inspection.expiresAt,
    accounts,
    warning: inspection.neverExpires
      ? null
      : 'Este token tem validade. Para não vencer, gere um token de usuário do sistema nas configurações da BM.',
    priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : (existing?.priority ?? 0),
    created_at: existing?.created_at || now,
    updated_at: now,
  });

  return json(res, 200, publicMetaTokenSnapshot(await readMetaConnections()));
}

/** Revalida cada token e atualiza a lista de contas que ele cobre. */
async function handleRefresh(res) {
  const connections = await readMetaConnections();
  for (const connection of connections) {
    try {
      const { profile, accounts, inspection } = await describeToken(connection.token);
      connection.accounts = accounts;
      connection.meta_user_id = profile.id || connection.meta_user_id;
      connection.meta_user_name = profile.name || connection.meta_user_name;
      connection.never_expires = inspection.neverExpires;
      connection.expires_at = inspection.expiresAt;
      connection.warning = inspection.neverExpires
        ? null
        : 'Este token tem validade. Para não vencer, gere um token de usuário do sistema nas configurações da BM.';
    } catch (error) {
      connection.warning = `Token inválido ou sem acesso: ${error.message}`;
    }
    connection.updated_at = new Date().toISOString();
    await writeMetaConnection(connection);
  }
  return json(res, 200, publicMetaTokenSnapshot(await readMetaConnections()));
}

async function handleRemove(res, body) {
  const id = String(body.id || '').trim();
  if (!id) return json(res, 400, { error: 'Selecione o token a remover.' });
  await deleteMetaConnection(id);
  return json(res, 200, publicMetaTokenSnapshot(await readMetaConnections()));
}

async function handleRename(res, body) {
  const id = String(body.id || '').trim();
  const label = String(body.label || '').trim();
  if (!id || !label) return json(res, 400, { error: 'Informe o token e o novo nome.' });
  const connection = (await readMetaConnections()).find((item) => item.id === id);
  if (!connection) return json(res, 404, { error: 'Token não encontrado.' });
  connection.label = label;
  connection.updated_at = new Date().toISOString();
  await writeMetaConnection(connection);
  return json(res, 200, publicMetaTokenSnapshot(await readMetaConnections()));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  // O token bruto só entra e nunca sai: exige a sessão do painel, sem exceção.
  if (!isAuthenticatedRequest(req)) {
    return json(res, 401, { error: 'Sua sessão expirou. Saia da plataforma e entre novamente.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    switch (body.action) {
      case 'status': return json(res, 200, publicMetaTokenSnapshot(await readMetaConnections()));
      case 'add': return await handleAdd(res, body);
      case 'refresh': return await handleRefresh(res);
      case 'rename': return await handleRename(res, body);
      case 'remove': return await handleRemove(res, body);
      default: return json(res, 400, { error: 'Ação desconhecida.' });
    }
  } catch (error) {
    return json(res, 400, { error: error.message || 'Erro ao processar os tokens da Meta.' });
  }
}
