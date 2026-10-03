/**
 * POST { memberId } with the user's session → sends the invitation SMS to a relative.
 * Ownership and rate limits are checked in SQL (prepare_circle_invite), as the user.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { json, requireEnv, twilioConfig } from '../_shared/env.ts';
import { inviteMessage } from '../_shared/sms.ts';
import { sendSms } from '../_shared/twilio.ts';

const KNOWN_ERRORS = new Set([
  'member_not_found',
  'already_confirmed',
  'invite_too_soon',
  'invite_limit_reached',
  'first_name_required',
]);

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'not_authenticated' }, 401);

  let memberId: unknown;
  try {
    ({ memberId } = await request.json());
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (typeof memberId !== 'string') return json({ error: 'invalid_body' }, 400);

  // The user's own rights: RLS and auth.uid() apply inside the SQL function.
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc('prepare_circle_invite', { p_member_id: memberId });
  if (error) {
    const code = KNOWN_ERRORS.has(error.message) ? error.message : 'invite_failed';
    if (code === 'invite_failed') console.error('prepare_circle_invite', error);
    return json({ error: code }, code === 'invite_failed' ? 500 : 409);
  }
  const invite = Array.isArray(data) ? data[0] : null;
  if (!invite) return json({ error: 'member_not_found' }, 409);

  const result = await sendSms(
    twilioConfig(),
    invite.phone_e164,
    inviteMessage({
      memberFirstName: invite.member_first_name,
      patientFirstName: invite.patient_first_name,
      code: invite.invite_code,
    }),
  );
  if (!result.ok) {
    console.error('invite sms failed', result.errorCode);
    return json({ error: 'sms_failed', providerCode: result.errorCode }, 502);
  }
  return json({ ok: true });
});
