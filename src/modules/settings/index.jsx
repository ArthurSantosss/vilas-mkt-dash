import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Settings as SettingsIcon, Link2, Unlink, AlertCircle, RefreshCw,
  ToggleLeft, ToggleRight, Building2, Plus, Trash2, LogOut, ChevronDown,
  Download, Upload, CheckCircle2, KeyRound, Infinity as InfinityIcon, Clock
} from 'lucide-react';
import { useAgency } from '../../contexts/AgencyContext';
import { useAuth } from '../../contexts/AuthContext';
import { calculateMetaBalance } from '../../shared/utils/metaBalance';
import { isCreditCardPaymentMethod, readSavedPaymentMethods, getAccountPaymentMethod } from '../../shared/utils/paymentMethod';
import {
  consumeGoogleAdsFlashError,
  loadStoredGoogleAdsAccounts,
  loadStoredGoogleAdsConnection,
  loadDisabledGoogleAdsAccounts,
  toggleGoogleAdsAccount,
  syncGoogleAdsAccounts,
  startGoogleAdsOAuth,
  disconnectGoogleAds,
  getGoogleAdsStatus,
  formatGoogleCustomerId,
} from '../../services/googleAdsApi';
import { exportFullBackupToFile, importFullBackupFromFile } from '../../shared/utils/cloudBackup';
import { getStoredMetaToken, META_TOKEN_INVALIDATED_EVENT, resetDevTokenState } from '../../services/metaTokenGuard';
import {
  getMetaTokens,
  addMetaToken,
  refreshMetaTokens,
  removeMetaToken,
} from '../../services/metaTokensApi';
import { supabase } from '../../services/supabase';
import { MetaIcon, GoogleAdsIcon } from '../../shared/components/PlatformIcons';


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

// Sempre pelo proxy, inclusive em dev: é ele que soma as contas dos tokens de BM
// às do token de perfil. Ir direto à Graph API esconderia metade das contas.
async function fetchMetaProxy(path, token, params = {}) {
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
    const msg = payload?.error?.message || payload?.error || `Erro da Meta API (${response.status})`;
    if (msg.includes('Session has expired') || msg.includes('Error validating access token') || payload?.error?.code === 190) {
      throw new Error('O seu token de acesso da Meta expirou. Gere um novo token no Meta for Developers e clique no botão "Conectar Meta" para atualizar.');
    }
    throw new Error(msg);
  }

  return payload;
}

