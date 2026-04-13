-- ============================================================
-- Agendar verificação de saldos a cada 1 hora via pg_cron
-- ============================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remover schedule anterior se existir (idempotente)
SELECT cron.unschedule('check-balances-hourly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'check-balances-hourly'
);

-- Agendar a cada 1 hora
SELECT cron.schedule(
  'check-balances-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://saeiyeoelosbvewbftqp.supabase.co/functions/v1/check-balances-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhZWl5ZW9lbG9zYnZld2JmdHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNDQxMDMsImV4cCI6MjA4ODcyMDEwM30.I3_3542d6cdCah2lyVoaq_ymwrVDh_sfukIMGhNb4Xs',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
