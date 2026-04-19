-- Stores cross-device user preferences (localStorage keys synced to cloud).
-- The table may already exist from initial schema.sql; IF NOT EXISTS keeps this safe.
CREATE TABLE IF NOT EXISTS app_preferences (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
