ALTER TABLE public.shared_reports
ADD COLUMN IF NOT EXISTS public_slug TEXT;

UPDATE public.shared_reports
SET public_slug = CASE
  WHEN COALESCE(NULLIF(TRIM(client_label), ''), '') <> '' THEN
    regexp_replace(lower(trim(client_label)), '[^a-z0-9]+', '-', 'g') || '-' || left(id, 6)
  ELSE id
END
WHERE public_slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_reports_public_slug
ON public.shared_reports(public_slug);

CREATE OR REPLACE FUNCTION public.get_shared_report(p_id TEXT)
RETURNS TABLE (
  id TEXT,
  account_id TEXT,
  agency TEXT,
  objective TEXT,
  campaign_ids TEXT[],
  client_label TEXT,
  public_slug TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, account_id, agency, objective, campaign_ids, client_label, public_slug
  FROM public.shared_reports
  WHERE id = p_id OR public_slug = p_id
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_report(TEXT) TO anon, authenticated;
