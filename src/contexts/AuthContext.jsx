import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { loadCloudSnapshot, saveCloudSnapshot } from '../shared/utils/cloudBackup';

const AuthContext = createContext();

const AUTH_KEY = 'vilasmkt_auth';

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
            return await saveCloudSnapshot(supabase, email);
        } catch (e) {
            console.error('Erro ao sincronizar com nuvem:', e);
            return false;
        }
    }, []);

    const loadFromCloud = useCallback(async (email) => {
        try {
            const { hasBackup } = await loadCloudSnapshot(supabase, email);
            return hasBackup;
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
