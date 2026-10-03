import { FunctionsHttpError } from '@supabase/supabase-js';

import { addMember, loadCircle, saveSettings, sendInvite } from '@/features/circle/api';
import type { AppSupabaseClient } from '@/lib/supabase';

type Result = { data: unknown; error: unknown };

/** Chainable stand-in for the Supabase query builder: every chain resolves to `result`. */
function query(result: Result) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit', 'update', 'insert']) {
    chain[method] = () => chain;
  }
  chain.single = async () => result;
  chain.then = (resolve: (value: Result) => unknown) => resolve(result);
  return chain;
}

function client(tables: Record<string, Result>, invoke?: () => Promise<{ error: unknown }>) {
  return {
    from: (table: string) => query(tables[table] ?? { data: null, error: null }),
    functions: { invoke: invoke ?? (async () => ({ error: null })) },
  } as unknown as AppSupabaseClient;
}

it('assembles members and the alerts sent, without the medication', async () => {
  const data = await loadCircle(
    client({
      profiles: { data: { first_name: 'Marie', missed_dose_delay_minutes: 30 }, error: null },
      circle_members: {
        data: [
          {
            id: 'm1',
            first_name: 'Léa',
            phone_e164: '+33611111111',
            consent_status: 'confirmed',
            invite_sent_at: null,
            invites_sent: 1,
            confirmed_at: '2026-10-01T10:00:00Z',
          },
        ],
        error: null,
      },
      alerts_sent: {
        data: [
          { id: 'a1', circle_member_id: 'm1', dose_event_id: 'e1', status: 'sent', sent_at: 'x' },
        ],
        error: null,
      },
      dose_events: { data: [{ id: 'e1', scheduled_at: '2026-10-03T06:00:00Z' }], error: null },
    }),
    'u1',
  );
  expect(data.firstName).toBe('Marie');
  expect(data.members[0]).toMatchObject({ firstName: 'Léa', consent: 'confirmed' });
  expect(data.alerts[0]).toMatchObject({
    memberFirstName: 'Léa',
    plannedAt: '2026-10-03T06:00:00Z',
  });
});

it('explains a duplicate number and the 5-relative limit', async () => {
  await expect(
    addMember(
      client({ circle_members: { data: null, error: { code: '23505', message: 'dup' } } }),
      {
        firstName: 'Léa',
        phone: '+33611111111',
      },
    ),
  ).rejects.toMatchObject({ userMessage: 'Ce numéro est déjà dans votre Cercle.' });

  await expect(
    addMember(
      client({
        circle_members: { data: null, error: { code: 'P0001', message: 'circle_limit_reached' } },
      }),
      { firstName: 'Léa', phone: '+33611111111' },
    ),
  ).rejects.toMatchObject({ userMessage: expect.stringMatching(/maximum 5/) });
});

it('translates the errors of the invitation function', async () => {
  const response = new Response(JSON.stringify({ error: 'invite_too_soon' }), { status: 409 });
  const failing = client({}, async () => ({ error: new FunctionsHttpError(response) }));
  await expect(sendInvite(failing, 'm1')).rejects.toMatchObject({
    kind: 'validation',
    userMessage: expect.stringMatching(/Patientez deux minutes/),
  });
});

it('requires a first name before saving', async () => {
  await expect(
    saveSettings(client({}), 'u1', { firstName: '  ', delayMinutes: 30 }),
  ).rejects.toMatchObject({
    kind: 'validation',
  });
});
