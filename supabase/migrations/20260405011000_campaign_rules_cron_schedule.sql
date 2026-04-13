-- ============================================================
-- Agendar processamento das regras de campanha a cada 15 minutos
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('process-campaign-rules-quarter-hourly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-campaign-rules-quarter-hourly'
);

SELECT cron.schedule(
  'process-campaign-rules-quarter-hourly',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://saeiyeoelosbvewbftqp.supabase.co/functions/v1/process-campaign-rules',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhZWl5ZW9lbG9zYnZld2JmdHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDQxMDMsImV4cCI6MjA4ODcyMDEwM30.I3_3542d6cdCah2lyVoaq_ymwrVDh_sfukIMGhNb4Xs',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
