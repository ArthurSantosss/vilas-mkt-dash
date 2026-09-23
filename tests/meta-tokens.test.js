/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import metaProxy from '../api/meta-proxy.js';
import {
  collectRegistryAccounts,
  normalizeAdAccountId,
  resolveConnectionForAccount,
} from '../api/_meta-tokens.js';
import { setAuthCookie } from '../api/_auth.js';

const owner = 'owner@example.test';

function setup(t) {
  const keys = {
    AUTH_EMAIL: owner,
    AUTH_PASS: 'test-password',
    AUTH_SESSION_SECRET: 'test-session-secret',
    SUPABASE_URL: 'https://database.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'private-service-key',
    META_ACCESS_TOKEN: 'server-token',
  };
  const old = Object.fromEntries(Object.keys(keys).map(k => [k, process.env[k]]));
  Object.assign(process.env, keys);
  t.after(() => { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  let cookie;
  setAuthCookie({ setHeader(_key, value) { cookie = value.split(';')[0]; } });
  return cookie;
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockFetch(t, fn) {
  const old = globalThis.fetch;
  globalThis.fetch = fn;
  t.after(() => { globalThis.fetch = old; });
}

/** Responde às leituras do Supabase com as conexões dadas e delega o resto à Graph API falsa. */
function registryMock(t, connections, graph) {
  mockFetch(t, async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === 'database.example.test') {
      assert.equal(new Headers(options.headers).get('apikey'), 'private-service-key');
      assert.equal(url.pathname.split('/').at(-1), 'meta_token_connections');
      return response(connections);
    }
    return graph(url, options);
  });
}

async function callProxy(query, cookie, headers = {}, method = 'GET') {
  const res = {
    headers: {}, statusCode: 200,
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    json(value) { this.body = value; return this; },
  };
  await metaProxy({ method, query, headers: { cookie, ...headers } }, res);
  return res;
}

const connection = (id, label, token, accountIds, extra = {}) => ({
  owner_email: owner,
  id,
  label,
  token,
  kind: 'system_user',
  meta_user_name: label,
  never_expires: true,
  accounts: accountIds.map(accountId => ({ id: accountId, account_id: accountId.replace('act_', ''), name: `Conta ${accountId}` })),
  ...extra,
});

test('resolveConnectionForAccount escolhe o token que cobre a conta e aceita id sem prefixo', () => {
  const connections = [
    connection('vilas', 'BM Vilas', 'token-vilas', ['act_111', 'act_222']),
    connection('tag', 'BM Tag', 'token-tag', ['act_333']),
  ];

  assert.equal(resolveConnectionForAccount(connections, 'act_222').token, 'token-vilas');
  assert.equal(resolveConnectionForAccount(connections, '333').token, 'token-tag');
  assert.equal(resolveConnectionForAccount(connections, 'act_999'), null);
  assert.equal(resolveConnectionForAccount(connections, ''), null);
  assert.equal(resolveConnectionForAccount([], 'act_111'), null);
});

test('normalizeAdAccountId rejeita entrada arbitrária e normaliza o prefixo', () => {
  assert.equal(normalizeAdAccountId('act_123'), 'act_123');
  assert.equal(normalizeAdAccountId('123'), 'act_123');
  assert.equal(normalizeAdAccountId('act_123/insights'), null);
  assert.equal(normalizeAdAccountId('me'), null);
  assert.equal(normalizeAdAccountId(undefined), null);
});

test('collectRegistryAccounts não repete conta presente em duas BMs', () => {
  const accounts = collectRegistryAccounts([
    connection('a', 'A', 't1', ['act_1', 'act_2']),
    connection('b', 'B', 't2', ['act_2', 'act_3']),
  ]);
  assert.deepEqual(accounts.map(a => a.id).sort(), ['act_1', 'act_2', 'act_3']);
});

test('/me/adaccounts une as contas das BMs com as que só o token de perfil enxerga', async t => {
  const cookie = setup(t);
  registryMock(t, [connection('vilas', 'BM Vilas', 'token-vilas', ['act_111'])], async (url) => {
    assert.equal(url.searchParams.get('access_token'), 'perfil');
    // A GDM não aceita token de usuário do sistema: essa conta só existe no perfil.
    return response({ data: [{ id: 'act_999', name: 'Conta GDM' }, { id: 'act_111', name: 'Duplicada' }] });
  });

  const res = await callProxy({ path: '/me/adaccounts' }, cookie, { 'x-meta-token': 'perfil' });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.map(a => a.id).sort(), ['act_111', 'act_999']);
  // A conta coberta pela BM mantém os dados vindos do registro.
  assert.equal(res.body.data.find(a => a.id === 'act_111').name, 'Conta act_111');
});

