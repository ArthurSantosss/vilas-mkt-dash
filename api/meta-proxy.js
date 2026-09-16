/* global process */

// api/meta-proxy.js
// Proxy para ocultar o Token da Meta do frontend e garantir alta disponibilidade

import { isAuthenticatedRequest } from './_auth.js';

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

// Códigos de OAuth da Meta que significam "esse token não vale mais"
const INVALID_TOKEN_CODES = new Set([190, 102]);
const INVALID_TOKEN_SUBCODES = new Set([458, 459, 460, 463, 464, 466, 467, 492]);

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

export default async function handler(req, res) {
    // Apenas permite GET e POST
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Extrai path e parâmetros
    const { path, access_token: queryToken, ...queryParams } = req.query;
    const headerToken = req.headers['x-meta-token'];

    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }

    if (!String(path).startsWith('/') || !isAllowedMetaPath(String(path))) {
        return res.status(400).json({ error: 'Unsupported Meta API path' });
    }

    // Prioridade: header `x-meta-token` (OAuth do usuário) > query `access_token` (legado) >
    // env do servidor (último recurso).
    const serverToken = process.env.META_ACCESS_TOKEN || process.env.VITE_META_ACCESS_TOKEN;
    const clientToken = headerToken || queryToken;
    const activeToken = clientToken || serverToken;

    if (!activeToken) {
        return res.status(401).json({ error: 'Nenhum token Meta encontrado no servidor ou na requisição.' });
    }

    if (!clientToken && !isAuthenticatedRequest(req)) {
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

        let { response, data } = await callMeta(activeToken);

        // Se o token do cliente falhou e o servidor tem um token válido,
        // refaz com o token do servidor para não deixar o usuário na mão.
        const usedClientToken = activeToken === clientToken;
        if (!response.ok && usedClientToken && isInvalidTokenError(data)) {
            res.setHeader('x-meta-token-invalid', '1');
            if (serverToken && serverToken !== clientToken && isAuthenticatedRequest(req)) {
                ({ response, data } = await callMeta(serverToken));
            }
        }

        if (!response.ok) {
            res.setHeader('Cache-Control', 'no-store');
            return res.status(response.status).json(data);
        }

        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(data);

    } catch (err) {
        console.error('[meta-proxy] Erro:', err);
        return res.status(500).json({ error: 'Erro interno ao contatar a API da Meta', details: err.message });
    }
}
