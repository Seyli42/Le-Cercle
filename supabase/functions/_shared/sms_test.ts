import { assert, assertEquals } from 'jsr:@std/assert@1';

import { alertMessage, inviteMessage, isE164, isGsm7, parseReply, REPLIES, toGsm7 } from './sms.ts';

Deno.test('every text fits the cheap GSM-7 alphabet', () => {
  const texts = [
    inviteMessage({ memberFirstName: 'Léa', patientFirstName: 'Marie', code: '1234' }),
    alertMessage({
      memberFirstName: 'Léa',
      patientFirstName: 'Marie',
      plannedLocalTime: '08:00',
      lastSeenLocalTime: '07:45',
    }),
    ...Object.values(REPLIES),
  ];
  for (const text of texts) assert(isGsm7(text), `not GSM-7: ${text}`);
});

Deno.test('an alert never contains the medication name and stays within 2 SMS', () => {
  const text = alertMessage({
    memberFirstName: 'Léa',
    patientFirstName: 'Marie',
    plannedLocalTime: '08:00',
    lastSeenLocalTime: '07:45',
  });
  assert(!/kard|doli|medicament/i.test(text));
  assert(text.includes('Marie') && text.includes('08:00') && text.includes('07:45'));
  assert(text.length <= 306, `${text.length} characters`);
});

Deno.test('names typed with special characters are made GSM-7', () => {
  assertEquals(toGsm7('Françoise Lefèvre'), 'Francoise Lefèvre');
  assert(
    isGsm7(inviteMessage({ memberFirstName: 'Jérôme', patientFirstName: 'Hélène', code: '0042' })),
  );
});

Deno.test('understands the usual ways of answering', () => {
  assertEquals(parseReply('oui'), { kind: 'yes', code: null });
  assertEquals(parseReply(' Oui 1234 '), { kind: 'yes', code: '1234' });
  assertEquals(parseReply('OUI, 1234 !'), { kind: 'yes', code: '1234' });
  assertEquals(parseReply('ok'), { kind: 'yes', code: null });
  assertEquals(parseReply('STOP'), { kind: 'stop' });
  assertEquals(parseReply('Arrêt'), { kind: 'stop' });
  assertEquals(parseReply('non merci'), { kind: 'stop' });
  assertEquals(parseReply('Qui est-ce ?'), { kind: 'unknown' });
  assertEquals(parseReply('ouistiti'), { kind: 'unknown' });
});

Deno.test('phone numbers must be international', () => {
  assert(isE164('+33612345678'));
  assert(!isE164('0612345678'));
});
