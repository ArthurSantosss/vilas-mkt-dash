import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Mic, Loader2 } from 'lucide-react';
import { sendAssistantMessage } from '../../services/assistantApi';

const WELCOME = {
    role: 'assistant',
    content:
        'Oi! Sou seu assistente do VilasMKT. Posso consultar as contas dos seus clientes, comparar performance e sugerir melhorias. Pergunta algo como "como está a conta do cliente X essa semana?" ou "qual cliente está com o custo por lead pior?".',
};

// Web Speech API (ditado). Disponível em Chrome/Edge (desktop e Android).
function getSpeechRecognition() {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function AssistantWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([WELCOME]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [listening, setListening] = useState(false);

    const scrollRef = useRef(null);
    const recognitionRef = useRef(null);
    const speechSupported = !!getSpeechRecognition();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || loading) return;

        const userMsg = { role: 'user', content: text };
        // O backend só precisa de role+content; não enviamos a mensagem de boas-vindas.
        const history = [...messages, userMsg].filter((m) => m !== WELCOME);

        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setError(null);
        setLoading(true);

        try {
            const { reply } = await sendAssistantMessage(
                history.map((m) => ({ role: m.role, content: m.content })),
            );
            setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
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

    const toggleVoice = useCallback(() => {
        const SR = getSpeechRecognition();
        if (!SR) return;

        if (listening && recognitionRef.current) {
            recognitionRef.current.stop();
            return;
        }

        const recognition = new SR();
        recognition.lang = 'pt-BR';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        };
        recognition.onend = () => setListening(false);
        recognition.onerror = () => setListening(false);
        recognitionRef.current = recognition;
        setListening(true);
        recognition.start();
    }, [listening]);

    return (
        <>
            {/* Botão flutuante */}
            {!isOpen && (
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    aria-label="Abrir assistente"
                    className="fixed bottom-24 right-4 lg:bottom-6 lg:right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-white shadow-lg shadow-primary/30 hover:bg-primary-light transition-colors"
                >
                    <Sparkles size={24} />
                </button>
            )}

            {/* Painel de chat */}
            {isOpen && (
                <div className="fixed inset-0 z-50 lg:inset-auto lg:bottom-6 lg:right-6 lg:w-[400px] lg:h-[600px] lg:max-h-[80vh] flex flex-col bg-surface lg:rounded-2xl lg:border lg:border-border shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
                        <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary-light">
                                <Sparkles size={18} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-text-primary leading-tight">Assistente VilasMKT</p>
                                <p className="text-xs text-text-secondary leading-tight">Consulta de contas e insights</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            aria-label="Fechar assistente"
                            className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-hover transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Mensagens */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                        {messages.map((m, i) => (
                            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                                <div
                                    className={
                                        m.role === 'user'
                                            ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-white px-3.5 py-2 text-sm whitespace-pre-wrap'
                                            : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-hover text-text-primary px-3.5 py-2 text-sm whitespace-pre-wrap'
                                    }
                                >
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-surface-hover text-text-secondary px-3.5 py-2 text-sm">
                                    <Loader2 size={16} className="animate-spin" />
                                    Consultando...
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
                            {speechSupported && (
                                <button
                                    type="button"
                                    onClick={toggleVoice}
                                    aria-label="Ditar por voz"
                                    className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
                                        listening
                                            ? 'bg-red-500/20 text-red-400 animate-pulse'
                                            : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                                    }`}
                                >
                                    <Mic size={18} />
                                </button>
                            )}
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={1}
                                placeholder={listening ? 'Ouvindo...' : 'Pergunte sobre suas contas...'}
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
