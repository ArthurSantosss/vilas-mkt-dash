import { isAuthenticatedRequest } from '../_auth.js';
import { AUTOMATIC_REPORTS_KEY, REPORT_RULES, validateReportPeriod, validateReportSelection } from '../../src/shared/constants/automaticReports.js';
import { createReportStore, getReportSetup, collectAgencyReports, sendAgencyReports, listReportAccounts } from '../_automatic-reports.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Método não permitido.' });
  if (!isAuthenticatedRequest(req)) return res.status(401).json({ error: 'Faça login para gerenciar os relatórios.' });
  try {
    const store = createReportStore();
    const clientToken = req.headers['x-meta-token'];
    if (req.method === 'POST') {
      const rule = REPORT_RULES.find(item => item.id === req.body?.agency);
      if (!rule) return res.status(400).json({ error: 'Selecione uma agência válida.' });
      let period;
      let selection;
      try {
        period = validateReportPeriod(req.body?.period);
        selection = validateReportSelection(req.body?.selection);
      } catch (error) { return res.status(400).json({ error: error.message }); }
      if (req.body?.action === 'preview') {
        return res.status(200).json(await collectAgencyReports(rule, selection, { store, period, clientToken }));
      }
      if (req.body?.action === 'send') {
        return res.status(200).json(await sendAgencyReports({ agency: rule.id, selection, period, clientToken, imagePaths: req.body?.imagePaths, store }));
      }
      return res.status(400).json({ error: 'Ação inválida.' });
    }
    const [setup, history, accounts] = await Promise.all([
      getReportSetup(store),
      Promise.all(REPORT_RULES.map(rule => store.get(`${AUTOMATIC_REPORTS_KEY}_last_${rule.id}`))),
      listReportAccounts({ store, clientToken }),
    ]);
    return res.status(200).json({ setup, history, accounts });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Não foi possível carregar os relatórios.' });
  }
}
