/* global process */

// api/meta-proxy.js
import { isAuthenticatedRequest } from './_auth.js';
import {
    collectRegistryAccounts,
    normalizeAdAccountId,
    readMetaConnectionsSafe,
    resolveConnectionForAccount,
} from './_meta-tokens.js';

const META_API_BASE = 'https://graph.facebook.com/v22.0';
const ALLOWED_PATHS = [
    /^\/me$/,
    /^\/me\/adaccounts$/,
    /^\/[^/]+\/insights$/,
    /^\/[^/]+\/campaigns$/,
    /^\/[^/]+\/adsets$/,
    /^\/[^/]+\/ads$/,
    /^\/[^/]+$/,
];

function isAllowedMetaPath(path) {
    return ALLOWED_PATHS.some((pattern) => pattern.test(path));
}

const INVALID_TOKEN_CODES = new Set([190, 102]);
const INVALID_TOKEN_SUBCODES = new Set([458, 459, 460, 463, 464, 466, 467, 492]);
// Token válido, mas sem acesso àquele objeto: vale tentar o próximo token da lista.
const NO_ACCESS_CODES = new Set([3, 10, 200, 803]);

function isInvalidTokenError(payload) {
    const metaError = payload?.error;
    if (!metaError) return false;

    if (INVALID_TOKEN_CODES.has(Number(metaError.code))) return true;
    if (INVALID_TOKEN_SUBCODES.has(Number(metaError.error_subcode))) return true;

    const message = String(metaError.message || '').toLowerCase();
    return (
        message.includes('error validating access token')
        || message.includes('session has been invalidated')
        || message.includes('access token has expired')
        || message.includes('malformed access token')
    );
}

function isNoAccessError(payload) {
    const metaError = payload?.error;
    if (!metaError) return false;
    if (NO_ACCESS_CODES.has(Number(metaError.code))) return true;
    const message = String(metaError.message || '').toLowerCase();
    return message.includes('unsupported get request') || message.includes('do not have permission');
}

/** Conta de anúncio alvo: vem do próprio caminho ou da dica enviada pelo cliente. */
function resolveTargetAccountId(path, req) {
    const fromPath = String(path).match(/^\/(act_\d+)(\/|$)/);
    if (fromPath) return fromPath[1];
    return normalizeAdAccountId(req.headers['x-meta-account']);
}

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { path, access_token: queryToken, ...queryParams } = req.query;
    const headerToken = req.headers['x-meta-token'];

    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }

    if (!String(path).startsWith('/') || !isAllowedMetaPath(String(path))) {
        return res.status(400).json({ error: 'Unsupported Meta API path' });
    }

    const authenticated = isAuthenticatedRequest(req);
    const serverToken = process.env.META_ACCESS_TOKEN || process.env.VITE_META_ACCESS_TOKEN;
    const clientToken = headerToken || queryToken;

    // Tokens de BM só são usados em sessão autenticada: eles nunca trafegam para o navegador.
    const connections = authenticated ? await readMetaConnectionsSafe() : [];

    if (!clientToken && !serverToken && connections.length === 0) {
        return res.status(401).json({ error: 'Nenhum token Meta encontrado no servidor ou na requisição.' });
    }

    if (!clientToken && !authenticated) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const basePath = path.startsWith('/') ? path : '/' + path;
    const buildTargetUrl = (token) => {
        const targetUrl = new URL(`${META_API_BASE}${basePath}`);
        targetUrl.searchParams.append('access_token', token);

        if (req.method === 'GET') {
            for (const [key, value] of Object.entries(queryParams)) {
                if (value !== undefined && value !== null) {
                    targetUrl.searchParams.append(key, value);
                }
            }
        }
        return targetUrl;
    };

    try {
        const fetchOptions = {
            method: req.method,
            headers: {
                'Accept': 'application/json',
            }
        };

        if (req.method === 'POST') {
            fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            if (req.body) {
                if (typeof req.body === 'string') {
                    fetchOptions.body = req.body;
                } else {
                    const formData = new URLSearchParams();
                    for (const [key, value] of Object.entries(req.body)) {
                        formData.append(key, value);
                    }
                    fetchOptions.body = formData.toString();
                }
            }
        }

        const callMeta = async (token) => {
            const response = await fetch(buildTargetUrl(token).toString(), fetchOptions);
            const text = await response.text();
            let data = {};
            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                data = { raw: text };
            }
            return { response, data };
        };

        // A união das contas de todos os tokens de BM mais as do token de perfil.
        // É isso que faz as contas da GDM (sem token de BM) continuarem aparecendo.
        if (basePath === '/me/adaccounts' && connections.length > 0) {
            const merged = new Map();
            const errors = [];

            for (const account of collectRegistryAccounts(connections)) {
                const id = normalizeAdAccountId(account.id);
                if (id) merged.set(id, account);
            }

            const fallbackToken = clientToken || serverToken;
            if (fallbackToken) {
                try {
                    const { response, data } = await callMeta(fallbackToken);
                    if (response.ok) {
                        for (const account of data.data || []) {
                            const id = normalizeAdAccountId(account.id);
                            // Dados do registro têm prioridade: vieram do token que de fato consulta a conta.
                            if (id && !merged.has(id)) merged.set(id, account);
                        }
                    } else {
                        if (isInvalidTokenError(data) && fallbackToken === clientToken) {
                            res.setHeader('x-meta-token-invalid', '1');
                        }
                        errors.push(data?.error?.message || 'Falha ao ler as contas do token de perfil.');
                    }
                } catch (err) {
                    errors.push(err.message);
                }
            }

            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json({
                data: [...merged.values()],
                ...(errors.length ? { warnings: errors } : {}),
            });
        }

        const targetAccountId = resolveTargetAccountId(basePath, req);
        const matched = resolveConnectionForAccount(connections, targetAccountId);

        // Ordem: token da BM que cobre a conta → token de perfil → token do servidor →
        // demais tokens de BM (só quando não dá para saber a conta pelo caminho).
        const candidates = [];
        const pushCandidate = (token, source) => {
            if (!token || candidates.some((candidate) => candidate.token === token)) return;
            candidates.push({ token, source });
        };

        if (matched) pushCandidate(matched.token, 'registry');
        pushCandidate(clientToken, 'client');
        pushCandidate(serverToken, 'server');
        if (!targetAccountId) {
            for (const connection of connections) pushCandidate(connection.token, 'registry');
        }

        if (candidates.length === 0) {
            return res.status(401).json({ error: 'Nenhum token Meta encontrado no servidor ou na requisição.' });
        }

        let attempt = null;
        for (const candidate of candidates) {
            attempt = { ...(await callMeta(candidate.token)), candidate };
            if (attempt.response.ok) break;

            const invalid = isInvalidTokenError(attempt.data);
            if (invalid && candidate.source === 'client') {
                res.setHeader('x-meta-token-invalid', '1');
            }
            // Só insiste quando o problema é do token; erro de negócio para aqui.
            if (!invalid && !isNoAccessError(attempt.data)) break;
        }

        const { response, data } = attempt;

        res.setHeader('Cache-Control', 'no-store');
        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        return res.status(200).json(data);

    } catch (err) {
        console.error('[meta-proxy] Erro:', err);
        return res.status(500).json({ error: 'Erro interno ao contatar a API da Meta', details: err.message });
    }
}
