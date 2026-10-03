/**
 * Called every 5 minutes by pg_cron (see supabase/setup/cron.sql): finds the intakes not
 * confirmed in time and alerts the relatives' phones by notification (Expo push, free).
 * Idempotent and safe to run twice at once: the SQL claims each alert once (SKIP LOCKED).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { json, requireEnv, safeEqual } from '../_shared/env.ts';
import { buildMessages, interpretTickets, sendPush } from '../_shared/push.ts';

type Claimed = {
  alert_id: string;
  patient_first_name: string;
  planned_local_time: string;
  last_seen_at: string | null;
  timezone: string;
  tokens: string[];
};

function localTime(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

function adminClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}
type Admin = ReturnType<typeof adminClient>;

/** Language of each relative's phone. On failure, alerts still go out (in English). */
async function tokenLocales(admin: Admin, tokens: string[]): Promise<Map<string, string>> {
  if (tokens.length === 0) return new Map();
  const { data, error } = await admin.rpc('push_token_locales', { p_tokens: tokens });
  if (error) {
    console.error('push_token_locales', error);
    return new Map();
  }
  return new Map(
    ((data ?? []) as { token: string; locale: string }[]).map((row) => [row.token, row.locale]),
  );
}

Deno.serve(async (request) => {
  const secret = request.headers.get('x-cron-secret') ?? '';
  if (!safeEqual(secret, requireEnv('CRON_SECRET'))) return json({ error: 'forbidden' }, 403);

  const admin = adminClient();
  const { data, error } = await admin.rpc('claim_missed_doses');
  if (error) {
    console.error('claim_missed_doses', error);
    return json({ error: 'claim_failed' }, 500);
  }

  // Optional: "enhanced push security" access token (expo.dev → Access tokens).
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN') || undefined;
  const claimed = (data ?? []) as Claimed[];
  const locales = await tokenLocales(
    admin,
    claimed.flatMap((alert) => alert.tokens),
  );
  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  for (const alert of claimed) {
    const messages = buildMessages({
      alertId: alert.alert_id,
      patientFirstName: alert.patient_first_name,
      plannedLocalTime: alert.planned_local_time,
      lastSeenLocalTime: localTime(alert.last_seen_at, alert.timezone),
      tokens: alert.tokens,
      localeOf: (token) => locales.get(token),
    });
    const outcome = interpretTickets(messages, await sendPush(messages, { accessToken }));
    dead.push(...outcome.deadTokens);
    if (outcome.ok) sent += 1;
    else failed += 1;
    // Failures are retried by the next runs, 3 attempts at most (see the SQL).
    const { error: recordError } = await admin.rpc('record_alert_result', {
      p_alert_id: alert.alert_id,
      p_ok: outcome.ok,
      p_error_code: outcome.errorCode,
    });
    if (recordError) console.error('record_alert_result', recordError);
  }
  if (dead.length > 0) {
    const { error: forgetError } = await admin.rpc('forget_push_tokens', { p_tokens: dead });
    if (forgetError) console.error('forget_push_tokens', forgetError);
  }
  return json({ sent, failed, forgottenPhones: dead.length });
});
