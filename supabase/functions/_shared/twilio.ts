/** Minimal Twilio client: send an SMS, and check that a webhook really comes from Twilio. */

export type TwilioConfig = {
  readonly accountSid: string;
  readonly authToken: string;
  /** A Twilio number able to RECEIVE SMS (needed for the OUI / STOP answers)… */
  readonly fromNumber?: string | undefined;
  /** …or a Messaging Service containing such a number. */
  readonly messagingServiceSid?: string | undefined;
};

export type SendResult =
  | { readonly ok: true; readonly sid: string }
  | { readonly ok: false; readonly errorCode: string; readonly retryable: boolean };

export async function sendSms(
  config: TwilioConfig,
  to: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const params = new URLSearchParams({ To: to, Body: body });
  if (config.messagingServiceSid) params.set('MessagingServiceSid', config.messagingServiceSid);
  else if (config.fromNumber) params.set('From', config.fromNumber);
  else return { ok: false, errorCode: 'missing_sender', retryable: false };

  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    return { ok: false, errorCode: 'network', retryable: true };
  }
  const json = (await response.json().catch(() => ({}))) as { sid?: string; code?: number };
  if (response.ok && json.sid) return { ok: true, sid: json.sid };
  // 429 and 5xx are worth retrying; 4xx (invalid number, blocked…) are not.
  return {
    ok: false,
    errorCode: String(json.code ?? response.status),
    retryable: response.status === 429 || response.status >= 500,
  };
}

/**
 * Twilio signature (X-Twilio-Signature): base64(HMAC-SHA1(authToken, url + each POST
 * parameter name and value, sorted by name)). Rejects any request not signed by Twilio.
 */
export async function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Readonly<Record<string, string>>,
): Promise<string> {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/** Constant-time comparison, so that the signature cannot be guessed byte by byte. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidTwilioRequest(
  authToken: string,
  url: string,
  params: Readonly<Record<string, string>>,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  return safeEqual(await computeTwilioSignature(authToken, url, params), signature);
}
