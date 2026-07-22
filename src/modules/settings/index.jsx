import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Settings as SettingsIcon, Link2, Unlink, AlertCircle, RefreshCw,
  ToggleLeft, ToggleRight, Shield, Building2, Plus, Trash2, LogOut
} from 'lucide-react';
import { useAgency } from '../../contexts/AgencyContext';
import { useAuth } from '../../contexts/AuthContext';
import { calculateMetaBalance } from '../../shared/utils/metaBalance';
import { isCreditCardPaymentMethod, readSavedPaymentMethods, getAccountPaymentMethod } from '../../shared/utils/paymentMethod';
import {
  consumeGoogleAdsFlashError,
  loadStoredGoogleAdsAccounts,
  loadStoredGoogleAdsConnection,
  syncGoogleAdsAccounts,
} from '../../services/googleAdsApi';

function FacebookIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} fill-[#1877F2]`}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function GoogleAdsIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M19.8 12.6c4.2 0 7.7 2.8 8.9 6.6l15.3 27.6c1.8 3.2.6 7.3-2.6 9.1-3.2 1.8-7.3.6-9.1-2.6L17 25.8c-1.8-3.2-.6-7.3 2.6-9.1z" />
      <path fill="#34A853" d="M44.7 53.9c-3.7 0-6.8-3-6.8-6.8s3-6.8 6.8-6.8 6.8 3 6.8 6.8-3.1 6.8-6.8 6.8z" />
      <path fill="#FBBC04" d="M21.3 10.1c5.1 0 9.3 4.1 9.3 9.3s-4.1 9.3-9.3 9.3S12 24.6 12 19.4s4.2-9.3 9.3-9.3z" />
    </svg>
  );
}

const FB_SDK_SRC = 'https://connect.facebook.net/pt_BR/sdk.js';
let fbSdkPromise = null;

function loadFacebookSDK() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.FB) return Promise.resolve(window.FB);
  if (fbSdkPromise) return fbSdkPromise;

  fbSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${FB_SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.FB));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = FB_SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve(window.FB);
    script.onerror = (err) => {
      fbSdkPromise = null;
      reject(err);
    };
    document.head.appendChild(script);
  });

  return fbSdkPromise;
}


function StatusBadge({ connected }) {
  return connected ? (
    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border bg-success/10 text-success border-success/20">Conectado</span>
  ) : (
    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border bg-text-secondary/10 text-text-secondary border-border">Nao conectado</span>
  );
}

const STORAGE_KEYS = {
  META_TOKEN: 'meta_provider_token',
  META_USER: 'meta_user_info',
  META_ACCOUNTS: 'meta_ad_accounts',
  DISABLED_ACCOUNTS: 'disabled_ad_accounts',
};

const META_PROXY_PATH = '/api/meta-proxy';
const META_DIRECT_BASE = 'https://graph.facebook.com/v22.0';

async function fetchMetaProxy(path, token, params = {}) {
  if (import.meta.env.DEV) {
    const url = new URL(`${META_DIRECT_BASE}${path}`);
    if (token) {
      url.searchParams.append('access_token', token);
    }

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    }

    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.error || `Erro da Meta API (${response.status})`);
    }

    return payload;
  }

  const headers = { Accept: 'application/json' };
  if (token) headers['x-meta-token'] = token;

  const url = new URL(window.location.origin + META_PROXY_PATH);
  url.searchParams.append('path', path);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  }

  const response = await fetch(url.toString(), { headers });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || `Erro da Meta API (${response.status})`);
  }

  return payload;
}

