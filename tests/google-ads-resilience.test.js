/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransientGoogleError, withGoogleRetry, refreshAccessToken } from '../api/google-ads-proxy.js';
import { renewAuthCookie, setAuthCookie } from '../api/_auth.js';

const noWait = { wait: async () => {} };

test('erros passageiros do Google são repetidos; permissão negada não', async () => {
  assert.equal(isTransientGoogleError(Object.assign(new Error('x'), { status: 429 })), true);
  assert.equal(isTransientGoogleError(Object.assign(new Error('x'), { status: 503 })), true);
  assert.equal(isTransientGoogleError(Object.assign(new Error('x'), { name: 'TimeoutError' })), true);
  assert.equal(isTransientGoogleError(new TypeError('fetch failed')), true);
  assert.equal(isTransientGoogleError(Object.assign(new Error('x'), { status: 403 })), false);

  let calls = 0;
  const value = await withGoogleRetry(async () => {
    calls++;
    if (calls < 3) throw Object.assign(new Error('quota'), { status: 429 });
    return 'ok';
  }, noWait);
  assert.equal(value, 'ok');
  assert.equal(calls, 3);

  calls = 0;
  await assert.rejects(withGoogleRetry(async () => { calls++; throw Object.assign(new Error('negado'), { status: 403 }); }, noWait), /negado/);
  assert.equal(calls, 1);
});

test('token de acesso é reaproveitado e renovações simultâneas viram uma só', async t => {
  const old = { fetch: globalThis.fetch, id: process.env.GOOGLE_ADS_CLIENT_ID, secret: process.env.GOOGLE_ADS_CLIENT_SECRET };
  process.env.GOOGLE_ADS_CLIENT_ID = 'id'; process.env.GOOGLE_ADS_CLIENT_SECRET = 'secret';
  t.after(() => {
    globalThis.fetch = old.fetch;
    if (old.id === undefined) delete process.env.GOOGLE_ADS_CLIENT_ID; else process.env.GOOGLE_ADS_CLIENT_ID = old.id;
    if (old.secret === undefined) delete process.env.GOOGLE_ADS_CLIENT_SECRET; else process.env.GOOGLE_ADS_CLIENT_SECRET = old.secret;
  });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ access_token: `access-${calls}`, expires_in: 3599 }), { status: 200 });
  };
  const refresh = `refresh-cache-${Date.now()}`;
  const [a, b] = await Promise.all([refreshAccessToken(refresh), refreshAccessToken(refresh)]);
  const c = await refreshAccessToken(refresh);
  assert.equal(calls, 1);
  assert.equal(a, 'access-1'); assert.equal(b, 'access-1'); assert.equal(c, 'access-1');
});

test('sessão autenticada é renovada a cada chamada; sem sessão não', t => {
  const old = { email: process.env.AUTH_EMAIL, pass: process.env.AUTH_PASS };
  process.env.AUTH_EMAIL = 'gestor@example.test'; process.env.AUTH_PASS = 'senha';
  t.after(() => {
    if (old.email === undefined) delete process.env.AUTH_EMAIL; else process.env.AUTH_EMAIL = old.email;
    if (old.pass === undefined) delete process.env.AUTH_PASS; else process.env.AUTH_PASS = old.pass;
  });
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; }, getHeader: k => headers[k] };
  setAuthCookie(res);
  const cookie = String(headers['Set-Cookie']).split(';')[0];

  const renewed = {};
  const out = { setHeader: (k, v) => { renewed[k] = v; }, getHeader: k => renewed[k] };
  assert.equal(renewAuthCookie({ headers: { cookie } }, out), true);
  assert.match([].concat(renewed['Set-Cookie']).join(), /Max-Age=2592000/);

  const anonymous = {};
  assert.equal(renewAuthCookie({ headers: {} }, { setHeader: (k, v) => { anonymous[k] = v; }, getHeader: () => undefined }), false);
  assert.equal(anonymous['Set-Cookie'], undefined);
});
