import { fetchGoogleAdsAccountOverview } from './googleAdsApi';
import { googleReportPeriods } from '../shared/utils/googleReports';

export async function fetchGoogleReport(account, period, campaignIds = []) {
  if (!account) throw new Error('Selecione uma conta Google disponível.');
  const periods = googleReportPeriods(period, account.timeZone);
  const read = range => fetchGoogleAdsAccountOverview(account.accountId, range, account.loginCustomerId, account.connectionId, campaignIds);
  const [current, previous] = await Promise.all([read(periods.current), read(periods.previous)]);
  return { current, previous, period: periods.current };
}
