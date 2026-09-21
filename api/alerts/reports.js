import { isAuthenticatedRequest } from '../_auth.js';
import { AUTOMATIC_REPORTS_KEY, REPORT_RULES, validateReportPeriod } from '../../src/shared/constants/automaticReports.js';
import { createReportStore, getReportSetup, collectAgencyReports, sendAgencyReports } from '../_automatic-reports.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Método não permitido.' });
  if (!isAuthenticatedRequest(req)) return res.status(401).json({ error: 'Faça login para gerenciar os relatórios.' });
  try {
    const store = createReportStore();
    if (req.method === 'POST') {
      const rule = REPORT_RULES.find(item => item.id === req.body?.agency);
      if (!rule) return res.status(400).json({ error: 'Selecione uma agência válida.' });
      let period;
      try { period = validateReportPeriod(req.body?.period); }
      catch (error) { return res.status(400).json({ error: error.message }); }
      const clientToken = req.headers['x-meta-token'];
      if (req.body?.action === 'preview') {
        return res.status(200).json(await collectAgencyReports(rule, { store, period, clientToken }));
      }
      if (req.body?.action === 'send') {
        return res.status(200).json(await sendAgencyReports({ agency: rule.id, period, clientToken, imagePaths: req.body?.imagePaths, store }));
      }
      return res.status(400).json({ error: 'Ação inválida.' });
    }
    const [setup, history, agencyMap] = await Promise.all([
      getReportSetup(store),
      Promise.all(REPORT_RULES.map(rule => store.get(`${AUTOMATIC_REPORTS_KEY}_last_${rule.id}`))),
      store.agencies(),
    ]);
    return res.status(200).json({ setup, history, agencyMap });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Não foi possível carregar os relatórios.' });
  }
}
