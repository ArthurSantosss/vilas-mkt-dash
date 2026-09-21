import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Loader2, Check, AlertTriangle } from 'lucide-react';
import { sendAssistantMessage, confirmAssistantAction } from '../../services/assistantApi';

const WELCOME = {
    role: 'assistant',
    content:
        'Oi! Sou seu assistente do VilasMKT. Posso consultar as contas dos seus clientes, comparar performance, sugerir melhorias e — com a sua confirmação — pausar/ativar campanhas, ajustar orçamento, criar alertas de saldo e mudar o método de pagamento. Pergunta algo como "como está a conta do cliente X essa semana?" ou "pausa a campanha Y do cliente X".',
};

export default function AssistantWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([WELCOME]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // Estado de cada ação pendente por id: { status: 'pending'|'confirming'|'done'|'cancelled'|'error', message }
    const [actionStates, setActionStates] = useState({});

    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, loading, actionStates]);

    useEffect(() => {
        const handleOpen = () => setIsOpen(true);
        window.addEventListener('open-assistant', handleOpen);
        return () => window.removeEventListener('open-assistant', handleOpen);
    }, []);

    const send = useCallback(async () => {
        const text = input.trim();
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
            setError(err.message || 'Não consegui falar com o assistente.');
        } finally {
            setLoading(false);
        }
    }, [input, loading, messages]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
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
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Ok, ação cancelada. Não alterei nada.' }]);
    }, []);

    const renderActionCard = (action) => {
        const state = actionStates[action.id] || { status: 'pending' };
        return (
            <div key={action.id} className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-primary-light mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-text-primary">{action.summary}</p>
                </div>

                {state.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                        <button
                            type="button"
                            onClick={() => confirmAction(action)}
                            className="flex items-center gap-1.5 rounded-lg bg-primary text-white px-3 py-1.5 text-xs font-medium hover:bg-primary-light transition-colors"
                        >
                            <Check size={14} /> Confirmar
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
                        <Loader2 size={14} className="animate-spin" /> Executando...
                    </div>
                )}
                {state.status === 'done' && (
                    <p className="mt-2 text-xs text-green-400">✅ {state.message}</p>
                )}
                {state.status === 'cancelled' && (
                    <p className="mt-2 text-xs text-text-secondary">Cancelada.</p>
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
                    className="fixed inset-0 z-50 lg:inset-auto lg:bottom-6 lg:right-6 lg:w-[400px] lg:h-[600px] lg:max-h-[80vh] flex flex-col bg-surface lg:rounded-2xl lg:border lg:border-border shadow-2xl overflow-hidden"
                    style={{
                        paddingTop: 'env(safe-area-inset-top, 0px)',
                        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
                        <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary-light">
                                <Sparkles size={18} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-text-primary leading-tight">Assistente VilasMKT</p>
                                <p className="text-xs text-text-secondary leading-tight">Consulta e ações nas contas</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                aria-label="Fechar assistente"
                                className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-hover transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Mensagens */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                        {messages.map((m, i) => (
                            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                                <div className={m.role === 'user' ? 'max-w-[85%]' : 'max-w-[90%]'}>
                                    <div
                                        className={
                                            m.role === 'user'
                                                ? 'rounded-2xl rounded-br-sm bg-primary text-white px-3.5 py-2 text-sm whitespace-pre-wrap'
                                                : 'rounded-2xl rounded-bl-sm bg-surface-hover text-text-primary px-3.5 py-2 text-sm whitespace-pre-wrap'
                                        }
                                    >
                                        {m.content}
                                    </div>
                                    {m.actions?.map((a) => renderActionCard(a))}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-surface-hover text-text-secondary px-3.5 py-2 text-sm">
                                    <Loader2 size={16} className="animate-spin" /> Consultando...
                                </div>
                            </div>
                        )}
                        {error && (
                            <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 text-xs">
                                {error}
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="border-t border-border p-3">
                        <div className="flex items-end gap-2">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={1}
                                placeholder="Pergunte ou peça uma ação..."
                                className="flex-1 resize-none max-h-32 rounded-xl bg-bg border border-border px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary"
                            />
                            <button
                                type="button"
                                onClick={send}
                                disabled={loading || !input.trim()}
                                aria-label="Enviar"
                                className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-white hover:bg-primary-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
