-- =============================================================================
-- Planification de la détection des prises non confirmées (toutes les 5 minutes).
--
-- À exécuter UNE FOIS dans Supabase → SQL Editor, après avoir :
--   1. activé les extensions pg_cron et pg_net (Database → Extensions) ;
--   2. remplacé <PROJECT_REF> et <CRON_SECRET> ci-dessous
--      (CRON_SECRET = la même valeur que `npx supabase secrets set CRON_SECRET=...`).
-- Le secret est rangé dans le coffre-fort Supabase (Vault), jamais en clair dans la tâche.
-- =============================================================================

select vault.create_secret('<CRON_SECRET>', 'missed_dose_cron_secret');

select cron.schedule(
  'missed-dose-check',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/missed-dose-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'missed_dose_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Vérification : select * from cron.job_run_details order by start_time desc limit 5;
-- Arrêt :        select cron.unschedule('missed-dose-check');