export default function Settings() {
  const { agencies, accountAgencies, addAgency, removeAgency, setAccountAgency } = useAgency();
  const { user, signOut, syncToCloud } = useAuth();
  const [newAgencyName, setNewAgencyName] = useState('');
  const [showOnlyActive, setShowOnlyActive] = useState(false);

  const [clientLogos, setClientLogos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('client_logos')) || {};
    } catch {
      return {};
    }
  });

  const saveClientLogo = (accountId, logoUrl) => {
    const updated = { ...clientLogos };
    if (!logoUrl || !logoUrl.trim()) {
      delete updated[accountId];
    } else {
      updated[accountId] = logoUrl.trim();
    }
    setClientLogos(updated);
    localStorage.setItem('client_logos', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('local-storage-map-updated'));
  };

  const [metaToken, setMetaToken] = useState(() => localStorage.getItem(STORAGE_KEYS.META_TOKEN));
  const [metaUser, setMetaUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.META_USER)); } catch { return null; }
  });
  const [metaAccounts, setMetaAccounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.META_ACCOUNTS)) || []; } catch { return []; }
  });
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [error, setError] = useState(null);

  const [paymentMethods, setPaymentMethods] = useState(() => readSavedPaymentMethods());
  const [googleConnection, setGoogleConnection] = useState(() => loadStoredGoogleAdsConnection());
  const [googleAccounts, setGoogleAccounts] = useState(() => loadStoredGoogleAdsAccounts());

  const [disabledAccounts, setDisabledAccounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.DISABLED_ACCOUNTS)) || []; } catch { return []; }
  });

  const refreshGoogleState = useCallback(() => {
    setGoogleConnection(loadStoredGoogleAdsConnection());
    setGoogleAccounts(loadStoredGoogleAdsAccounts());
  }, []);

  useEffect(() => {
    const appId = import.meta.env.VITE_META_APP_ID;
    if (!appId || appId === 'SEU_META_APP_ID_AQUI') return;

    let cancelled = false;
    window.fbAsyncInit = function () {
      window.FB.init({ appId, cookie: true, xfbml: false, version: 'v22.0' });
    };

    loadFacebookSDK()
      .then((FB) => {
        if (cancelled || !FB) return;
        FB.init({ appId, cookie: true, xfbml: false, version: 'v22.0' });
      })
      .catch((err) => console.warn('[Settings] Falha ao carregar Facebook SDK:', err));

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const flashError = consumeGoogleAdsFlashError();
    if (flashError) {
      setError(flashError);
    }
  }, []);

  const fetchMetaAccounts = useCallback(async (token) => {
    if (!token) return;
    try {
      setLoadingMeta(true);
      setError(null);

      const [userData, accountsData] = await Promise.all([
        fetchMetaProxy('/me', token, { fields: 'id,name,email,picture' }),
        fetchMetaProxy('/me/adaccounts', token, {
          fields: 'id,name,account_id,account_status,balance,currency,business_name,amount_spent,spend_cap,is_prepay_account',
          limit: 100,
        }),
      ]);

      setMetaUser(userData);
      localStorage.setItem(STORAGE_KEYS.META_USER, JSON.stringify(userData));

      const accounts = accountsData.data || [];
      setMetaAccounts(accounts);
      localStorage.setItem(STORAGE_KEYS.META_ACCOUNTS, JSON.stringify(accounts));
      window.dispatchEvent(new CustomEvent('local-storage-map-updated'));
    } catch (err) {
      console.error('Erro ao buscar contas Meta:', err);
      setError(err.message);
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    if (metaToken && metaAccounts.length === 0) {
      fetchMetaAccounts(metaToken);
    }
  }, [fetchMetaAccounts, metaAccounts.length, metaToken]);

  const fetchGoogleAccounts = useCallback(async () => {
    try {
      setError(null);
      await syncGoogleAdsAccounts();
      refreshGoogleState();
    } catch (err) {
      console.error('Erro ao buscar contas Google Ads:', err);
      setError(err.message);
    }
  }, [refreshGoogleState]);

  useEffect(() => {
    if (googleConnection && googleAccounts.length === 0) {
      fetchGoogleAccounts();
    }
  }, [fetchGoogleAccounts, googleAccounts.length, googleConnection]);

  useEffect(() => {
    const syncPaymentMethods = () => setPaymentMethods(readSavedPaymentMethods());
    const handleLocalStorageMapUpdated = (event) => {
      if (event?.detail?.key === 'account_payment_methods') {
        setPaymentMethods(event.detail.value || {});
      }
    };
    const handleGoogleAdsUpdated = () => refreshGoogleState();
    window.addEventListener('storage', syncPaymentMethods);
    window.addEventListener('focus', syncPaymentMethods);
    window.addEventListener('local-storage-map-updated', handleLocalStorageMapUpdated);
    window.addEventListener('google-ads-updated', handleGoogleAdsUpdated);
    return () => {
      window.removeEventListener('storage', syncPaymentMethods);
      window.removeEventListener('focus', syncPaymentMethods);
      window.removeEventListener('local-storage-map-updated', handleLocalStorageMapUpdated);
      window.removeEventListener('google-ads-updated', handleGoogleAdsUpdated);
    };
  }, [refreshGoogleState]);

  const handleConnectMeta = async () => {
    setError(null);
    const appId = import.meta.env.VITE_META_APP_ID;

    if (!appId || appId === 'SEU_META_APP_ID_AQUI') {
      const token = window.prompt('Cole o token de acesso da Meta:');
      if (token && token.trim()) {
        const trimmed = token.trim();
        setMetaToken(trimmed);
        localStorage.setItem(STORAGE_KEYS.META_TOKEN, trimmed);
        window.dispatchEvent(new CustomEvent('local-storage-map-updated'));
        await fetchMetaAccounts(trimmed);
      }
      return;
    }

    if (!window.FB) {
      try {
        const FB = await loadFacebookSDK();
        if (FB) FB.init({ appId, cookie: true, xfbml: false, version: 'v22.0' });
      } catch (err) {
        console.warn('[Settings] Não foi possível carregar Facebook SDK:', err);
      }
    }

    if (!window.FB) {
      const token = window.prompt('Cole o token de acesso da Meta:');
      if (token && token.trim()) {
        const trimmed = token.trim();
        setMetaToken(trimmed);
        localStorage.setItem(STORAGE_KEYS.META_TOKEN, trimmed);
        window.dispatchEvent(new CustomEvent('local-storage-map-updated'));
        await fetchMetaAccounts(trimmed);
      }
      return;
    }

    setLoadingMeta(true);
    window.FB.login(
      (response) => {
        if (response.authResponse) {
          const token = response.authResponse.accessToken;
          setMetaToken(token);
          localStorage.setItem(STORAGE_KEYS.META_TOKEN, token);
          window.dispatchEvent(new CustomEvent('local-storage-map-updated'));
          fetchMetaAccounts(token);
        } else {
          setLoadingMeta(false);
        }
      },
      { scope: 'ads_read,read_insights,business_management' }
    );
  };

  const handleDisconnectMeta = () => {
    setMetaToken(null);
    setMetaUser(null);
    setMetaAccounts([]);
    localStorage.removeItem(STORAGE_KEYS.META_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.META_USER);
    localStorage.removeItem(STORAGE_KEYS.META_ACCOUNTS);
    window.dispatchEvent(new CustomEvent('local-storage-map-updated'));
  };

  const toggleAccount = (accountId) => {
    setDisabledAccounts(prev => {
      const updated = prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId];
      localStorage.setItem(STORAGE_KEYS.DISABLED_ACCOUNTS, JSON.stringify(updated));
      window.dispatchEvent(new Event('meta-accounts-toggled'));
      window.dispatchEvent(new CustomEvent('local-storage-map-updated'));
      return updated;
    });
  };

  const sortedMetaAccounts = useMemo(() => {
    return [...metaAccounts].sort((a, b) => {
      const aAgency = (accountAgencies[a.id] || '').trim().toLowerCase() || '\uffff';
      const bAgency = (accountAgencies[b.id] || '').trim().toLowerCase() || '\uffff';
      const agencyCmp = aAgency.localeCompare(bAgency, 'pt-BR');
      if (agencyCmp !== 0) return agencyCmp;
      return (a.name || a.account_id || '').localeCompare((b.name || b.account_id || ''), 'pt-BR');
    });
  }, [accountAgencies, metaAccounts]);

  const displayedMetaAccounts = showOnlyActive
    ? sortedMetaAccounts.filter(a => !disabledAccounts.includes(a.id))
    : sortedMetaAccounts;

  const activeMetaCount = metaAccounts.filter(a => !disabledAccounts.includes(a.id)).length;

  const getAccountStatusLabel = (status) => {
    switch (status) {
      case 1: return { label: 'Ativa', color: 'text-success' };
      case 2: return { label: 'Desabilitada', color: 'text-danger' };
      case 3: return { label: 'Nao aprovada', color: 'text-warning' };
      case 7: return { label: 'Pendente', color: 'text-warning' };
      default: return { label: `Status ${status}`, color: 'text-text-secondary' };
    }
  };

  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="relative z-10 mb-6 rounded-2xl border border-border bg-gradient-to-br from-surface via-[#1a1d27] to-[#0f1117] p-4 sm:p-6">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-light/5 blur-3xl" />
        </div>

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20">
              <SettingsIcon size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">Configurações</h1>
              <p className="text-xs sm:text-sm text-text-secondary">Gerencie conexões e preferências da plataforma</p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/20 px-4 py-3 rounded-xl">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-danger/60 hover:text-danger text-xs font-bold">x</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="bg-gradient-to-r from-[#1877F2]/5 to-transparent px-4 py-4 sm:px-6 border-b border-border/50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#1877F2]/10 flex items-center justify-center">
                <FacebookIcon />
              </div>
              <div>
                <h2 className="text-base font-bold text-text-primary">Meta Ads</h2>
                <p className="text-xs text-text-secondary">Contas e campanhas</p>
              </div>
            </div>
            <StatusBadge connected={!!metaToken} />
          </div>
          <div className="p-5 space-y-4">
            {metaToken ? (
              <>
                {metaUser && (
                  <div className="flex items-center gap-3 bg-bg/30 rounded-lg p-3 border border-border/50">
                    {metaUser.picture?.data?.url && (
                      <img src={metaUser.picture.data.url} alt="" className="w-9 h-9 rounded-full ring-2 ring-[#1877F2]/20" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">{metaUser.name}</p>
                      <p className="text-xs text-success mt-0.5">{metaAccounts.length} conta(s) encontrada(s)</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => fetchMetaAccounts(metaToken)}
                    disabled={loadingMeta}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#1877F2]/10 border border-[#1877F2]/20 text-[#1877F2] rounded-lg text-sm font-medium hover:bg-[#1877F2]/20 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={loadingMeta ? 'animate-spin' : ''} />
                    Sincronizar
                  </button>
                  <button
                    onClick={handleDisconnectMeta}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-danger/10 border border-danger/20 text-danger rounded-lg text-sm font-medium hover:bg-danger/20 transition-colors"
                  >
                    <Unlink size={13} /> Desconectar
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-5">
                <p className="text-sm text-text-secondary mb-4">Conecte sua conta Meta para carregar as contas de anuncio.</p>
                <button
                  onClick={handleConnectMeta}
                  disabled={loadingMeta}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1877F2] text-white rounded-xl text-sm font-bold hover:bg-[#1565C0] transition-colors disabled:opacity-50"
                >
                  {loadingMeta ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Link2 size={15} />}
                  Conectar Meta
                </button>
              </div>
            )}
          </div>
        </div>


      </div>

      {metaAccounts.length > 0 && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-border/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-bold text-text-primary">Contas de Anuncio - Meta Ads</h2>
              <p className="text-xs text-text-secondary">Ordenadas por agencia (sem agencia no final)</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <button
                onClick={() => setShowOnlyActive(v => !v)}
                className={`w-full sm:w-auto text-xs px-3 py-1.5 rounded-lg border transition-all ${showOnlyActive ? 'bg-primary/15 text-primary-light border-primary/30' : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-primary/30'}`}
              >
                {showOnlyActive ? 'Mostrar todas' : 'Ocultar inativas'}
              </button>
              <div className="bg-surface border border-border rounded-lg px-4 py-2 text-sm text-center sm:text-left">
                <span className="text-text-secondary">Ativas: </span>
                <span className="font-bold text-text-primary">{activeMetaCount}/{metaAccounts.length}</span>
              </div>
            </div>
          </div>

          {loadingMeta ? (
            <div className="px-6 py-12 text-center">
              <div className="w-8 h-8 border-2 border-[#1877F2]/30 border-t-[#1877F2] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-text-secondary">Buscando contas de anuncio...</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {displayedMetaAccounts.map((account) => {
                const status = getAccountStatusLabel(account.account_status);
                const isEnabled = !disabledAccounts.includes(account.id);
                const metaBalance = calculateMetaBalance(account);
                const paymentMethod = getAccountPaymentMethod(paymentMethods, account.id, account.account_id) || 'credit_card';
                const isCreditCard = isCreditCardPaymentMethod(paymentMethod);
                return (
                  <div key={account.id} className={`flex flex-col gap-4 px-4 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:px-6 ${isEnabled ? 'hover:bg-surface-hover/50' : 'opacity-50'}`}>
                    <div className="flex w-full min-w-0 items-start gap-4">
                      <div className="w-8 h-8 rounded-lg bg-[#1877F2]/10 flex items-center justify-center shrink-0">
                        <FacebookIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary truncate">{account.name || account.account_id}</p>
                        <div className="flex items-center gap-2 text-xs text-text-secondary flex-wrap">
                          <span className="font-mono">{account.account_id}</span>
                          <span>•</span>
                          <span className={status.color}>{status.label}</span>
                          {account.currency && <><span>•</span><span>{account.currency}</span></>}
                          {!isCreditCard && metaBalance.hasReliableBalance && <><span>•</span><span>Disponível: {metaBalance.currentBalance.toLocaleString('pt-BR', { style: 'currency', currency: account.currency || 'BRL' })}</span></>}
                          {!isCreditCard && !metaBalance.hasReliableBalance && metaBalance.amountDue > 0 && <><span>•</span><span>Em cobrança: {metaBalance.amountDue.toLocaleString('pt-BR', { style: 'currency', currency: account.currency || 'BRL' })}</span></>}
                        </div>
                      </div>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:ml-4 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                      <div className="flex items-center gap-2 w-full sm:w-[220px]">
                        <input
                          type="text"
                          value={clientLogos[account.id] || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setClientLogos(prev => ({ ...prev, [account.id]: val }));
                          }}
                          onBlur={e => saveClientLogo(account.id, e.target.value)}
                          placeholder="URL da Logo do Cliente"
                          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-primary"
                        />
                        {clientLogos[account.id] && (
                          <img
                            src={clientLogos[account.id]}
                            alt="Logo preview"
                            onError={(e) => { e.target.style.display = 'none'; }}
                            className="w-7 h-7 object-contain rounded border border-border bg-bg/50 p-0.5 shrink-0"
                            style={{ display: 'block' }}
                          />
                        )}
                      </div>

                      {agencies.length > 0 && (
                        <select
                          value={accountAgencies[account.id] || ''}
                          onChange={e => setAccountAgency(account.id, e.target.value)}
                          className="w-full bg-bg border border-border rounded-lg px-2 py-2 text-xs text-text-primary focus:outline-none focus:border-primary sm:w-[150px]"
                        >
                          <option value="">Sem agencia</option>
                          {agencies.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                        </select>
                      )}
                      <button onClick={() => toggleAccount(account.id)} className="self-end transition-colors sm:self-auto" title={isEnabled ? 'Desativar no dashboard' : 'Ativar no dashboard'}>
                        {isEnabled ? <ToggleRight size={28} className="text-success" /> : <ToggleLeft size={28} className="text-text-secondary/40" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}



      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3">
          <Building2 size={18} className="text-primary-light" />
          <div>
            <h2 className="text-lg font-bold text-text-primary">Agencias</h2>
            <p className="text-xs text-text-secondary">Crie agencias para categorizar as contas de anuncio</p>
          </div>
        </div>
        <div className="p-4 space-y-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={newAgencyName}
              onChange={e => setNewAgencyName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newAgencyName.trim()) { addAgency(newAgencyName); setNewAgencyName(''); } }}
              placeholder="Nome da agencia..."
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-primary"
            />
            <button
              onClick={() => { if (newAgencyName.trim()) { addAgency(newAgencyName); setNewAgencyName(''); } }}
              disabled={!newAgencyName.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary/20 border border-primary/30 text-primary-light rounded-lg text-sm font-medium hover:bg-primary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={16} /> Adicionar
            </button>
          </div>
          {agencies.length === 0 ? (
            <p className="text-sm text-text-secondary/60 text-center py-4">Nenhuma agencia criada ainda</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {agencies.map(ag => (
                <span key={ag} className="flex items-center gap-2 bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary">
                  <Building2 size={13} className="text-primary-light" />
                  {ag}
                  <button onClick={() => removeAgency(ag)} className="text-text-secondary/50 hover:text-danger transition-colors" title="Remover agencia">
                    <Trash2 size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Logout */}
      <div className="bg-surface/50 rounded-xl border border-danger/20 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <LogOut size={18} className="text-danger/70" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Sair da conta</p>
              {user?.email && (
                <p className="mt-0.5 truncate text-xs text-text-secondary">Conectado como {user.email}</p>
              )}
            </div>
          </div>
          <button
            onClick={signOut}
            className="inline-flex w-full items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-medium sm:w-auto
              bg-danger/10 border border-danger/30 text-danger
              hover:bg-danger/20 hover:border-danger/50
              active:scale-[0.97] transition-all duration-200"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>
      </div>

      {/* Cloud Backup */}
      <div className="bg-surface/50 rounded-xl border border-primary/20 bg-primary/5 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <RefreshCw size={18} className="text-primary-light" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Sincronizar com Nuvem (Backup)</p>
              <p className="mt-0.5 text-xs text-text-secondary">Salve as configurações atuais (agências, token, contas) para seu login.</p>
            </div>
          </div>
          <button
            onClick={async (e) => {
              const btn = e.currentTarget;
              btn.disabled = true;
              const originalText = btn.innerText;
              btn.innerText = 'Salvando...';
              
              const success = await syncToCloud(user.email);
              
              if (success) {
                btn.innerText = 'Salvo com sucesso!';
                btn.classList.add('bg-success', 'text-white');
              } else {
                btn.innerText = 'Erro (Tabela nao existe?)';
                btn.classList.add('bg-danger', 'text-white');
              }
              
              setTimeout(() => { 
                btn.disabled = false; 
                btn.innerText = originalText; 
                btn.classList.remove('bg-success', 'bg-danger', 'text-white');
              }, 4000);
            }}
            className="inline-flex w-full items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-bold sm:w-auto
              bg-primary text-white shadow-lg shadow-primary/20
              hover:bg-primary-light active:scale-[0.97] transition-all duration-200"
          >
            Fazer Backup Manual
          </button>
        </div>
      </div>

      {/* Segurança */}
      <div className="bg-surface/50 rounded-xl border border-border/50 px-6 py-4">
        <div className="flex items-start gap-3">
          <Shield size={18} className="text-primary-light shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-text-primary mb-1">Segurança</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              Os tokens são salvos localmente no navegador. A conexão com Meta usa permissões de leitura e pode ser removida a qualquer momento.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
