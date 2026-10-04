-- =============================================================================
-- Planification de la détection des prises non confirmées (toutes les 5 minutes).
--
-- À exécuter UNE FOIS dans Supabase → SQL Editor, après avoir :
--   1. activé les extensions pg_cron et pg_net (Database → Extensions) ;
--   2. remplacé <PROJECT_REF> ci-dessous.
-- Le secret est tiré au hasard PAR LA BASE et rangé dans le coffre-fort (Vault) : il
-- n'apparaît jamais en clair. Copiez-le ensuite dans Edge Functions → Secrets
-- (nom CRON_SECRET) avec :
--   select decrypted_secret from vault.decrypted_secrets where name = 'missed_dose_cron_secret';
-- =============================================================================

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'missed_dose_cron_secret');

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
