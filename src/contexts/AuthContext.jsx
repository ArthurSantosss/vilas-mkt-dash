import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

const AUTH_KEY = 'vilasmkt_auth';

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

        const userData = {
            email: normalizedEmail,
            name: 'Arthur Vilas',
            loggedAt: new Date().toISOString(),
        };

        localStorage.setItem(AUTH_KEY, JSON.stringify(userData));
        setUser(userData);
    };

    const signOut = async () => {
        localStorage.removeItem(AUTH_KEY);
        setUser(null);
    };

    const value = {
        user,
        isLoading,
        signIn,
        signOut,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
