/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import handler, { googleAdsSearch, listReachableAccounts, normalizePeriodToDateFilter, publicSnapshot, fetchAccountOverview } from '../api/google-ads-proxy.js';
import { isAuthenticatedRequest, setAuthCookie } from '../api/_auth.js';

const owner = 'owner@example.test';
const origin = 'https://dashboard.example.test';
function setup(t) {
  const keys = { AUTH_EMAIL: owner, AUTH_PASS: 'test-password', AUTH_SESSION_SECRET: 'test-session-secret', GOOGLE_ADS_CLIENT_ID: 'test-client', GOOGLE_ADS_CLIENT_SECRET: 'test-secret', GOOGLE_ADS_REDIRECT_URI: `${origin}/auth/callback`, SUPABASE_URL: 'https://database.example.test', SUPABASE_SERVICE_ROLE_KEY: 'private-service-key' };
  const old = Object.fromEntries(Object.keys(keys).map(k => [k, process.env[k]]));
  Object.assign(process.env, keys);
  t.after(() => { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  let cookie;
  setAuthCookie({ setHeader(_key, value) { cookie = value.split(';')[0]; } });
  return cookie;
}
function response(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function mockFetch(t, fn) { const old = globalThis.fetch; globalThis.fetch = fn; t.after(() => { globalThis.fetch = old; }); }
async function call(body, cookie, headers = {}) {
  const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } };
  await handler({ method: 'POST', body, headers: { origin, cookie, ...headers } }, res);
  return res;
}

function databaseMock(t, network) {
  const tables = { google_ads_connections: [], google_ads_oauth_states: [] };
  mockFetch(t, async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname !== 'database.example.test') return network(url, options);
    const headers = new Headers(options.headers);
    assert.equal(headers.get('apikey'), 'private-service-key');
    const table = url.pathname.split('/').at(-1);
    assert.ok(tables[table], `Only private tables allowed: ${table}`);
    const matches = row => [...url.searchParams].every(([key, value]) => {
      if (['select', 'order', 'on_conflict', 'columns'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('gt.')) return row[key] > value.slice(3);
      if (value.startsWith('lt.')) return row[key] < value.slice(3);
      throw new Error(`Unexpected filter ${key}=${value}`);
    });
    const selected = tables[table].filter(matches);
    if (options.method === 'POST') {
      const row = JSON.parse(options.body);
      const existing = tables[table].findIndex(r => table === 'google_ads_connections' ? r.owner_email === row.owner_email && r.id === row.id : r.state === row.state);
      if (existing >= 0) tables[table][existing] = row; else tables[table].push(row);
      return response(null, 201);
    }
    if (options.method === 'PATCH') for (const row of selected) Object.assign(row, JSON.parse(options.body));
    if (options.method === 'DELETE') tables[table] = tables[table].filter(r => !selected.includes(r));
    if (headers.get('accept')?.includes('vnd.pgrst.object')) return selected.length ? response(selected[0]) : response({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'No rows' }, 406);
    return response(selected);
  });
  return tables;
}
const leaf = (id, extra = {}) => ({ id, accountId: id, name: `Conta ${id}`, currency: 'BRL', timeZone: 'America/Bahia', loginCustomerId: null, source: 'direct', ...extra });
const connection = (id, accounts, extra = {}) => ({ owner_email: owner, id, user_email: `${id}@example.test`, refresh_token: `secret-${id}`, accounts, warnings: [], connected_at: '2026-09-22', updated_at: '2026-09-22', ...extra });

test('API exige cookie válido; e-mail, host e origin localhost não autenticam', async t => {
  const cookie = setup(t);
  for (const headers of [{ 'x-auth-email': owner }, { host: 'localhost' }, { origin: 'http://localhost:5173' }, { cookie: 'vilasmkt_auth_server=%garbage' }]) assert.equal(isAuthenticatedRequest({ headers }), false);
  assert.equal(isAuthenticatedRequest({ headers: { cookie } }), true);
  assert.equal((await call({ action: 'status' }, '', { 'x-auth-email': owner })).statusCode, 401);
  assert.equal((await call({ action: 'status' }, cookie, { origin: 'https://other.test' })).statusCode, 403);
});

test('paginação mantém o perfil/MCC e não envia developer token', async t => {
  const requests = [];
  mockFetch(t, async (url, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    assert.equal(options.headers.Authorization, 'Bearer access-profile-A');
    assert.equal(options.headers['login-customer-id'], '1111111111');
    assert.equal(options.headers['developer-token'], undefined);
    return response(body.pageToken ? { results: [{ value: 2 }] } : { results: [{ value: 1 }], nextPageToken: 'second' });
  });
  assert.deepEqual((await googleAdsSearch('2222222222', 'SELECT customer.id FROM customer', 'access-profile-A', '111-111-1111')).results, [{ value: 1 }, { value: 2 }]);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].pageToken, 'second');
});

