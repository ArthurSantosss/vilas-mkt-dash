-- Google credentials must never be stored in public UI preferences.
BEGIN;

CREATE TABLE IF NOT EXISTS public.google_ads_connections (
  owner_email text NOT NULL,
  id text NOT NULL,
  user_email text NOT NULL,
  refresh_token text NOT NULL,
  accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_email, id)
);
ALTER TABLE public.google_ads_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_ads_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_connections TO service_role;

CREATE TABLE IF NOT EXISTS public.google_ads_oauth_states (
  state text PRIMARY KEY,
  owner_email text NOT NULL,
  verifier text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.google_ads_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_ads_oauth_states FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_oauth_states TO service_role;
CREATE INDEX IF NOT EXISTS google_ads_oauth_states_expiry ON public.google_ads_oauth_states(expires_at);

-- Old grants may have been exposed: discard instead of silently reusing them.
-- Revoke the old app grant in Google Account, then reconnect each profile.
DELETE FROM public.app_preferences
WHERE right(key, length('google_ads_secure_connection')) = 'google_ads_secure_connection';

-- A restrictive policy composes with the existing permissive preferences policy.
-- Old deployed clients cannot restore the sensitive key through public access.
ALTER TABLE public.app_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Block public Google Ads credentials" ON public.app_preferences;
CREATE POLICY "Block public Google Ads credentials" ON public.app_preferences
AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (right(key, length('google_ads_secure_connection')) <> 'google_ads_secure_connection')
WITH CHECK (right(key, length('google_ads_secure_connection')) <> 'google_ads_secure_connection');

COMMIT;
