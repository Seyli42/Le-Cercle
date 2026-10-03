import { assert, assertEquals } from 'jsr:@std/assert@1';
import { createHmac } from 'node:crypto';

import { computeTwilioSignature, isValidTwilioRequest, safeEqual, sendSms } from './twilio.ts';

const url = 'https://abc.supabase.co/functions/v1/twilio-inbound';
const params = { From: '+33611111111', Body: 'OUI 1234', To: '+33700000000', MessageSid: 'SM1' };

Deno.test('signature matches the algorithm documented by Twilio', async () => {
  const data =
    url +
    'Body' +
    'OUI 1234' +
    'From' +
    '+33611111111' +
    'MessageSid' +
    'SM1' +
    'To' +
    '+33700000000';
  const expected = createHmac('sha1', 'secret-token').update(data).digest('base64');
  assertEquals(await computeTwilioSignature('secret-token', url, params), expected);
});

Deno.test('a request not signed by Twilio is refused', async () => {
  const good = await computeTwilioSignature('secret-token', url, params);
  assert(await isValidTwilioRequest('secret-token', url, params, good));
  assert(!(await isValidTwilioRequest('secret-token', url, { ...params, Body: 'STOP' }, good)));
  assert(!(await isValidTwilioRequest('other-token', url, params, good)));
  assert(!(await isValidTwilioRequest('secret-token', url, params, null)));
  assert(!safeEqual('abc', 'abd'));
});

Deno.test('sends through the Twilio API and classifies errors', async () => {
  let captured: { url: string; body: string; auth: string | null } | null = null;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    captured = {
      url: String(input),
      body: String(init?.body),
      auth: new Headers(init?.headers).get('Authorization'),
    };
    return new Response(JSON.stringify({ sid: 'SM42' }), { status: 201 });
  }) as typeof fetch;
  const config = { accountSid: 'AC1', authToken: 'tok', fromNumber: '+33700000000' };
  assertEquals(await sendSms(config, '+33611111111', 'Bonjour', fakeFetch), {
    ok: true,
    sid: 'SM42',
  });
  assert(captured!.url.endsWith('/Accounts/AC1/Messages.json'));
  assert(captured!.body.includes('To=%2B33611111111'));
  assertEquals(captured!.auth, `Basic ${btoa('AC1:tok')}`);

  const invalid = (async () =>
    new Response(JSON.stringify({ code: 21211 }), { status: 400 })) as unknown as typeof fetch;
  assertEquals(await sendSms(config, '+1', 'x', invalid), {
    ok: false,
    errorCode: '21211',
    retryable: false,
  });

  const down = (async () => {
    throw new TypeError('network');
  }) as unknown as typeof fetch;
  assertEquals(await sendSms(config, '+1', 'x', down), {
    ok: false,
    errorCode: 'network',
    retryable: true,
  });

  assertEquals(await sendSms({ accountSid: 'AC1', authToken: 'tok' }, '+1', 'x', fakeFetch), {
    ok: false,
    errorCode: 'missing_sender',
    retryable: false,
  });
});
