import { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useMetaAds } from '../../contexts/MetaAdsContext';
import { useGoogleAds } from '../../contexts/GoogleAdsContext';
import { useAnalysisPeriod } from '../../contexts/AnalysisPeriodContext';
import * as metaApi from '../../services/metaApi';
import { fetchGoogleReport } from '../../services/googleReports';
import { googleReportPeriods } from '../../shared/utils/googleReports';
import { PRESETS } from '../../shared/utils/dateUtils';
import { createReportCache, reportScopeKey } from './reportCache';

export const ReportSessionContext = createContext(null);

export function useReportWorkspace() {
  const meta = useMetaAds();
  const { selectedPeriod, setSelectedPeriod } = useAnalysisPeriod();
  const [platform, setPlatform] = useState('meta');
  const [selectedAgency, setSelectedAgency] = useState('__all__');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedCampaignIds, setSelectedCampaignIds] = useState([]);
  const [selectedObjective, setSelectedObjective] = useState('messages');
  const resultVersions = useRef(new Map());
  const [results, setResults] = useState({});
  const [revision, setRevision] = useState(0);
  const [cache] = useState(() => createReportCache());
  const refreshData = useCallback(() => {
    cache.clear();
    resultVersions.current.clear();
    setResults({});
    setRevision(prev => prev + 1);
  }, [cache]);
  const onPlatformChange = useCallback(next => {
    setPlatform(next);
    setSelectedAccount('');
    setSelectedCampaignIds([]);
    setSelectedObjective(next === 'google' ? 'conversions' : 'messages');
  }, []);
  const requests = useMemo(() => {
    const periodKey = period => typeof period === 'object' ? period : [period, new Date().toLocaleDateString('en-CA')];
    return {
      fetchAccountInsights: (id, period, ids = []) => cache.read(['insights', id, periodKey(period), [...ids].sort()], () => metaApi.fetchAccountInsights(id, period, ids)),
      fetchCampaignsWithInsights: (id, period) => cache.read(['campaigns', id, periodKey(period)], () => metaApi.fetchCampaignsWithInsights(id, period)),
      fetchCampaignDailyInsights: (id, period) => cache.read(['daily', id, periodKey(period)], () => metaApi.fetchCampaignDailyInsights(id, period)),
      fetchGoogleReport: (account, period, ids = []) => cache.read(['google', account?.accountId, account?.connectionId, account?.loginCustomerId, account?.timeZone, periodKey(period), [...ids].sort()], () => fetchGoogleReport(account, period, ids)),
    };
  }, [cache]);
  return { platform, onPlatformChange, selectedAgency, setSelectedAgency, selectedAccount, setSelectedAccount,
    selectedCampaignIds, setSelectedCampaignIds, selectedPeriod, setSelectedPeriod, selectedObjective, setSelectedObjective,
    results, setResults, requests, refreshData, revision, resultVersions };
}

export function useReportSession() {
  return useContext(ReportSessionContext);
}

// Resolve presets to dates once per render, so labels and API requests agree.
export function useReportPeriod() {
  const { selectedPeriod, platform, selectedAccount } = useReportSession();
  const google = useGoogleAds();
  const account = google.accounts.find(a => a.id === selectedAccount);
  const range = platform === 'google'
    ? googleReportPeriods(selectedPeriod, account?.timeZone).current
    : typeof selectedPeriod === 'object' ? selectedPeriod : PRESETS.find(p => p.id === selectedPeriod)?.getRange();
  const start = range?.startDate;
  const end = range?.endDate;
  return useMemo(() => start && end ? { type: 'custom', startDate: start, endDate: end } : selectedPeriod, [start, end, selectedPeriod]);
}

export function useReportAccounts() {
  const { platform, selectedAccount, requests, revision } = useReportSession();
  const meta = useMetaAds();
  const google = useGoogleAds();
  const { accounts } = platform === 'google' ? google : meta;
  const account = accounts.find(a => a.id === selectedAccount);
  const period = useReportPeriod();
  const key = JSON.stringify([platform, selectedAccount, period, account?.connectionId, revision]);
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    const read = platform === 'google'
      ? requests.fetchGoogleReport(account, period).then(data => data.current.campaigns || [])
      : requests.fetchCampaignsWithInsights(selectedAccount, period).then(rows => rows.map(c => ({ ...c, metrics: { spend: Number(c.insights?.data?.[0]?.spend || 0) } })));
    read.then(rows => {
      if (!cancelled) setLoaded({ key, campaigns: rows.map(c => ({ ...c, accountId: selectedAccount })) });
    }).catch(error => { if (!cancelled) setLoaded({ key, campaigns: [], error }); });
    return () => { cancelled = true; };
  }, [account, key, period, platform, requests, selectedAccount]);
  return { accounts, campaigns: loaded?.key === key ? loaded.campaigns : [],
    campaignsLoading: Boolean(selectedAccount) && (!account || loaded?.key !== key),
    campaignsError: loaded?.key === key ? loaded.error : null };
}

export function useReportResult(format, extra = '') {
  const session = useReportSession();
  const period = useReportPeriod();
  const key = `${format}:${reportScopeKey({ ...session, selectedPeriod: period })}:${extra}`;
  const { results, setResults, resultVersions } = session;
  const startReport = useCallback(() => {
    const version = Symbol();
    resultVersions.current.set(key, version);
    return value => {
      if (resultVersions.current.get(key) !== version) return;
      setResults(prev => ({ ...Object.fromEntries(Object.entries(prev).filter(([id]) => id !== key).slice(-19)), [key]: value }));
    };
  }, [key, setResults, resultVersions]);
  return [results[key] || null, startReport];
}
