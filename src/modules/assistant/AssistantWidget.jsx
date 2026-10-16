import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Loader2, Check, AlertTriangle, BarChart3, ShieldAlert, TrendingUp, Search, NotebookPen, History } from 'lucide-react';
import { sendAssistantMessage, confirmAssistantAction } from '../../services/assistantApi';

const WELCOME = {
    role: 'assistant',
    content:
        'Fala, gestor! Sou seu Analista de Tráfego e Performance no VilasMKT.\n\nPosso consultar suas contas conectadas, investigar gargalos e propor ações com evidências.\n\n• Ficha do cliente: objetivo, conversão principal e metas\n• Diagnóstico Meta com comparação de períodos e limitações\n• Visão geral das contas Google Ads\n• Recomendações e decisões guardadas para acompanhamento\n\nComece pela ficha de um cliente ou peça uma análise. As gravações e alterações precisam da sua confirmação.',
};

const QUICK_PROMPTS = [
    {
        icon: BarChart3,
        label: 'Raio-X Geral',
        prompt: 'Faça um ranking e raio-x geral de performance das contas nos últimos 7 dias.',
    },
    {
        icon: ShieldAlert,
        label: 'Revisar Gastos',
        prompt: 'Quais contas merecem revisão de gastos nos últimos 7 dias? Considere metas, volume de resultados e limitações antes de recomendar ações.',
    },
    {
        icon: TrendingUp,
        label: 'Escala Segura',
        prompt: 'Quais contas e campanhas estão com melhor CPL e têm margem para escala segura de orçamento?',
    },
    {
        icon: Search,
        label: 'Diagnóstico de Conta',
        fill: 'Faça um diagnóstico completo do tráfego do cliente ',
    },
    {
        icon: NotebookPen,
        label: 'Ficha do Cliente',
        fill: 'Quero consultar e completar a ficha do cliente ',
    },
    {
        icon: History,
        label: 'Acompanhar Decisões',
        fill: 'Consulte as recomendações e decisões anteriores do cliente ',
    },
];

