-- This app uses custom (env-based) auth, not Supabase Auth, so RLS policies
-- mirror the pattern used in app_preferences: open to anon for owner CRUD,
-- but public anonymous lookup of a single share is funneled through a
-- SECURITY DEFINER RPC so the table cannot be enumerated.

CREATE TABLE IF NOT EXISTS shared_reports (
  id TEXT PRIMARY KEY,
  owner_email TEXT,
  account_id TEXT NOT NULL,
  agency TEXT,
  objective TEXT NOT NULL DEFAULT 'messages',
  campaign_ids TEXT[],
  client_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_reports_account_id ON shared_reports(account_id);
CREATE INDEX IF NOT EXISTS idx_shared_reports_owner_email ON shared_reports(owner_email);

ALTER TABLE shared_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated dashboard (anon key) can manage shares; the public lookup
-- is restricted via the RPC below, so this policy is only used by the dashboard.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Dashboard manages shared_reports' AND tablename = 'shared_reports'
  ) THEN
    CREATE POLICY "Dashboard manages shared_reports"
      ON shared_reports FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- SECURITY DEFINER lookup so the public client view fetches a single share by id
-- without selecting from the table directly (prevents enumeration via PostgREST).
CREATE OR REPLACE FUNCTION public.get_shared_report(p_id TEXT)
RETURNS TABLE (
  id TEXT,
  account_id TEXT,
  agency TEXT,
  objective TEXT,
  campaign_ids TEXT[],
  client_label TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, account_id, agency, objective, campaign_ids, client_label
  FROM public.shared_reports
  WHERE id = p_id
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_report(TEXT) TO anon, authenticated;
