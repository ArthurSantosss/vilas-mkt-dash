-- Shared storage for agencies and account-agency mappings.
-- Previously kept only in localStorage, which prevented data from being
-- shared across browsers/environments (localhost vs production).

CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_agencies (
  account_id TEXT PRIMARY KEY,
  agency_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_agencies_name ON account_agencies(agency_name);
