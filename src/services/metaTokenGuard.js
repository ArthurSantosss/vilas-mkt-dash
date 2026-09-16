// Detecção e limpeza de token Meta inválido.
//
// O `meta_provider_token` é um token OAuth de usuário do Facebook guardado no
// localStorage de cada dispositivo e replicado entre dispositivos pelo backup na
// nuvem. Quando o Facebook invalida a sessão (troca de senha, revisão de
// segurança, expiração), o token continua salvo no aparelho e é reenviado em
// toda requisição pelo header `x-meta-token`. Como o proxy dá prioridade ao
// token do cliente sobre o token do servidor, um aparelho com token morto
// (tipicamente o celular, que ficou dias sem reconectar) quebra sozinho
// enquanto o desktop — já reconectado — segue funcionando.
//
// Aqui centralizamos: identificar esse erro, apagar o token morto do aparelho e
// da nuvem (para o login não restaurá-lo de novo) e avisar a aplicação.

import { supabase } from './supabase';
import { purgeCloudKeys } from '../shared/utils/cloudBackup';

export const META_TOKEN_KEY = 'meta_provider_token';
export const META_TOKEN_INVALIDATED_EVENT = 'meta-token-invalidated';

export const META_TOKEN_EXPIRED_MESSAGE =
    'Sua conexão com a Meta expirou neste aparelho (o Facebook invalidou a sessão). '
    + 'Abra Configurações e clique em "Conectar" para reconectar sua conta.';

const AUTH_KEY = 'vilasmkt_auth';

// Erros de OAuth da Meta que significam "esse token não vale mais".
// 190 = token inválido/expirado; 102 = sessão do cliente inválida.
// Subcódigos 458..467 detalham o motivo (app removido, senha alterada, etc.).
const INVALID_TOKEN_CODES = new Set([190, 102]);
const INVALID_TOKEN_SUBCODES = new Set([458, 459, 460, 463, 464, 466, 467, 492]);

function normalizeMetaError(payload) {
    if (!payload) return null;
    if (typeof payload === 'string') return { message: payload };
    if (payload.error && typeof payload.error === 'object') return payload.error;
    if (typeof payload.error === 'string') return { message: payload.error };
    if (payload.message || payload.code) return payload;
    return null;
}

/**
 * Diz se o payload de erro da Meta indica token inválido/expirado.
 * @param {object|string} payload - corpo da resposta de erro (ou mensagem).
 */
export function isInvalidMetaTokenError(payload) {
    const metaError = normalizeMetaError(payload);
    if (!metaError) return false;

    const code = Number(metaError.code);
    const subcode = Number(metaError.error_subcode);

    if (INVALID_TOKEN_CODES.has(code)) return true;
    if (INVALID_TOKEN_SUBCODES.has(subcode)) return true;
    if (metaError.type === 'OAuthException' && !metaError.code) return true;

    const message = String(metaError.message || '').toLowerCase();
    return (
        message.includes('error validating access token')
        || message.includes('session has been invalidated')
        || message.includes('session is invalid')
        || message.includes('access token has expired')
        || message.includes('malformed access token')
    );
}

export function getStoredMetaToken() {
    try {
        const token = localStorage.getItem(META_TOKEN_KEY);
        if (token && token.trim()) return token.trim();
        // Fallback no ambiente de desenvolvimento se houver token no .env
        if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
            const devToken = import.meta.env.VITE_META_ACCESS_TOKEN;
            if (devToken && devToken.trim()) {
                // Popula o localStorage para o backup poder capturar
                localStorage.setItem(META_TOKEN_KEY, devToken.trim());
                return devToken.trim();
            }
        }
        return null;
    } catch {
        return null;
    }
}

function getLoggedEmail() {
    try {
        const parsed = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
        return parsed?.email || null;
    } catch {
        return null;
    }
}

// Várias requisições Meta disparam em paralelo; sem isso, cada uma tentaria
// apagar da nuvem e emitir o evento de novo.
let purgeInFlight = null;

/**
 * Remove o token Meta inválido do aparelho e da nuvem e avisa a aplicação.
 * Idempotente: se não havia token salvo, não faz nada e retorna false.
 * @returns {boolean} true se um token foi de fato removido deste aparelho.
 */
export function clearInvalidMetaToken() {
    const hadToken = !!getStoredMetaToken();
    if (!hadToken) return false;

    try {
        localStorage.removeItem(META_TOKEN_KEY);
    } catch {
        // localStorage indisponível (modo privado): segue mesmo assim.
    }

    // Sem isso o próximo login baixaria o token morto da nuvem outra vez.
    const email = getLoggedEmail();
    if (email && !purgeInFlight) {
        purgeInFlight = purgeCloudKeys(supabase, email, [META_TOKEN_KEY])
            .catch((err) => console.warn('[meta] Falha ao remover token inválido da nuvem:', err))
            .finally(() => { purgeInFlight = null; });
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(META_TOKEN_INVALIDATED_EVENT));
    }

    console.warn('[meta] Token Meta inválido removido deste aparelho; usando o token do servidor.');
    return true;
}
