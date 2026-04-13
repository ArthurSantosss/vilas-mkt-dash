-- ============================================================
-- Tabelas para alertas de saldo com notificação Discord (cron)
-- ============================================================

-- ── Regras de alerta ──
CREATE TABLE IF NOT EXISTS balance_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'balance_low',  -- 'balance_low' | 'payment_error'
  account_id TEXT NOT NULL,        -- 'all' ou ID da conta Meta (act_xxx)
  agency TEXT DEFAULT 'all',
  threshold DECIMAL(10,2) DEFAULT 0,  -- usado por balance_low; payment_error ignora
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Configurações de conta (método de pagamento, etc.) ──
CREATE TABLE IF NOT EXISTS account_configs (
  account_id TEXT PRIMARY KEY,      -- ID da conta Meta (act_xxx)
  payment_method TEXT DEFAULT 'credit_card',  -- 'credit_card' | 'pix' | 'boleto'
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Log de notificações enviadas (evita duplicatas) ──
CREATE TABLE IF NOT EXISTS balance_alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES balance_alert_rules(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  alert_date DATE DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_balance_alert_log_date ON balance_alert_log(alert_date);
CREATE INDEX IF NOT EXISTS idx_balance_alert_rules_enabled ON balance_alert_rules(enabled);
