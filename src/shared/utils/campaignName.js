function collapseSpaces(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripCampaignDates(value) {
  return value
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ')
    .replace(/\s*-\s*$/g, ' ');
}

export function simplifyCampaignName(fullName = '') {
  const originalName = String(fullName || '').trim();
  if (!originalName) return '';

  let cleaned = originalName;
  cleaned = cleaned.replace(/^C\d+\s*-\s*(?:GDM\s*)?/i, '');
  cleaned = cleaned.replace(/\[.*?\]/g, ' ');
  cleaned = stripCampaignDates(cleaned);
  cleaned = collapseSpaces(cleaned);

  if (!cleaned || cleaned.length < 3) {
    return originalName;
  }

  return cleaned;
}

export function simplifyLaquilaCampaignName(fullName = '') {
  const originalName = String(fullName || '').trim();
  if (!originalName) return '';

  let cleaned = simplifyCampaignName(originalName);

  cleaned = cleaned.replace(/\s*-\s*(?:c[oó]pia|copy)\b.*$/i, '');
  cleaned = cleaned.replace(/\s+(?:c[oó]pia|copy)\b.*$/i, '');
  cleaned = cleaned.replace(/\s*-\s*$/g, '');
  cleaned = collapseSpaces(cleaned);

  if (!cleaned || cleaned.length < 3) {
    return simplifyCampaignName(originalName);
  }

  return cleaned;
}
