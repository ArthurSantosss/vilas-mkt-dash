import { isAuthenticatedRequest } from '../_auth.js';
import { AUTOMATIC_REPORTS_KEY, REPORT_RULES, validateReportSettings } from '../../src/shared/constants/automaticReports.js';
import { createReportStore, getReportSettings, getReportSetup, collectAgencyReports } from '../_automatic-reports.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'PUT', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Método não permitido.' });
  if (!isAuthenticatedRequest(req)) return res.status(401).json({ error: 'Faça login para gerenciar os relatórios.' });
  try {
    const store = createReportStore();
    if (req.method === 'PUT') {
      let settings;
      try { settings = validateReportSettings(req.body); }
      catch (error) { return res.status(400).json({ error: error.message }); }
      await store.set(AUTOMATIC_REPORTS_KEY, settings);
      return res.status(200).json({ settings });
    }
    if (req.method === 'POST') {
      const rule = REPORT_RULES.find(item => item.id === req.body?.agency);
      if (!rule) return res.status(400).json({ error: 'Selecione uma agência válida.' });
      // Preview only: never uploads images or sends messages to Slack.
      return res.status(200).json(await collectAgencyReports(rule, { store }));
    }
    const [settings, setup, history, agencyMap] = await Promise.all([
      getReportSettings(store), getReportSetup(store),
      Promise.all(REPORT_RULES.map(rule => store.get(`${AUTOMATIC_REPORTS_KEY}_last_${rule.id}`))),
      store.agencies(),
    ]);
    return res.status(200).json({ settings, setup, history, agencyMap });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Não foi possível carregar os relatórios.' });
  }
}
