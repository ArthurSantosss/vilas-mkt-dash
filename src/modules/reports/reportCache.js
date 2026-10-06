// Memory-only cache owned by the reports screen. Never persists client data.
export function createReportCache({ ttl = 5 * 60 * 1000, now = Date.now, limit = 200 } = {}) {
  const entries = new Map();
  return {
    read(key, loader) {
      const id = JSON.stringify(key);
      const existing = entries.get(id);
      if (existing && (existing.pending || now() - existing.savedAt < ttl)) return existing.promise;
      const entry = { pending: true, savedAt: 0 };
      entry.promise = Promise.resolve().then(loader).then(value => {
        entry.pending = false;
        entry.savedAt = now();
        return value;
      }, error => {
        if (entries.get(id) === entry) entries.delete(id);
        throw error;
      });
      entries.delete(id);
      entries.set(id, entry);
      if (entries.size > limit) entries.delete(entries.keys().next().value);
      return entry.promise;
    },
    clear() { entries.clear(); },
  };
}

export function reportScopeKey({ platform, selectedAgency, selectedAccount, selectedPeriod, selectedCampaignIds }) {
  return JSON.stringify([platform, selectedAgency, selectedAccount, selectedPeriod, [...selectedCampaignIds].sort()]);
}
