import { isAuthenticatedRequest } from '../_auth.js';
import { collectBriefingData } from '../_briefing-data.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  if (!isAuthenticatedRequest(req)) return res.status(401).json({ error: 'Faça login.' });
  try { return res.status(200).json(await collectBriefingData({ clientToken: req.headers['x-meta-token'] })); }
  catch { return res.status(503).json({ error: 'Não foi possível consultar os dados dos alertas. Confira as conexões e tente novamente.' }); }
}
