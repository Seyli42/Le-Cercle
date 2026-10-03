/**
 * Called every 5 minutes by pg_cron (see supabase/setup/cron.sql): finds the intakes not
 * confirmed in time and sends one SMS per consenting relative. Idempotent and safe to run
 * twice at once: the SQL claims each alert once (SKIP LOCKED).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { json, requireEnv, twilioConfig } from '../_shared/env.ts';
import { alertMessage } from '../_shared/sms.ts';
import { safeEqual, sendSms } from '../_shared/twilio.ts';

type Alert = {
  alert_id: string;
  phone_e164: string;
  member_first_name: string;
  patient_first_name: string;
  planned_local_time: string;
  last_seen_at: string | null;
  timezone: string;
};

function localTime(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(iso),
  );
}

Deno.serve(async (request) => {
  const secret = request.headers.get('x-cron-secret') ?? '';
  if (!safeEqual(secret, requireEnv('CRON_SECRET'))) return json({ error: 'forbidden' }, 403);

  const admin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc('claim_missed_doses');
  if (error) {
    console.error('claim_missed_doses', error);
    return json({ error: 'claim_failed' }, 500);
  }

  const twilio = twilioConfig();
  let sent = 0;
  let failed = 0;
  for (const alert of (data ?? []) as Alert[]) {
    const result = await sendSms(
      twilio,
      alert.phone_e164,
      alertMessage({
        memberFirstName: alert.member_first_name,
        patientFirstName: alert.patient_first_name,
        plannedLocalTime: alert.planned_local_time,
        lastSeenLocalTime: localTime(alert.last_seen_at, alert.timezone),
      }),
    );
    if (result.ok) sent += 1;
    else failed += 1;
    // A non-retryable failure (invalid number…) is recorded as failed, and the SQL stops
    // after 3 attempts anyway.
    const { error: recordError } = await admin.rpc('record_alert_result', {
      p_alert_id: alert.alert_id,
      p_ok: result.ok,
      p_provider_message_id: result.ok ? result.sid : null,
      p_error_code: result.ok ? null : result.errorCode,
    });
    if (recordError) console.error('record_alert_result', recordError);
  }
  return json({ sent, failed });
});
