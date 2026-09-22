import test from 'node:test';
import assert from 'node:assert/strict';
import { startGoogleAdsOAuth, completeGoogleAdsOAuthCallback, disconnectGoogleAds, syncGoogleAdsAccounts, loadStoredGoogleAdsConnection, loadStoredGoogleAdsAccounts } from '../src/services/googleAdsApi.js';

test('cliente conecta múltiplos perfis, troca callback só uma vez e atualiza snapshot após desconectar', async t => {
  const names = ['window', 'localStorage', 'sessionStorage', 'CustomEvent', 'fetch'];
  const descriptors = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const storage = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; };
  let redirected; const events = [];
  Object.assign(globalThis, { localStorage: storage(), sessionStorage: storage(), window: { location: { assign: url => { redirected = url; } }, dispatchEvent: event => events.push(event) }, CustomEvent: class extends Event { constructor(name, opts) { super(name); this.detail = opts.detail; } } });
  t.after(() => { for (const name of names) { if (descriptors[name]) Object.defineProperty(globalThis, name, descriptors[name]); else delete globalThis[name]; } });
  const calls = []; let profiles = [{ id: 'one' }, { id: 'two' }];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    if (body.action === 'oauth-start') return { ok: true, json: async () => ({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=google_ads:unique-test' }) };
    if (body.action === 'disconnect') profiles = profiles.filter(p => p.id !== body.connectionId);
    return { ok: true, json: async () => ({ connection: profiles.length ? { profiles } : null, accounts: profiles.map(p => ({ accountId: p.id, connectionId: p.id })) }) };
  };
  await startGoogleAdsOAuth();
  assert.match(redirected, /^https:\/\/accounts.google.com/);
  const params = new URLSearchParams({ state: 'google_ads:unique-test', code: 'client-test-code' });
  await Promise.all([completeGoogleAdsOAuthCallback(params), completeGoogleAdsOAuthCallback(params)]);
  assert.equal(calls.filter(c => c.action === 'oauth-exchange').length, 1);
  assert.equal(calls.find(c => c.action === 'oauth-exchange').state, 'google_ads:unique-test');
  assert.equal(loadStoredGoogleAdsConnection().profiles.length, 2);
  await syncGoogleAdsAccounts();
  assert.equal(calls.filter(c => c.action === 'list-accounts').length, 1);
  await disconnectGoogleAds('one');
  assert.deepEqual(loadStoredGoogleAdsConnection().profiles, [{ id: 'two' }]);
  assert.equal(loadStoredGoogleAdsAccounts()[0].connectionId, 'two');
  await disconnectGoogleAds('two');
  assert.equal(loadStoredGoogleAdsConnection(), null);
  assert.deepEqual(loadStoredGoogleAdsAccounts(), []);
  assert.ok(events.some(e => e.type === 'google-ads-updated'));
});
