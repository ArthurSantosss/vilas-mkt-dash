CREATE TABLE IF NOT EXISTS user_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ NOT NULL,
  platform_user_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

CREATE TABLE IF NOT EXISTS ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_name TEXT,
  business_name TEXT,
  account_status INTEGER,
  currency TEXT DEFAULT 'BRL',
  is_active BOOLEAN DEFAULT true,
  monthly_budget DECIMAL(10,2),
  client_id UUID,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, account_id)
);

ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own tokens' AND tablename = 'user_tokens') THEN
    CREATE POLICY "Users see own tokens" ON user_tokens FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own accounts' AND tablename = 'ad_accounts') THEN
    CREATE POLICY "Users see own accounts" ON ad_accounts FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_tokens_user_platform ON user_tokens(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_user_platform ON ad_accounts(user_id, platform);
