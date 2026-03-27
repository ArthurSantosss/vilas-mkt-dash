import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AlertCircle, Zap, BarChart3, Bell, LogIn, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
    const { user, isLoading: authLoading, signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Se já está logado, redirecionar
    if (authLoading) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center">
                <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (user) {
        return <Navigate to="/" replace />;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !password) {
            setError('Preencha todos os campos.');
            return;
        }
        try {
            setError(null);
            setLoading(true);
            await signIn(email, password);
        } catch (err) {
            setError(err.message || 'Erro ao fazer login.');
            setLoading(false);
        }
    };

    const features = [
        { icon: Zap, title: 'Métricas em tempo real', description: 'Acompanhe o desempenho de todas as suas campanhas instantaneamente' },
        { icon: Bell, title: 'Alertas automáticos', description: 'Receba notificações quando saldos estiverem baixos ou campanhas pausarem' },
        { icon: BarChart3, title: 'Controle de saldos', description: 'Visualize saldos e estimativas de duração de todas as contas' },
    ];

    return (
        <div className="min-h-screen flex">
            {/* ── Coluna Esquerda: Branding ── */}
            <div className="hidden lg:flex lg:w-[60%] relative overflow-hidden">
                {/* Fundo com gradiente */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#0F1117] via-[#151821] to-[#1A1D27]" />

                {/* Padrão decorativo */}
                <div className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(10, 140, 150, 0.5) 1px, transparent 0)',
                        backgroundSize: '40px 40px',
                    }}
                />

                {/* Glow effects */}
                <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-primary-light/5 rounded-full blur-[100px]" />

                {/* Conteúdo */}
                <div className="relative z-10 flex flex-col justify-center px-16 xl:px-24 max-w-2xl">
                    {/* Logo */}
                    <div className="mb-12">
                        <img
                            src="/favicon.png"
                            alt="Vilas Growth Marketing"
                            className="w-40 drop-shadow-[0_0_30px_rgba(15,165,174,0.2)]"
                        />
                    </div>

                    {/* Tagline */}
                    <h1 className="text-4xl xl:text-5xl font-bold text-text-primary leading-tight mb-6">
                        Gerencie todas as suas
                        <span className="block mt-1 bg-gradient-to-r from-primary to-primary-light bg-clip-text text-transparent">
                            contas de anúncio
                        </span>
                        em um só lugar
                    </h1>

                    <p className="text-text-secondary text-lg mb-12 leading-relaxed">
                        Centralize suas campanhas Meta Ads em um único painel.
                        Tome decisões baseadas em dados reais.
                    </p>

                    {/* Features */}
                    <div className="space-y-6">
                        {/* eslint-disable-next-line no-unused-vars -- Icon is used in JSX */}
                        {features.map(({ icon: Icon, title, description }) => (
                            <div key={title} className="flex items-start gap-4 group">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                                    <Icon size={18} className="text-primary-light" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-text-primary mb-0.5">{title}</h3>
                                    <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Coluna Direita: Formulário de Login ── */}
            <div className="w-full lg:w-[40%] flex items-center justify-center p-8 bg-bg relative">
                {/* Borda sutil entre colunas */}
                <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-border to-transparent" />

                <div className="w-full max-w-md">
                    {/* Header mobile */}
                    <div className="lg:hidden flex justify-center mb-8">
                        <img
                            src="/favicon.png"
                            alt="Vilas Growth Marketing"
                            className="w-28 drop-shadow-[0_0_20px_rgba(15,165,174,0.2)]"
                        />
                    </div>

                    {/* Card de Login */}
                    <div className="bg-surface rounded-2xl border border-border p-8 shadow-2xl shadow-black/20 backdrop-blur-sm">
                        <div className="text-center mb-8">
                            <h1 className="text-2xl font-bold text-text-primary mb-2">
                                Bem-vindo ao Painel
                            </h1>
                            <p className="text-sm text-text-secondary">
                                Faça login para acessar a plataforma
                            </p>
                        </div>

                        {/* Erro */}
                        {error && (
                            <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/20 px-4 py-3 rounded-xl mb-6">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>{error}</span>
                                <button
                                    onClick={() => setError(null)}
                                    className="ml-auto text-danger/60 hover:text-danger text-xs font-bold"
                                >
                                    ✕
                                </button>
                            </div>
                        )}

                        {/* Formulário */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Email */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="seu@email.com"
                                    autoComplete="email"
                                    className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary/40
                                        focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50
                                        transition-all duration-200"
                                />
                            </div>

                            {/* Senha */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                                    Senha
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        autoComplete="current-password"
                                        className="w-full bg-bg border border-border rounded-xl px-4 py-3 pr-11 text-sm text-text-primary placeholder:text-text-secondary/40
                                            focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50
                                            transition-all duration-200"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary/50 hover:text-text-secondary transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            {/* Botão Login */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 mt-2 rounded-xl font-semibold text-sm
                                    bg-gradient-to-r from-primary to-primary-light text-white
                                    shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30
                                    hover:scale-[1.01] active:scale-[0.99]
                                    disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                                    transition-all duration-200"
                            >
                                {loading ? (
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <LogIn size={18} />
                                )}
                                {loading ? 'Entrando...' : 'Entrar'}
                            </button>
                        </form>
                    </div>

                    {/* Footer */}
                    <p className="text-center text-[11px] text-text-secondary/40 mt-6 tracking-wide">
                        Vilas Growth Marketing © {new Date().getFullYear()}
                    </p>
                </div>
            </div>
        </div>
    );
}
