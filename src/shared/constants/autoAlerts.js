export const AUTO_ALERTS_STORAGE_KEY = 'auto_alerts_thresholds';

export const DEFAULT_AUTO_ALERT_THRESHOLDS = {
  balance_critical: 50,
  balance_warning: 150,
  high_cost_lead: 25,
  min_spend: 50,
  min_results: 5,
  worsening_percent: 35,
  google_lag_days: 2,
};

export const AUTO_ALERT_REMINDER_HOURS = [12];

function normalizePositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normalizeAutoAlertThresholds(value) {
  const source = value && typeof value === 'object' ? value : {};

  const normalized = {
    balance_critical: normalizePositiveNumber(
      source.balance_critical,
      DEFAULT_AUTO_ALERT_THRESHOLDS.balance_critical,
    ),
    balance_warning: normalizePositiveNumber(
      source.balance_warning,
      DEFAULT_AUTO_ALERT_THRESHOLDS.balance_warning,
    ),
    high_cost_lead: normalizePositiveNumber(
      source.high_cost_lead,
      DEFAULT_AUTO_ALERT_THRESHOLDS.high_cost_lead,
    ),
  };
  for (const key of ['min_spend', 'min_results', 'worsening_percent', 'google_lag_days']) {
    normalized[key] = normalizePositiveNumber(source[key], DEFAULT_AUTO_ALERT_THRESHOLDS[key]);
  }
  normalized.min_results = Math.max(1, Math.ceil(normalized.min_results));
  normalized.google_lag_days = Math.min(14, Math.max(1, Math.floor(normalized.google_lag_days)));
  normalized.balance_warning = Math.max(normalized.balance_critical, normalized.balance_warning);
  return normalized;
}
