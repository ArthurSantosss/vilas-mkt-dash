import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext();

const AUTH_KEY = 'vilasmkt_auth';

const BACKUP_KEYS = [
  'account_monthly_goals',
  'account_payment_methods',
  'account_last_payments',
  'account_last_payment_sources',
  'account_billing_frequencies',
  'meta_balance_snapshots',
  'custom_account_names',
  'meta_ads_column_order',
  'meta_ad_accounts',
  'disabled_ad_accounts',
  'meta_user_info',
  'google_ads_accounts',
  'google_ads_connection',
  'client_logos',
  'auto_alerts_thresholds'
];
const LEGACY_SENSITIVE_KEYS = ['meta_provider_token'];

function readStoredUser() {
    try {
        const stored = localStorage.getItem(AUTH_KEY);
        if (!stored) return null;

        const parsed = JSON.parse(stored);
        return parsed?.email && parsed?.loggedAt ? parsed : null;
    } catch {
        return null;
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(readStoredUser);
    const isLoading = false;

    const syncToCloud = useCallback(async (email) => {
        try {
            if (LEGACY_SENSITIVE_KEYS.length > 0) {
                await supabase.from('app_preferences').delete().in(
                    'key',
                    LEGACY_SENSITIVE_KEYS.map((key) => `${email}_${key}`)
                );
            }

            const upserts = [];
            for (const key of BACKUP_KEYS) {
                const localStr = localStorage.getItem(key);
                if (localStr !== null && localStr !== 'undefined' && localStr !== '') {
                    try {
                        const localParsed = key === 'meta_provider_token' ? localStr : JSON.parse(localStr);
                        upserts.push({ key: `${email}_${key}`, value: localParsed, updated_at: new Date().toISOString() });
                    } catch {
                        // Ignore invalid local payloads during backup sync.
                    }
                }
            }
            if (upserts.length > 0) {
                await supabase.from('app_preferences').upsert(upserts, { onConflict: 'key' });
                return true;
            }
            return false;
        } catch (e) {
            console.error('Erro ao sincronizar com nuvem:', e);
            return false;
        }
    }, []);

    const loadFromCloud = useCallback(async (email) => {
        try {
            if (LEGACY_SENSITIVE_KEYS.length > 0) {
                await supabase.from('app_preferences').delete().in(
                    'key',
                    LEGACY_SENSITIVE_KEYS.map((key) => `${email}_${key}`)
                );
            }

            const { data } = await supabase.from('app_preferences').select('key, value').like('key', `${email}_%`);
            if (data && data.length > 0) {
                data.forEach(row => {
                    const originalKey = row.key.replace(`${email}_`, '');
                    if (!BACKUP_KEYS.includes(originalKey)) return;
                    const strToSave = originalKey === 'meta_provider_token' ? row.value : JSON.stringify(row.value);
                    localStorage.setItem(originalKey, strToSave);
                });
                return true;
            }
            return false;
        } catch (e) {
            console.error('Erro ao buscar backup na nuvem:', e);
            return false;
        }
    }, []);

    const signIn = useCallback(async (email, password) => {
        const normalizedEmail = email.trim().toLowerCase();

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: normalizedEmail, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erro ao fazer login.');
            }
        } catch (err) {
            throw new Error(err.message || 'Erro ao conectar com o servidor.');
        }

        // Antes de finalizar o login, descarrega a nuvem pro celular
        await loadFromCloud(normalizedEmail);

        const userData = {
            email: normalizedEmail,
            name: 'Gestor',
            loggedAt: new Date().toISOString(),
        };

        localStorage.setItem(AUTH_KEY, JSON.stringify(userData));

        // Força um recarregamento da página para que os contextos AgencyProvider 
        // e MetaAdsProvider leiam o localStorage repopulado pela nuvem!
        window.location.href = '/';
    }, [loadFromCloud]);

    const signOut = useCallback(async () => {
        if (user?.email) {
            await syncToCloud(user.email);
        }
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch {
            // A limpeza principal ainda acontece no cliente.
        }
        localStorage.removeItem(AUTH_KEY);
        setUser(null);
    }, [syncToCloud, user]);

    const value = useMemo(() => ({
        user,
        isLoading,
        signIn,
        signOut,
        syncToCloud,
        loadFromCloud
    }), [user, isLoading, signIn, signOut, syncToCloud, loadFromCloud]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
