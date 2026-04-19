-- ============================================================
-- SCHEMA: Sistema VilasMKT Marketing — Autenticação e Contas
-- Executar no SQL Editor do Supabase
-- ============================================================

-- ── Tabela: users ──
-- Armazena informações do gestor de tráfego
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'manager',  -- manager | admin | viewer
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- ── Tabela: user_tokens ──
-- Armazena tokens OAuth de cada plataforma (Meta, Google)
CREATE TABLE IF NOT EXISTS user_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL,  -- 'meta' | 'google'
  access_token TEXT NOT NULL,
  refresh_token TEXT,               -- Só Google tem refresh_token
  token_expires_at TIMESTAMPTZ NOT NULL,
  platform_user_id TEXT,            -- facebook_user_id ou google_email
  status TEXT DEFAULT 'active',     -- active | expired | revoked
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, platform)
);

-- ── Tabela: ad_accounts ──
-- Contas de anúncio vinculadas (Meta Ads)
CREATE TABLE IF NOT EXISTS ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL,           -- 'meta' | 'google'
  account_id TEXT NOT NULL,         -- 'act_123456' (Meta) ou '123-456-7890' (Google)
  account_name TEXT,
  business_name TEXT,
  account_status INTEGER,           -- Meta: 1=ativa, 2=desabilitada | Google: similar
  currency TEXT DEFAULT 'BRL',
  is_active BOOLEAN DEFAULT true,
  monthly_budget DECIMAL(10,2),
  client_id UUID,                   -- vínculo com cadastro de cliente
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, platform, account_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Cada usuário só acessa seus próprios dados
-- ============================================================

ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own tokens"
  ON user_tokens FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users see own accounts"
  ON ad_accounts FOR ALL
  USING (user_id = auth.uid());

-- ============================================================
-- ÍNDICES para performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_tokens_user_platform ON user_tokens(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_user_platform ON ad_accounts(user_id, platform);

-- ── Tabela: app_preferences ──
-- Armazena de forma global as configurações de localStorage (Saldos, Nomes, Tokens customizados)
CREATE TABLE IF NOT EXISTS app_preferences (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
