import { assertEquals, assertMatch, assertStringIncludes } from 'jsr:@std/assert@1';

import { alertText, buildMessages, interpretTickets, sendPush, type PushTicket } from './push.ts';

const alert = {
  alertId: 'a1',
  patientFirstName: 'Marie',
  plannedLocalTime: '08:00',
  lastSeenLocalTime: '07:45',
  tokens: ['ExponentPushToken[one]', 'ExponentPushToken[two]'],
};

Deno.test('the alert names the person and the time, never the medication', () => {
  const { title, body } = alertText(alert);
  assertEquals(title, 'Marie n’a pas confirmé sa prise');
  assertStringIncludes(body, '08:00');
  assertStringIncludes(body, '07:45');
  assertMatch(body, /prendre de ses nouvelles/);
});

Deno.test('one message per phone, on the high-priority alert channel', () => {
  const messages = buildMessages(alert);
  assertEquals(
    messages.map((m) => m.to),
    alert.tokens,
  );
  assertEquals(messages[0]?.channelId, 'circle-alerts');
  assertEquals(messages[0]?.data, { type: 'circle_alert', alertId: 'a1' });
});

Deno.test('sent if at least one phone got it; uninstalled phones are forgotten', () => {
  const messages = buildMessages(alert);
  const tickets: PushTicket[] = [
    { status: 'error', details: { error: 'DeviceNotRegistered' } },
    { status: 'ok', id: 'x' },
  ];
  assertEquals(interpretTickets(messages, tickets), {
    ok: true,
    deadTokens: ['ExponentPushToken[one]'],
    errorCode: null,
  });
});

Deno.test('failed when no phone got it, and when the relative has no phone', () => {
  const messages = buildMessages(alert);
  const outcome = interpretTickets(messages, [
    { status: 'error', details: { error: 'MessageRateExceeded' } },
    { status: 'error' },
  ]);
  assertEquals(outcome.ok, false);
  assertEquals(outcome.errorCode, 'MessageRateExceeded');
  assertEquals(interpretTickets([], []).errorCode, 'no_device');
});

Deno.test('batches of 100, network errors become retryable failures', async () => {
  const many = buildMessages({
    ...alert,
    tokens: Array.from({ length: 150 }, (_, i) => `ExponentPushToken[${i}]`),
  });
  const sizes: number[] = [];
  const tickets = await sendPush(many, {
    fetch: (_url, init) => {
      const batch = JSON.parse(String(init.body)) as unknown[];
      sizes.push(batch.length);
      if (sizes.length === 2) return Promise.reject(new Error('offline'));
      return Promise.resolve(Response.json({ data: batch.map(() => ({ status: 'ok', id: 'x' })) }));
    },
  });
  assertEquals(sizes, [100, 50]);
  assertEquals(tickets.filter((t) => t.status === 'ok').length, 100);
  assertEquals(tickets[120], { status: 'error', details: { error: 'network' } });
});
