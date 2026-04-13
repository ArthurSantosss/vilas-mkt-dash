-- ============================================================
-- Regras programadas de campanha (pausa e reducao de verba)
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL DEFAULT 'all',
  action TEXT NOT NULL CHECK (action IN ('pause', 'reduce_budget')),
  reduce_percent DECIMAL(5,2),
  schedule_start SMALLINT NOT NULL CHECK (schedule_start BETWEEN 0 AND 23),
  schedule_end SMALLINT NOT NULL CHECK (schedule_end BETWEEN 0 AND 23),
  timezone TEXT NOT NULL DEFAULT 'America/Bahia',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_rule_state (
  rule_id UUID NOT NULL REFERENCES campaign_rules(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('campaign', 'adset')),
  action TEXT NOT NULL CHECK (action IN ('pause', 'reduce_budget')),
  original_status TEXT,
  original_daily_budget DECIMAL(12,2),
  applied BOOLEAN NOT NULL DEFAULT true,
  last_applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reverted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rule_id, entity_id)
);

CREATE TABLE IF NOT EXISTS campaign_rule_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('campaign', 'adset')),
  action TEXT NOT NULL CHECK (action IN ('pause', 'reduce_budget')),
  operation TEXT NOT NULL CHECK (operation IN ('apply', 'revert', 'skip', 'error')),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_rules_enabled ON campaign_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_campaign_rules_account ON campaign_rules(account_id);
CREATE INDEX IF NOT EXISTS idx_campaign_rule_state_rule_id ON campaign_rule_state(rule_id);
CREATE INDEX IF NOT EXISTS idx_campaign_rule_log_rule_id ON campaign_rule_log(rule_id);
