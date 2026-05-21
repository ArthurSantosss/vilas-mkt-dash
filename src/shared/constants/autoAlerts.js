export const AUTO_ALERTS_STORAGE_KEY = 'auto_alerts_thresholds';

export const DEFAULT_AUTO_ALERT_THRESHOLDS = {
  balance_critical: 50,
  balance_warning: 150,
  high_cost_lead: 25,
};

export const AUTO_ALERT_REMINDER_HOURS = [12];

function normalizePositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normalizeAutoAlertThresholds(value) {
  const source = value && typeof value === 'object' ? value : {};

  return {
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
}
