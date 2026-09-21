/* global process */
import { runAutomaticReports } from '../_automatic-reports.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await runAutomaticReports();
    return res.status(result.results.some(item => item.status === 'error') ? 502 : 200).json(result);
  } catch {
    return res.status(500).json({ error: 'Não foi possível executar os relatórios automáticos.' });
  }
}