test('descobre conta direta, MCC e sub-MCC, deduplica e tolera uma raiz sem acesso', async t => {
  const direct = '2222222222'; const manager = '1111111111'; const sub = '3333333333'; const nested = '4444444444'; const broken = '9999999999';
  mockFetch(t, async (input, options) => {
    const url = new URL(input);
    if (url.pathname.endsWith('listAccessibleCustomers')) return response({ resourceNames: [manager, direct, broken].map(id => `customers/${id}`) });
    const id = url.pathname.split('/')[3];
    const { query } = JSON.parse(options.body);
    if (id === broken) return response({ error: { message: 'Sem acesso à raiz' } }, 403);
    if (query.includes('FROM customer_client')) {
      assert.equal(options.headers['login-customer-id'], manager);
      return response({ results: (id === manager ? [{ id: manager, level: 0, manager: true }, { id: direct, level: 1 }, { id: sub, level: 1, manager: true }] : [{ id: nested, level: 1, hidden: true, timeZone: 'Asia/Tokyo' }]).map(customerClient => ({ customerClient })) });
    }
    if (id === sub) assert.equal(options.headers['login-customer-id'], manager);
    return response({ results: [{ customer: { id, manager: id !== direct, descriptiveName: id, currencyCode: 'BRL', timeZone: 'America/Bahia' } }] });
  });
  const result = await listReachableAccounts('token');
  assert.equal(result.accounts.length, 2);
  assert.equal(result.accounts.find(a => a.accountId === direct).loginCustomerId, null);
  assert.equal(result.accounts.find(a => a.accountId === nested).loginCustomerId, manager);
  assert.equal(result.accounts.find(a => a.accountId === nested).timeZone, 'Asia/Tokyo');
  assert.equal(result.warnings[0].rootCustomerId, broken);
});

test('datas respeitam o fuso da conta, virada do mês, ano bissexto e rejeitam injeção', () => {
  const now = new Date('2026-10-01T01:00:00Z');
  assert.match(normalizePeriodToDateFilter('today', 'America/Bahia', now), /2026-09-30.*2026-09-30/);
  assert.match(normalizePeriodToDateFilter('month', 'UTC', now), /2026-10-01.*2026-10-01/);
  assert.match(normalizePeriodToDateFilter('last_month', 'UTC', new Date('2024-03-01')), /2024-02-01.*2024-02-29/);
  for (const dates of [['2026-02-30','2026-03-02'], ['2026-10-02','2026-10-01'], ["2026-01-01' OR 1=1", '2026-10-01']]) assert.throws(() => normalizePeriodToDateFilter({ type: 'custom', startDate: dates[0], endDate: dates[1] }), /inválido/);
});

test('relatório inclui mais de 500 campanhas, campanhas removidas e CTR em percentual', async t => {
  mockFetch(t, async (_url, options) => {
    const { query, pageToken } = JSON.parse(options.body);
    assert.doesNotMatch(query, /LIMIT 500|status !=/);
    if (query.includes('segments.date,')) return response({ results: [{ segments: { date: '2026-09-01' }, metrics: { costMicros: '501000000', clicks: '501', impressions: '50100' } }] });
    const row = { campaign: { id: '1', status: 'REMOVED' }, metrics: { costMicros: '1000000', impressions: '100', clicks: '1', ctr: '0.01' } };
    return response({ results: Array.from({ length: pageToken ? 1 : 500 }, (_, i) => ({ ...row, campaign: { ...row.campaign, id: String((pageToken ? 500 : 0) + i) } })), ...(pageToken ? {} : { nextPageToken: 'p2' }) });
  });
  const result = await fetchAccountOverview('token', '2222222222', { type: 'custom', startDate: '2026-09-01', endDate: '2026-09-01' }, null, 'America/Bahia');
  assert.equal(result.campaigns.length, 501);
  assert.equal(result.totals.spend, 501);
  assert.equal(result.campaigns[0].metrics.ctr, 1);
  assert.equal(result.totals.ctr, 1);
  assert.equal(result.dailyMetrics[0].spend, result.totals.spend);
});

test('snapshot de vários perfis não expõe credenciais e prefere acesso direto', () => {
  const a = leaf('2222222222', { loginCustomerId: '1111111111' });
  const result = publicSnapshot([connection('a', [a]), connection('b', [leaf(a.id)])]);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].connectionId, 'b');
  assert.equal(result.connection.profiles.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /refresh_token|secret-a|secret-b|owner_email/);
});

