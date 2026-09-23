-- System user tokens from Business Managers never expire: they must never reach the browser
-- nor the public preferences table. Same posture as google_ads_connections.
BEGIN;

CREATE TABLE IF NOT EXISTS public.meta_token_connections (
  owner_email text NOT NULL,
  id text NOT NULL,
  label text NOT NULL,
  token text NOT NULL,
  kind text NOT NULL DEFAULT 'system_user',
  meta_user_id text,
  meta_user_name text,
  business_name text,
  never_expires boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  warning text,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_email, id)
);

ALTER TABLE public.meta_token_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_token_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_token_connections TO service_role;

CREATE INDEX IF NOT EXISTS meta_token_connections_owner_priority
  ON public.meta_token_connections(owner_email, priority, created_at);

COMMIT;
