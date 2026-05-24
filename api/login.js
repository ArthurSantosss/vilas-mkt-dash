import crypto from 'node:crypto';
import { getConfiguredAuth, setAuthCookie } from './_auth.js';

function hashValue(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest();
}

function safeCompare(left, right) {
    const leftHash = hashValue(left);
    const rightHash = hashValue(right);
    return crypto.timingSafeEqual(leftHash, rightHash);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        let body;
        if (typeof req.body === 'string') {
            body = JSON.parse(req.body);
        } else {
            body = req.body;
        }

        const { email, password } = body;

        const normalizedEmail = (email || '').trim().toLowerCase();
        const { authorizedEmail, authorizedPass } = getConfiguredAuth();

        if (!authorizedEmail || !authorizedPass) {
            return res.status(500).json({ error: 'Credenciais de autenticação não configuradas no servidor.' });
        }

        if (safeCompare(normalizedEmail, authorizedEmail) && safeCompare(password, authorizedPass)) {
            setAuthCookie(res);
            return res.status(200).json({ success: true, email: normalizedEmail });
        } else {
            return res.status(401).json({ error: 'Email ou senha incorretos.' });
        }
    } catch {
        return res.status(500).json({ error: 'Erro interno ao processar login.' });
    }
}
