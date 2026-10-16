BEGIN;

CREATE TABLE IF NOT EXISTS public.assistant_client_context (
  owner_email text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('meta', 'google')),
  account_id text NOT NULL,
  account_name text NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_email, platform, account_id)
);

CREATE TABLE IF NOT EXISTS public.assistant_recommendations (
  id uuid PRIMARY KEY,
  owner_email text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('meta', 'google')),
  account_id text NOT NULL,
  account_name text NOT NULL,
  plan jsonb NOT NULL,
  evidence jsonb NOT NULL,
  status text NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'accepted', 'rejected', 'executed', 'reviewed')),
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_recommendations_account
  ON public.assistant_recommendations(owner_email, platform, account_id, created_at DESC);

ALTER TABLE public.assistant_client_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_recommendations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_client_context, public.assistant_recommendations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_client_context, public.assistant_recommendations TO service_role;

COMMIT;