test('conta coberta pela BM usa o token da BM; conta de fora cai no token de perfil', async t => {
  const cookie = setup(t);
  const usados = [];
  registryMock(t, [connection('vilas', 'BM Vilas', 'token-vilas', ['act_111'])], async (url) => {
    usados.push({ path: url.pathname, token: url.searchParams.get('access_token') });
    return response({ data: [] });
  });

  await callProxy({ path: '/act_111/insights' }, cookie, { 'x-meta-token': 'perfil' });
  await callProxy({ path: '/act_999/insights' }, cookie, { 'x-meta-token': 'perfil' });

  assert.deepEqual(usados, [
    { path: '/v22.0/act_111/insights', token: 'token-vilas' },
    { path: '/v22.0/act_999/insights', token: 'perfil' },
  ]);
});

test('a dica x-meta-account leva a campanha ao token certo e ignora valor malformado', async t => {
  const cookie = setup(t);
  const usados = [];
  registryMock(t, [connection('vilas', 'BM Vilas', 'token-vilas', ['act_111'])], async (url) => {
    usados.push(url.searchParams.get('access_token'));
    return response({ data: [] });
  });

  await callProxy({ path: '/23850000/adsets' }, cookie, { 'x-meta-token': 'perfil', 'x-meta-account': 'act_111' });
  assert.equal(usados[0], 'token-vilas');

  // Dica inválida não pode virar seletor de token; volta à ordem padrão.
  await callProxy({ path: '/23850000/adsets' }, cookie, { 'x-meta-token': 'perfil', 'x-meta-account': '../act_111' });
  assert.equal(usados[1], 'perfil');
});

test('token de perfil sem acesso é sinalizado e a requisição tenta o próximo candidato', async t => {
  const cookie = setup(t);
  const usados = [];
  registryMock(t, [connection('vilas', 'BM Vilas', 'token-vilas', ['act_111'])], async (url) => {
    const token = url.searchParams.get('access_token');
    usados.push(token);
    if (token === 'perfil' || token === 'server-token') {
      return response({ error: { message: 'Error validating access token: Session has expired', code: 190 } }, 401);
    }
    return response({ data: [{ id: 'ok' }] });
  });

  // Conta fora da BM: começa pelo perfil, que está morto, e segue para os demais tokens.
  const res = await callProxy({ path: '/23850000/adsets' }, cookie, { 'x-meta-token': 'perfil' });

  assert.equal(res.headers['x-meta-token-invalid'], '1');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(usados, ['perfil', 'server-token', 'token-vilas']);
});

test('erro de negócio não faz o proxy varrer os outros tokens', async t => {
  const cookie = setup(t);
  const usados = [];
  registryMock(t, [connection('vilas', 'BM Vilas', 'token-vilas', ['act_111'])], async (url) => {
    usados.push(url.searchParams.get('access_token'));
    return response({ error: { message: 'Invalid parameter', code: 100 } }, 400);
  });

  const res = await callProxy({ path: '/act_111/insights' }, cookie, { 'x-meta-token': 'perfil' });

  assert.equal(res.statusCode, 400);
  assert.deepEqual(usados, ['token-vilas']);
});

test('sem sessão do painel o registro não é consultado nem usado', async t => {
  setup(t);
  registryMock(t, [connection('vilas', 'BM Vilas', 'token-vilas', ['act_111'])], async (url) => {
    assert.equal(url.searchParams.get('access_token'), 'perfil');
    return response({ data: [] });
  });

  const res = await callProxy({ path: '/act_111/insights' }, '', { 'x-meta-token': 'perfil' });
  assert.equal(res.statusCode, 200);
});