export default function Settings() {
  const { agencies, accountAgencies, addAgency, removeAgency, setAccountAgency } = useAgency();
  const { user, signOut, syncToCloud } = useAuth();
  const [newAgencyName, setNewAgencyName] = useState('');
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [showOnlyActiveGoogle, setShowOnlyActiveGoogle] = useState(false);
  const [metaAccountsOpen, setMetaAccountsOpen] = useState(false);
  const [googleAccountsOpen, setGoogleAccountsOpen] = useState(false);

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

  const fileInputRef = useRef(null);
  const [backupStatus, setBackupStatus] = useState(null);

  const handleCloudBackup = async () => {
    setBackupStatus({ type: 'cloud', status: 'saving', message: 'Sincronizando com a nuvem...' });
    try {
      const success = await syncToCloud(user.email);
      if (success) {
        setBackupStatus({ type: 'cloud', status: 'success', message: 'Backup salvo na nuvem com sucesso!' });
      } else {
        setBackupStatus({ type: 'cloud', status: 'error', message: 'Erro ao salvar na nuvem (Supabase).' });
      }
    } catch (e) {
      setBackupStatus({ type: 'cloud', status: 'error', message: `Falha: ${e.message}` });
    }
    setTimeout(() => setBackupStatus(null), 4500);
  };

  const handleExportBackup = () => {
    try {
      exportFullBackupToFile();
      setBackupStatus({ type: 'json', status: 'success', message: 'Arquivo .json baixado com sucesso!' });
    } catch (e) {
      setBackupStatus({ type: 'json', status: 'error', message: `Erro ao exportar: ${e.message}` });
    }
    setTimeout(() => setBackupStatus(null), 4500);
  };

  const handleImportBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupStatus({ type: 'json', status: 'saving', message: 'Restaurando arquivo de backup...' });
    try {
      const text = await file.text();
      const res = await importFullBackupFromFile(text, supabase, user?.email);
      setBackupStatus({ type: 'json', status: 'success', message: `Backup restaurado! ${res.keysCount} dados atualizados.` });
      setMetaToken(getStoredMetaToken());
      try { setMetaUser(JSON.parse(localStorage.getItem(STORAGE_KEYS.META_USER))); } catch { setMetaUser(null); }
      try { setMetaAccounts(JSON.parse(localStorage.getItem(STORAGE_KEYS.META_ACCOUNTS)) || []); } catch { setMetaAccounts([]); }
      try { setDisabledAccounts(JSON.parse(localStorage.getItem(STORAGE_KEYS.DISABLED_ACCOUNTS)) || []); } catch { setDisabledAccounts([]); }
      try { setClientLogos(JSON.parse(localStorage.getItem('client_logos')) || {}); } catch { setClientLogos({}); }
      setPaymentMethods(readSavedPaymentMethods());
      refreshGoogleState();
    } catch (err) {
      setBackupStatus({ type: 'json', status: 'error', message: `Erro ao restaurar: ${err.message}` });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setBackupStatus(null), 5000);
    }
  };

  const [metaToken, setMetaToken] = useState(() => getStoredMetaToken());
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
  const [disabledGoogleAccounts, setDisabledGoogleAccounts] = useState(() => loadDisabledGoogleAdsAccounts());
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  const [bmTokens, setBmTokens] = useState([]);
  const [bmTokensError, setBmTokensError] = useState(null);
  const [loadingBmTokens, setLoadingBmTokens] = useState(false);
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [newTokenValue, setNewTokenValue] = useState('');

  const [disabledAccounts, setDisabledAccounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.DISABLED_ACCOUNTS)) || []; } catch { return []; }
  });

  useEffect(() => {
    const handleTokenInvalidated = () => {
      setMetaToken(null);
      setMetaUser(null);
    };
    window.addEventListener(META_TOKEN_INVALIDATED_EVENT, handleTokenInvalidated);
    return () => window.removeEventListener(META_TOKEN_INVALIDATED_EVENT, handleTokenInvalidated);
  }, []);

  const refreshGoogleState = useCallback(() => {
    setGoogleConnection(loadStoredGoogleAdsConnection());
    setGoogleAccounts(loadStoredGoogleAdsAccounts());
    setDisabledGoogleAccounts(loadDisabledGoogleAdsAccounts());
  }, []);

  const loadBmTokens = useCallback(async () => {
    try {
      setBmTokensError(null);
      setBmTokens(await getMetaTokens());
    } catch (err) {
      // Sem a migração aplicada o painel segue no token de perfil; só avisamos aqui.
      setBmTokensError(err.message);
    }
  }, []);

  useEffect(() => { loadBmTokens(); }, [loadBmTokens]);

  const handleAddBmToken = useCallback(async () => {
    if (!newTokenLabel.trim() || !newTokenValue.trim()) return;
    setLoadingBmTokens(true);
    setBmTokensError(null);
    try {
      setBmTokens(await addMetaToken({ label: newTokenLabel.trim(), token: newTokenValue.trim() }));
      setNewTokenLabel('');
      setNewTokenValue('');
      window.dispatchEvent(new Event('meta-token-updated'));
    } catch (err) {
      setBmTokensError(err.message);
    } finally {
      setLoadingBmTokens(false);
    }
  }, [newTokenLabel, newTokenValue]);

  const handleRefreshBmTokens = useCallback(async () => {
    setLoadingBmTokens(true);
    setBmTokensError(null);
    try {
      setBmTokens(await refreshMetaTokens());
      window.dispatchEvent(new Event('meta-token-updated'));
    } catch (err) {
      setBmTokensError(err.message);
    } finally {
      setLoadingBmTokens(false);
    }
  }, []);

  const handleRemoveBmToken = useCallback(async (id, label) => {
    if (!window.confirm(`Remover o token "${label}"? As contas cobertas por ele voltam a depender do token do seu perfil.`)) return;
    setLoadingBmTokens(true);
    setBmTokensError(null);
    try {
      setBmTokens(await removeMetaToken(id));
      window.dispatchEvent(new Event('meta-token-updated'));
    } catch (err) {
      setBmTokensError(err.message);
    } finally {
      setLoadingBmTokens(false);
    }
  }, []);

  const bmCoveredAccountIds = useMemo(() => {
    const ids = new Set();
    for (const connection of bmTokens) {
      for (const account of connection.accounts || []) ids.add(account.id);
    }
    return ids;
  }, [bmTokens]);

  const toggleGoogleAccount = useCallback((accountId) => {
    setDisabledGoogleAccounts(toggleGoogleAdsAccount(accountId));
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
      setLoadingGoogle(true);
      setError(null);
      await syncGoogleAdsAccounts();
      refreshGoogleState();
    } catch (err) {
      console.error('Erro ao buscar contas Google Ads:', err);
      setError(err.message);
    } finally {
      setLoadingGoogle(false);
    }
  }, [refreshGoogleState]);

  const handleConnectGoogleAds = async () => {
    setError(null);
    setLoadingGoogle(true);
    try { await startGoogleAdsOAuth(); }
    catch (err) { setError(err.message); setLoadingGoogle(false); }
  };

  const handleDisconnectGoogleAds = async (connectionId) => {
    try {
      setLoadingGoogle(true);
      setError(null);
      await disconnectGoogleAds(connectionId);
      refreshGoogleState();
    } catch (err) {
      console.error('Erro ao desconectar Google Ads:', err);
      setError(err.message);
    } finally {
      setLoadingGoogle(false);
    }
  };

  useEffect(() => {
    getGoogleAdsStatus().then(refreshGoogleState).catch(err => setError(err.message));
  }, [refreshGoogleState]);

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
        resetDevTokenState();
        setMetaToken(trimmed);
        localStorage.setItem(STORAGE_KEYS.META_TOKEN, trimmed);
        window.dispatchEvent(new Event('meta-token-updated'));
        window.dispatchEvent(new CustomEvent('local-storage-map-updated'));
        await fetchMetaAccounts(trimmed);
        if (user?.email) await syncToCloud(user.email);
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
      const token = window.prompt('Cole o novo token de acesso da Meta:');
      if (token && token.trim()) {
        const trimmed = token.trim();
        resetDevTokenState();
        setMetaToken(trimmed);
        localStorage.setItem(STORAGE_KEYS.META_TOKEN, trimmed);
        window.dispatchEvent(new Event('meta-token-updated'));
        window.dispatchEvent(new CustomEvent('local-storage-map-updated'));
        await fetchMetaAccounts(trimmed);
        if (user?.email) await syncToCloud(user.email);
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
          window.dispatchEvent(new Event('meta-token-updated'));
          window.dispatchEvent(new CustomEvent('local-storage-map-updated'));
          fetchMetaAccounts(token).finally(() => {
            if (user?.email) syncToCloud(user.email);
          });
        } else {
          setLoadingMeta(false);
        }
      },
      { scope: 'ads_read,read_insights,business_management' }
    );
  };

  const handleDisconnectMeta = async () => {
    setMetaToken(null);
    setMetaUser(null);
    setMetaAccounts([]);
    localStorage.removeItem(STORAGE_KEYS.META_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.META_USER);
    localStorage.removeItem(STORAGE_KEYS.META_ACCOUNTS);
    window.dispatchEvent(new Event('meta-token-updated'));
    window.dispatchEvent(new CustomEvent('local-storage-map-updated'));
    if (user?.email) await syncToCloud(user.email);
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

  const sortedGoogleAccounts = useMemo(() => {
    return [...googleAccounts].sort((a, b) => {
      const aAgency = (accountAgencies[a.accountId] || '').trim().toLowerCase() || '\uffff';
      const bAgency = (accountAgencies[b.accountId] || '').trim().toLowerCase() || '\uffff';
      const agencyCmp = aAgency.localeCompare(bAgency, 'pt-BR');
      if (agencyCmp !== 0) return agencyCmp;
      return (a.name || a.accountId || '').localeCompare((b.name || b.accountId || ''), 'pt-BR');
    });
  }, [accountAgencies, googleAccounts]);

  const displayedGoogleAccounts = showOnlyActiveGoogle
    ? sortedGoogleAccounts.filter(a => !disabledGoogleAccounts.includes(String(a.accountId)))
    : sortedGoogleAccounts;

  const activeGoogleCount = googleAccounts.filter(a => !disabledGoogleAccounts.includes(String(a.accountId))).length;

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

      {/* ═══ META ADS — conexão, tokens de BM e contas no mesmo quadro ═══ */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="bg-gradient-to-r from-[#1877F2]/5 to-transparent px-4 py-4 sm:px-6 border-b border-border/50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#1877F2]/10 flex items-center justify-center">
              <MetaIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Meta Ads</h2>
              <p className="text-xs text-text-secondary">Conexão, tokens e contas de anúncio</p>
            </div>
          </div>
          <StatusBadge connected={!!metaToken || bmTokens.length > 0} />
        </div>

        <div className="divide-y divide-border/50">
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

          <div>
          <div className="flex flex-col gap-4 border-b border-border/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#1877F2]/10 flex items-center justify-center shrink-0">
                <KeyRound size={16} className="text-[#1877F2]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary">Tokens de BM (usuário do sistema)</h3>
                <p className="text-xs text-text-secondary">Não vencem e têm prioridade sobre o token do perfil</p>
              </div>
            </div>
            {bmTokens.length > 0 && (
              <button
                onClick={handleRefreshBmTokens}
                disabled={loadingBmTokens}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-primary/30 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={loadingBmTokens ? 'animate-spin' : ''} /> Revalidar tokens
              </button>
            )}
          </div>
          <div className="p-4 space-y-4 sm:p-6">
          {bmTokensError && (
            <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/20 px-3 py-2.5 rounded-lg">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{bmTokensError}</span>
            </div>
          )}

          {bmTokens.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Nenhum token de BM cadastrado. Gere um em Business Settings → Usuários → Usuários do sistema → Gerar novo token,
              com as permissões <span className="font-mono text-text-primary">ads_read</span> e{' '}
              <span className="font-mono text-text-primary">business_management</span>.
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {bmTokens.map((connection) => (
                <div key={connection.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary">{connection.label}</span>
                      {connection.neverExpires ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border bg-success/10 text-success border-success/20">
                          <InfinityIcon size={11} /> Não vence
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border bg-warning/10 text-warning border-warning/20">
                          <Clock size={11} /> {connection.expiresAt ? `Vence em ${new Date(connection.expiresAt).toLocaleDateString('pt-BR')}` : 'Com validade'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      {connection.metaUserName || 'Usuário do sistema'} · {connection.accountCount} conta(s) cobertas
                    </p>
                    {connection.warning && (
                      <p className="mt-1 text-xs text-warning">{connection.warning}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveBmToken(connection.id, connection.label)}
                    disabled={loadingBmTokens}
                    className="inline-flex items-center gap-1.5 self-start text-xs text-danger hover:text-danger/80 disabled:opacity-50"
                  >
                    <Trash2 size={13} /> Remover
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-border/50 pt-4 sm:flex-row">
            <input
              type="text"
              value={newTokenLabel}
              onChange={e => setNewTokenLabel(e.target.value)}
              placeholder="Nome (ex.: BM Vilas Marketing)"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-primary sm:w-[240px]"
            />
            <input
              type="password"
              value={newTokenValue}
              onChange={e => setNewTokenValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddBmToken(); }}
              placeholder="Cole aqui o token do usuário do sistema"
              autoComplete="off"
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-primary"
            />
            <button
              onClick={handleAddBmToken}
              disabled={loadingBmTokens || !newTokenLabel.trim() || !newTokenValue.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#1877F2]/15 border border-[#1877F2]/30 text-[#1877F2] rounded-lg text-sm font-medium hover:bg-[#1877F2]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loadingBmTokens ? <span className="w-4 h-4 border-2 border-[#1877F2]/30 border-t-[#1877F2] rounded-full animate-spin" /> : <Plus size={16} />}
              Adicionar
            </button>
          </div>
          <p className="text-[11px] text-text-secondary/70">
            O token é guardado apenas no servidor e nunca volta para o navegador nem entra no backup .json.
          </p>
          </div>
          </div>

          {metaAccounts.length > 0 && (
            <div>
              <div className="flex flex-col gap-4 border-b border-border/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <button
                  type="button"
                  onClick={() => setMetaAccountsOpen(v => !v)}
                  aria-expanded={metaAccountsOpen}
                  className="flex items-center gap-3 text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#1877F2]/10 flex items-center justify-center shrink-0">
                    <MetaIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Contas de anúncio</h3>
                    <p className="text-xs text-text-secondary">{metaAccountsOpen ? 'Ordenadas por agencia (sem agencia no final)' : `${metaAccounts.length} conta(s) — clique para expandir`}</p>
                  </div>
                  <ChevronDown size={16} className={`text-text-secondary shrink-0 transition-transform group-hover:text-text-primary ${metaAccountsOpen ? 'rotate-180' : ''}`} />
                </button>
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                    {metaAccountsOpen && <button
                      onClick={() => setShowOnlyActive(v => !v)}
                      className={`w-full sm:w-auto text-xs px-3 py-1.5 rounded-lg border transition-all ${showOnlyActive ? 'bg-primary/15 text-primary-light border-primary/30' : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-primary/30'}`}
                    >
                      {showOnlyActive ? 'Mostrar todas' : 'Ocultar inativas'}
                    </button>}
                    <div className="bg-surface border border-border rounded-lg px-4 py-2 text-sm text-center sm:text-left">
                      <span className="text-text-secondary">Ativas: </span>
                      <span className="font-bold text-text-primary">{activeMetaCount}/{metaAccounts.length}</span>
                    </div>
                  </div>
              </div>
          {!metaAccountsOpen ? null : loadingMeta ? (
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
                        <MetaIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary truncate">{account.name || account.account_id}</p>
                        <div className="flex items-center gap-2 text-xs text-text-secondary flex-wrap">
                          <span className="font-mono">{account.account_id}</span>
                          <span>•</span>
                          <span className={status.color}>{status.label}</span>
                          <span>•</span>
                          {bmCoveredAccountIds.has(account.id) ? (
                            <span className="inline-flex items-center gap-1 text-success" title="Consultada com o token de usuário do sistema da BM (não vence)">
                              <KeyRound size={10} /> Token de BM
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-text-secondary/80" title="Sem token de BM cobrindo esta conta: usa o token do seu perfil, que expira">
                              <KeyRound size={10} /> Token do perfil
                            </span>
                          )}
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
        </div>
      </div>

      {/* ═══ GOOGLE ADS — conexão e contas no mesmo quadro ═══ */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="bg-gradient-to-r from-[#34A853]/5 to-transparent px-4 py-4 sm:px-6 border-b border-border/50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#34A853]/10 flex items-center justify-center">
              <GoogleAdsIcon />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Google Ads</h2>
              <p className="text-xs text-text-secondary">Conexão e contas de anúncio</p>
            </div>
          </div>
          <StatusBadge connected={!!googleConnection} />
        </div>

        <div className="divide-y divide-border/50">
          <div className="p-5 space-y-4">
            <p className="text-sm text-text-secondary">Conecte os perfis Google que têm acesso às suas contas, diretamente ou por MCC.</p>
            {(googleConnection?.profiles || []).map(profile => (
              <div key={profile.id} className="flex items-center gap-3 bg-bg/30 rounded-lg p-3 border border-border/50">
                <GoogleAdsIcon className="w-5 h-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">{profile.userEmail}</p>
                  <p className="text-xs text-text-secondary">{profile.accountCount} conta(s) encontradas</p>
                </div>
                <button onClick={() => handleDisconnectGoogleAds(profile.id)} disabled={loadingGoogle} className="text-xs text-danger disabled:opacity-50" aria-label={`Desconectar ${profile.userEmail}`}>
                  Desconectar
                </button>
              </div>
            ))}
            {(googleConnection?.warnings || []).map((warning, index) => (
              <p key={index} role="alert" className="text-xs text-warning">
                {warning.userEmail}{warning.customerId ? ` — ${warning.customerId}` : ''}: {warning.message}
              </p>
            ))}
            <div className="flex flex-wrap gap-2">
              <button onClick={handleConnectGoogleAds} disabled={loadingGoogle} className="inline-flex items-center gap-2 px-4 py-2 bg-[#34A853] text-white rounded-lg text-sm font-bold disabled:opacity-50">
                <Link2 size={15} /> {googleConnection ? 'Adicionar perfil Google' : 'Conectar Google Ads'}
              </button>
              {googleConnection && <button onClick={fetchGoogleAccounts} disabled={loadingGoogle} className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm disabled:opacity-50">
                <RefreshCw size={14} className={loadingGoogle ? 'animate-spin' : ''} /> Sincronizar contas
              </button>}
            </div>
            {googleConnection && (
              <p className="text-xs text-text-secondary">
                {googleAccounts.length} conta(s) únicas no painel. Contas presentes em mais de um perfil aparecem uma vez.
                {googleAccounts.length > 0 && ' Gerencie agência e ativação na lista abaixo.'}
              </p>
            )}
          </div>

          {googleAccounts.length > 0 && (
            <div>
              <div className="flex flex-col gap-4 border-b border-border/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <button
                  type="button"
                  onClick={() => setGoogleAccountsOpen(v => !v)}
                  aria-expanded={googleAccountsOpen}
                  className="flex items-center gap-3 text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#34A853]/10 flex items-center justify-center shrink-0">
                    <GoogleAdsIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Contas de anúncio</h3>
                    <p className="text-xs text-text-secondary">{googleAccountsOpen ? 'Ordenadas por agencia (sem agencia no final)' : `${googleAccounts.length} conta(s) — clique para expandir`}</p>
                  </div>
                  <ChevronDown size={16} className={`text-text-secondary shrink-0 transition-transform group-hover:text-text-primary ${googleAccountsOpen ? 'rotate-180' : ''}`} />
                </button>
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                    {googleAccountsOpen && <button
                      onClick={() => setShowOnlyActiveGoogle(v => !v)}
                      className={`w-full sm:w-auto text-xs px-3 py-1.5 rounded-lg border transition-all ${showOnlyActiveGoogle ? 'bg-primary/15 text-primary-light border-primary/30' : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-primary/30'}`}
                    >
                      {showOnlyActiveGoogle ? 'Mostrar todas' : 'Ocultar inativas'}
                    </button>}
                    <div className="bg-surface border border-border rounded-lg px-4 py-2 text-sm text-center sm:text-left">
                      <span className="text-text-secondary">Ativas: </span>
                      <span className="font-bold text-text-primary">{activeGoogleCount}/{googleAccounts.length}</span>
                    </div>
                  </div>
              </div>
          {!googleAccountsOpen ? null : loadingGoogle ? (
            <div className="px-6 py-12 text-center">
              <div className="w-8 h-8 border-2 border-[#34A853]/30 border-t-[#34A853] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-text-secondary">Buscando contas de anuncio...</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {displayedGoogleAccounts.map((account) => {
                const accountId = String(account.accountId);
                const isEnabled = !disabledGoogleAccounts.includes(accountId);
                return (
                  <div key={accountId} className={`flex flex-col gap-4 px-4 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:px-6 ${isEnabled ? 'hover:bg-surface-hover/50' : 'opacity-50'}`}>
                    <div className="flex w-full min-w-0 items-start gap-4">
                      <div className="w-8 h-8 rounded-lg bg-[#34A853]/10 flex items-center justify-center shrink-0">
                        <GoogleAdsIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary truncate">{account.name || accountId}</p>
                        <div className="flex items-center gap-2 text-xs text-text-secondary flex-wrap">
                          <span className="font-mono">{formatGoogleCustomerId(accountId)}</span>
                          <span>•</span>
                          <span className={account.unavailable ? 'text-warning' : 'text-success'}>
                            {account.unavailable ? 'Indisponivel' : 'Ativa'}
                          </span>
                          {account.currency && <><span>•</span><span>{account.currency}</span></>}
                          <span>•</span>
                          <span>{account.loginCustomerId ? `MCC ${formatGoogleCustomerId(account.loginCustomerId)}` : 'Acesso direto'}</span>
                          {account.userEmail && <><span>•</span><span className="truncate">{account.userEmail}</span></>}
                        </div>
                      </div>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:ml-4 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                      <div className="flex items-center gap-2 w-full sm:w-[220px]">
                        <input
                          type="text"
                          value={clientLogos[accountId] || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setClientLogos(prev => ({ ...prev, [accountId]: val }));
                          }}
                          onBlur={e => saveClientLogo(accountId, e.target.value)}
                          placeholder="URL da Logo do Cliente"
                          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-primary"
                        />
                        {clientLogos[accountId] && (
                          <img
                            src={clientLogos[accountId]}
                            alt="Logo preview"
                            onError={(e) => { e.target.style.display = 'none'; }}
                            className="w-7 h-7 object-contain rounded border border-border bg-bg/50 p-0.5 shrink-0"
                            style={{ display: 'block' }}
                          />
                        )}
                      </div>

                      {agencies.length > 0 && (
                        <select
                          value={accountAgencies[accountId] || ''}
                          onChange={e => setAccountAgency(accountId, e.target.value)}
                          className="w-full bg-bg border border-border rounded-lg px-2 py-2 text-xs text-text-primary focus:outline-none focus:border-primary sm:w-[150px]"
                        >
                          <option value="">Sem agencia</option>
                          {agencies.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                        </select>
                      )}
                      <button onClick={() => toggleGoogleAccount(accountId)} className="self-end transition-colors sm:self-auto" title={isEnabled ? 'Desativar no dashboard' : 'Ativar no dashboard'}>
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
        </div>
      </div>

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

      {/* Sistema de Backup Completo */}
      <div className="bg-surface/50 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/5 via-surface/40 to-transparent p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary-light">
                <RefreshCw size={20} className={backupStatus?.status === 'saving' ? 'animate-spin' : ''} />
              </div>
              <div>
                <p className="text-base font-semibold text-text-primary">Central de Backup & Sincronização</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Proteja tokens da Meta, contas ativas, metas mensais, anotações, agências e histórico do painel.
                </p>
              </div>
            </div>
          </div>

          {/* Feedback de status */}
          {backupStatus && (
            <div className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-medium border transition-all ${
              backupStatus.status === 'success' ? 'bg-success/10 border-success/30 text-success' :
              backupStatus.status === 'error' ? 'bg-danger/10 border-danger/30 text-danger' :
              'bg-primary/10 border-primary/30 text-primary-light'
            }`}>
              {backupStatus.status === 'success' && <CheckCircle2 size={15} className="shrink-0" />}
              {backupStatus.status === 'error' && <AlertCircle size={15} className="shrink-0" />}
              {backupStatus.status === 'saving' && <RefreshCw size={15} className="animate-spin shrink-0" />}
              <span>{backupStatus.message}</span>
            </div>
          )}

          {/* Botões de Ação de Backup */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <button
              onClick={handleCloudBackup}
              disabled={backupStatus?.status === 'saving'}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold
                bg-primary text-white shadow-md shadow-primary/20 hover:bg-primary-light
                active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={backupStatus?.type === 'cloud' && backupStatus?.status === 'saving' ? 'animate-spin' : ''} />
              Sincronizar Nuvem
            </button>

            <button
              onClick={handleExportBackup}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold
                bg-surface border border-border hover:border-primary/40 text-text-primary hover:text-primary-light
                active:scale-[0.98] transition-all"
            >
              <Download size={14} />
              Baixar Backup (.json)
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold
                bg-surface border border-border hover:border-primary/40 text-text-primary hover:text-primary-light
                active:scale-[0.98] transition-all"
            >
              <Upload size={14} />
              Restaurar Backup (.json)
            </button>

            {/* Input oculto para carregar JSON */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </div>
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

    </div>
  );
}
