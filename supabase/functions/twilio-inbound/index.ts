/**
 * Twilio webhook for SMS received on our number: "OUI 1234" confirms an invitation,
 * "STOP" removes the number from every circle. Only requests signed by Twilio are read.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { requireEnv } from '../_shared/env.ts';
import { isE164, parseReply, REPLIES } from '../_shared/sms.ts';
import { isValidTwilioRequest } from '../_shared/twilio.ts';

function twiml(message: string | null): Response {
  const escaped = message?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = escaped ? `<Message>${escaped}</Message>` : '';
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const params = Object.fromEntries(new URLSearchParams(await request.text()).entries()) as Record<
    string,
    string
  >;
  // Must be EXACTLY the URL configured in the Twilio console.
  const publicUrl =
    Deno.env.get('TWILIO_WEBHOOK_URL') ??
    `${requireEnv('SUPABASE_URL')}/functions/v1/twilio-inbound`;
  const valid = await isValidTwilioRequest(
    requireEnv('TWILIO_AUTH_TOKEN'),
    publicUrl,
    params,
    request.headers.get('X-Twilio-Signature'),
  );
  if (!valid) return new Response('Forbidden', { status: 403 });

  const from = params.From ?? '';
  if (!isE164(from)) return twiml(null);

  const admin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  const reply = parseReply(params.Body ?? '');

  if (reply.kind === 'stop') {
    const { error } = await admin.rpc('revoke_circle_phone', { p_phone: from });
    if (error) console.error('revoke_circle_phone', error);
    // Twilio already answers STOP by itself (opt-out): no second message.
    return twiml(null);
  }
  if (reply.kind === 'unknown') return twiml(REPLIES.unknown);

  const { data, error } = await admin.rpc('confirm_circle_invite', {
    p_phone: from,
    p_code: reply.code,
  });
  if (error) {
    console.error('confirm_circle_invite', error);
    return twiml(null);
  }
  const messages: Record<string, string> = {
    confirmed: REPLIES.confirmed,
    code_required: REPLIES.codeRequired,
    wrong_code: REPLIES.wrongCode,
    no_pending_invite: REPLIES.noInvite,
  };
  return twiml(messages[String(data)] ?? null);
});
