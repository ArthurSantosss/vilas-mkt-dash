import { createContext, useContext, useState, useEffect } from 'react';
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
  'meta_accounts',
  'disabled_accounts',
  'meta_provider_token'
];

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Restaurar sessão do localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem(AUTH_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed?.email && parsed?.loggedAt) {
                    setUser(parsed);
                }
            }
        } catch { /* ignore */ }
        setIsLoading(false);
    }, []);

    const syncToCloud = async (email) => {
        try {
            const upserts = [];
            for (const key of BACKUP_KEYS) {
                const localStr = localStorage.getItem(key);
                if (localStr !== null && localStr !== 'undefined' && localStr !== '') {
                    try {
                        const localParsed = key === 'meta_provider_token' ? localStr : JSON.parse(localStr);
                        upserts.push({ key: `${email}_${key}`, value: localParsed, updated_at: new Date().toISOString() });
                    } catch {}
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
    };

    const loadFromCloud = async (email) => {
        try {
            const { data } = await supabase.from('app_preferences').select('key, value').like('key', `${email}_%`);
            if (data && data.length > 0) {
                data.forEach(row => {
                    const originalKey = row.key.replace(`${email}_`, '');
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
    };

    const signIn = async (email, password) => {
        const normalizedEmail = email.trim().toLowerCase();
        const authorizedEmail = import.meta.env.VITE_AUTH_EMAIL;
        const authorizedPass = import.meta.env.VITE_AUTH_PASS;

        if (!authorizedEmail || !authorizedPass) {
            throw new Error('Credenciais de autenticação não configuradas. Verifique o arquivo .env');
        }

        if (normalizedEmail !== authorizedEmail.toLowerCase() || password !== authorizedPass) {
            throw new Error('Email ou senha incorretos.');
        }

        // Antes de finalizar o login, descarrega a nuvem pro celular
        await loadFromCloud(normalizedEmail);

        const userData = {
            email: normalizedEmail,
            name: 'Gestor',
            loggedAt: new Date().toISOString(),
        };

        localStorage.setItem(AUTH_KEY, JSON.stringify(userData));
        setUser(userData);
    };

    const signOut = async () => {
        if (user?.email) {
            await syncToCloud(user.email);
        }
        localStorage.removeItem(AUTH_KEY);
        setUser(null);
    };

    const value = {
        user,
        isLoading,
        signIn,
        signOut,
        syncToCloud,
        loadFromCloud
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
