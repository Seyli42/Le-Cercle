/** Server secrets (set with `npx supabase secrets set NAME=value`). Never in the app. */

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
}

export function twilioConfig() {
  return {
    accountSid: requireEnv('TWILIO_ACCOUNT_SID'),
    authToken: requireEnv('TWILIO_AUTH_TOKEN'),
    fromNumber: Deno.env.get('TWILIO_FROM_NUMBER'),
    messagingServiceSid: Deno.env.get('TWILIO_MESSAGING_SERVICE_SID'),
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