export default function AssistantWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([WELCOME]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // Estado de cada ação pendente por id: { status: 'pending'|'confirming'|'done'|'cancelled'|'error', message }
    const [actionStates, setActionStates] = useState({});

    const scrollRef = useRef(null);
    const textareaRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, loading, actionStates]);

    useEffect(() => {
        const handleOpen = () => setIsOpen(true);
        window.addEventListener('open-assistant', handleOpen);
        return () => window.removeEventListener('open-assistant', handleOpen);
    }, []);

    const sendMessageWithText = useCallback(async (textToSend) => {
        const text = (textToSend || '').trim();
        if (!text || loading) return;

        const userMsg = { role: 'user', content: text };
        const history = [...messages, userMsg].filter((m) => m !== WELCOME);

        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setError(null);
        setLoading(true);

        try {
            const { reply, pendingActions } = await sendAssistantMessage(
                history.map((m) => ({ role: m.role, content: m.content })),
            );
            setMessages((prev) => [...prev, { role: 'assistant', content: reply, actions: pendingActions }]);
            if (pendingActions?.length) {
                setActionStates((prev) => {
                    const next = { ...prev };
                    pendingActions.forEach((a) => { next[a.id] = { status: 'pending' }; });
                    return next;
                });
            }
        } catch (err) {
            setError(err.message || 'Não consegui falar com o analista de IA.');
        } finally {
            setLoading(false);
        }
    }, [loading, messages]);

    const handleSend = () => {
        sendMessageWithText(input);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleQuickPrompt = (item) => {
        if (item.prompt) {
            sendMessageWithText(item.prompt);
        } else if (item.fill) {
            setInput(item.fill);
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                    textareaRef.current.selectionStart = textareaRef.current.value.length;
                    textareaRef.current.selectionEnd = textareaRef.current.value.length;
                }
            }, 50);
        }
    };

    const confirmAction = useCallback(async (action) => {
        setActionStates((prev) => ({ ...prev, [action.id]: { status: 'confirming' } }));
        try {
            const { ok, message } = await confirmAssistantAction(action);
            if (!ok) throw new Error(message || 'Falha ao executar.');
            setActionStates((prev) => ({ ...prev, [action.id]: { status: 'done', message } }));
            setMessages((prev) => [...prev, { role: 'assistant', content: `✅ ${message}` }]);
        } catch (err) {
            setActionStates((prev) => ({ ...prev, [action.id]: { status: 'error', message: err.message } }));
        }
    }, []);

    const cancelAction = useCallback((action) => {
        setActionStates((prev) => ({ ...prev, [action.id]: { status: 'cancelled' } }));
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Ok, ação cancelada. Não alterei nada nas contas.' }]);
    }, []);

    const renderActionCard = (action) => {
        const state = actionStates[action.id] || { status: 'pending' };
        return (
            <div key={action.id} className="mt-2.5 rounded-xl border border-primary/40 bg-primary/10 p-3.5 shadow-sm">
                <div className="flex items-start gap-2.5">
                    <AlertTriangle size={18} className="text-primary-light mt-0.5 flex-shrink-0" />
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-primary-light block mb-1">
                            Ação Proposta pelo Analista
                        </span>
                        <p className="text-sm text-text-primary leading-snug whitespace-pre-wrap">{action.summary}</p>
                    </div>
                </div>

                {state.status === 'pending' && (
                    <div className="flex gap-2 mt-3 pt-2 border-t border-primary/20">
                        <button
                            type="button"
                            onClick={() => confirmAction(action)}
                            className="flex items-center gap-1.5 rounded-lg bg-primary text-white px-3.5 py-1.5 text-xs font-semibold hover:bg-primary-light transition-colors shadow-sm"
                        >
                            <Check size={14} /> Confirmar Alteração
                        </button>
                        <button
                            type="button"
                            onClick={() => cancelAction(action)}
                            className="rounded-lg bg-surface-hover text-text-secondary px-3 py-1.5 text-xs font-medium hover:text-text-primary transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                )}
                {state.status === 'confirming' && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-text-secondary">
                        <Loader2 size={14} className="animate-spin text-primary-light" /> Executando alteração na conta...
                    </div>
                )}
                {state.status === 'done' && (
                    <p className="mt-2 text-xs font-medium text-emerald-400">✅ {state.message}</p>
                )}
                {state.status === 'cancelled' && (
                    <p className="mt-2 text-xs text-text-secondary">Cancelada pelo gestor.</p>
                )}
                {state.status === 'error' && (
                    <div className="mt-2">
                        <p className="text-xs text-red-400">Erro: {state.message}</p>
                        <button
                            type="button"
                            onClick={() => confirmAction(action)}
                            className="mt-1.5 rounded-lg bg-surface-hover text-text-primary px-3 py-1 text-xs hover:bg-surface transition-colors"
                        >
                            Tentar de novo
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 z-50 lg:inset-auto lg:bottom-6 lg:right-6 lg:w-[440px] lg:h-[640px] lg:max-h-[85vh] flex flex-col bg-surface lg:rounded-2xl lg:border lg:border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                    style={{
                        paddingTop: 'env(safe-area-inset-top, 0px)',
                        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/95 backdrop-blur">
                        <div className="flex items-center gap-2.5">
                            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30 text-primary-light">
                                <Sparkles size={18} />
                                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-surface" />
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-bold text-text-primary leading-tight">Analista de Tráfego IA</p>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary-light border border-primary/30">
                                        COPILOTO
                                    </span>
                                </div>
                                <p className="text-xs text-text-secondary leading-tight mt-0.5">Diagnóstico • Gargalos • Escala</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                aria-label="Fechar assistente"
                                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Mensagens */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
                        {messages.map((m, i) => (
                            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                                <div className={m.role === 'user' ? 'max-w-[85%]' : 'max-w-[92%]'}>
                                    <div
                                        className={
                                            m.role === 'user'
                                                ? 'rounded-2xl rounded-br-sm bg-primary text-white px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed shadow-sm'
                                                : 'rounded-2xl rounded-bl-sm bg-surface-hover text-text-primary px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed border border-border/50 shadow-sm'
                                        }
                                    >
                                        {m.content}
                                    </div>
                                    {m.actions?.map((a) => renderActionCard(a))}
                                </div>
                            </div>
                        ))}

                        {/* Chips de Ações Rápidas (sugestões para o gestor) */}
                        {messages.length === 1 && !loading && (
                            <div className="pt-2">
                                <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-2 px-1">
                                    Análises Rápidas Recomendadas:
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    {QUICK_PROMPTS.map((item, idx) => {
                                        const Icon = item.icon;
                                        return (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => handleQuickPrompt(item)}
                                                className="flex items-center gap-2 p-2.5 rounded-xl border border-border hover:border-primary/50 bg-bg/60 hover:bg-primary/5 text-left transition-all duration-150 group cursor-pointer"
                                            >
                                                <div className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center shrink-0 text-text-secondary group-hover:text-primary-light border border-border/60">
                                                    <Icon size={14} />
                                                </div>
                                                <span className="text-xs font-medium text-text-primary group-hover:text-primary-light leading-tight">
                                                    {item.label}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-sm bg-surface-hover text-text-secondary px-4 py-2.5 text-sm border border-border/40">
                                    <Loader2 size={16} className="animate-spin text-primary-light" />
                                    <span>Analisando métricas e campanhas...</span>
                                </div>
                            </div>
                        )}
                        {error && (
                            <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 px-3.5 py-2.5 text-xs flex items-center gap-2">
                                <AlertTriangle size={15} className="shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="border-t border-border p-3 bg-surface">
                        <div className="flex items-end gap-2">
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={1}
                                placeholder="Pergunte sobre uma conta, CPL, criativos..."
                                className="flex-1 resize-none max-h-32 rounded-xl bg-bg border border-border px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary transition-colors"
                            />
                            <button
                                type="button"
                                onClick={handleSend}
                                disabled={loading || !input.trim()}
                                aria-label="Enviar"
                                className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-white hover:bg-primary-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
