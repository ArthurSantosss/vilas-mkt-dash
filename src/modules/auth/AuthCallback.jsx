import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';

export default function AuthCallback() {
    const navigate = useNavigate();
    const [status] = useState('Conectando sua conta...');

    useEffect(() => {
        const saveTokensAndSync = async (session) => {
            if (!session?.provider_token) return;

            const provider = session.user?.app_metadata?.provider || 'unknown';

            if (provider === 'facebook') {
                localStorage.setItem('meta_provider_token', session.provider_token);
                console.log('✅ Token Meta salvo com sucesso');
            } else if (provider === 'google') {
                localStorage.setItem('google_provider_token', session.provider_token);
                localStorage.setItem('google_calendar_token', session.provider_token);
                if (session.provider_refresh_token) {
                    localStorage.setItem('google_provider_refresh_token', session.provider_refresh_token);
                }
                window.dispatchEvent(new Event('storage'));
                console.log('✅ Token Google salvo com sucesso');
            }
        };

        const handleCallback = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.error('Erro no callback de autenticação:', error);
                    navigate('/configuracoes', { replace: true });
                    return;
                }

                if (session) {
                    await saveTokensAndSync(session);
                    navigate('/configuracoes', { replace: true });
                } else {
                    // Sem sessão — tentar aguardar
                    setTimeout(async () => {
                        const { data: { session: retrySession } } = await supabase.auth.getSession();
                        if (retrySession) {
                            await saveTokensAndSync(retrySession);
                        }
                        navigate('/configuracoes', { replace: true });
                    }, 1500);
                }
            } catch (err) {
                console.error('Erro inesperado no callback:', err);
                navigate('/configuracoes', { replace: true });
            }
        };

        handleCallback();
    }, [navigate]);

    return (
        <div className="min-h-screen bg-bg flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-text-secondary text-sm font-medium">{status}</p>
                <p className="text-text-secondary/50 text-xs">Buscando contas de anúncio...</p>
            </div>
        </div>
    );
}