test('fluxo OAuth usa cookie, PKCE, state único e adiciona dois perfis sem substituir', async t => {
  const cookie = setup(t);
  let selectedProfile = 'one'; let exchangeCount = 0; let expectedVerifier;
  const tables = databaseMock(t, async (url, options) => {
    if (url.hostname === 'oauth2.googleapis.com') {
      exchangeCount++;
      assert.equal(options.body.get('code_verifier'), expectedVerifier);
      assert.equal(options.body.get('redirect_uri'), `${origin}/auth/callback`);
      return response({ access_token: `access-${selectedProfile}`, refresh_token: `refresh-${selectedProfile}` });
    }
    if (url.hostname === 'openidconnect.googleapis.com') return response({ sub: selectedProfile, email: `${selectedProfile}@example.test`, email_verified: true });
    if (url.pathname.endsWith('listAccessibleCustomers')) return response({ resourceNames: [] });
    throw new Error(`Unexpected URL ${url}`);
  });
  for (const profile of ['one', 'two']) {
    selectedProfile = profile;
    const start = await call({ action: 'oauth-start' }, cookie);
    assert.equal(start.statusCode, 200);
    const authUrl = new URL(start.body.url); const state = authUrl.searchParams.get('state');
    expectedVerifier = tables.google_ads_oauth_states[0].verifier;
    assert.equal(authUrl.searchParams.get('code_challenge'), crypto.createHash('sha256').update(expectedVerifier).digest('base64url'));
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.match(start.headers['Set-Cookie'], /HttpOnly/);
    const before = exchangeCount;
    const rejected = await call({ action: 'oauth-exchange', state, code: 'code' }, cookie);
    assert.equal(rejected.statusCode, 400); assert.equal(exchangeCount, before);
    const oauthCookie = `${cookie}; ${start.headers['Set-Cookie'].split(';')[0]}`;
    const finished = await call({ action: 'oauth-exchange', state, code: 'code', redirectUri: 'https://attacker.test' }, oauthCookie);
    assert.equal(finished.statusCode, 200, JSON.stringify(finished.body));
    assert.doesNotMatch(JSON.stringify(finished.body), /refresh-one|refresh-two/);
    const replay = await call({ action: 'oauth-exchange', state, code: 'code' }, oauthCookie);
    assert.equal(replay.statusCode, 400); assert.equal(exchangeCount, before + 1);
  }
  assert.equal(tables.google_ads_connections.length, 2);
  const disconnected = await call({ action: 'disconnect', connectionId: 'one' }, cookie);
  assert.deepEqual(disconnected.body.connection.profiles.map(p => p.id), ['two']);
  assert.equal(tables.google_ads_connections[0].id, 'two');
});

test('consulta escolhe token e MCC no servidor, rejeita conta alheia e tolera perfil expirado', async t => {
  const cookie = setup(t); const tokens = [];
  const tables = databaseMock(t, async (url, options) => {
    if (url.hostname === 'oauth2.googleapis.com') {
      const token = options.body.get('refresh_token'); tokens.push(token);
      if (token === 'secret-expired') return response({ error: 'invalid_grant' }, 400);
      return response({ access_token: 'active-token' });
    }
    assert.equal(options.headers.Authorization, 'Bearer active-token');
    if (url.pathname.endsWith('listAccessibleCustomers')) return response({ resourceNames: [] });
    assert.equal(options.headers['login-customer-id'], '1111111111');
    return response({ results: [] });
  });
  tables.google_ads_connections.push(connection('expired', []), connection('active', [leaf('2222222222', { loginCustomerId: '1111111111' })]));
  const rejected = await call({ action: 'get-account-overview', customerId: '9999999999' }, cookie);
  assert.equal(rejected.statusCode, 403); assert.equal(tokens.length, 0);
  const report = await call({ action: 'get-account-overview', customerId: '2222222222', connectionId: 'active', loginCustomerId: '9999999999', period: 'today' }, cookie);
  assert.equal(report.statusCode, 200); assert.deepEqual(tokens, ['secret-active']);
  const synced = await call({ action: 'list-accounts' }, cookie);
  assert.equal(synced.statusCode, 200);
  assert.equal(synced.body.connection.profiles.length, 2);
  assert.match(synced.body.connection.warnings[0].message, /invalid_grant/);
});


test('perfil com falha não encobre outro perfil saudável para a mesma conta', () => {
  const account = leaf('2222222222');
  const snapshot = publicSnapshot([
    connection('expired', [account], { warnings: [{ message: 'invalid_grant' }] }),
    connection('healthy', [{ ...account, loginCustomerId: '1111111111' }]),
  ]);
  assert.equal(snapshot.accounts[0].connectionId, 'healthy');
});
