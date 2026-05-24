/* global process */

// api/meta-proxy.js
// Proxy para ocultar o Token da Meta do frontend

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

export default async function handler(req, res) {
    // Apenas permite GET e POST
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Extrai e isola: `path` (rota Meta), `access_token` (caso venha como query — legado/fallback)
    // e o resto vira queryParams reais a serem repassados.
    const { path, access_token: queryToken, ...queryParams } = req.query;
    const headerToken = req.headers['x-meta-token'];

    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }

    if (!String(path).startsWith('/') || !isAllowedMetaPath(String(path))) {
        return res.status(400).json({ error: 'Unsupported Meta API path' });
    }

    // Prioridade: header `x-meta-token` (OAuth do usuário) > query `access_token` (legado) >
    // env do servidor (último recurso). Token nunca aparece em logs do proxy se vier por header.
    const serverToken = process.env.META_ACCESS_TOKEN || process.env.VITE_META_ACCESS_TOKEN;
    const clientToken = headerToken || queryToken;
    const activeToken = clientToken || serverToken;

    if (!activeToken) {
        return res.status(401).json({ error: 'Nenhum token Meta encontrado no servidor ou na requisição.' });
    }

    if (!clientToken && !isAuthenticatedRequest(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Constroi a URL real para a Meta API. `access_token` é adicionado UMA vez aqui;
    // o loop abaixo já não recebe `access_token` porque foi destruturado acima.
    const targetUrl = new URL(`${META_API_BASE}${path.startsWith('/') ? path : '/' + path}`);
    targetUrl.searchParams.append('access_token', activeToken);

    // Repassa os query params se for GET
    if (req.method === 'GET') {
        for (const [key, value] of Object.entries(queryParams)) {
            if (value !== undefined && value !== null) {
                targetUrl.searchParams.append(key, value);
            }
        }
    }

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

        const response = await fetch(targetUrl.toString(), fetchOptions);
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        // Repassa cabeçalhos úteis se necessário, mas envia o json diretamente
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(data);

    } catch (err) {
        console.error('[meta-proxy] Erro:', err);
        return res.status(500).json({ error: 'Erro interno ao contatar a API da Meta', details: err.message });
    }
}
