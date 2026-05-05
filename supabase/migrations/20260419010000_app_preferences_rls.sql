-- Allow public read/write on app_preferences.
-- This app uses custom auth (not Supabase Auth), so there's no auth.uid().
-- The table stores non-sensitive UI preferences (column order, disabled accounts, etc).

ALTER TABLE app_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access to app_preferences' AND tablename = 'app_preferences'
  ) THEN
    CREATE POLICY "Allow public access to app_preferences"
      ON app_preferences FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Same for agencies and account_agencies tables
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access to agencies' AND tablename = 'agencies'
  ) THEN
    CREATE POLICY "Allow public access to agencies"
      ON agencies FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE account_agencies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access to account_agencies' AND tablename = 'account_agencies'
  ) THEN
    CREATE POLICY "Allow public access to account_agencies"
      ON account_agencies FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
