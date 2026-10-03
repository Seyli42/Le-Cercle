import {
  acceptInvite,
  createInvite,
  formatCode,
  inviteMessage,
  loadCircle,
  saveSettings,
} from '@/features/circle/api';
import type { AppSupabaseClient } from '@/lib/supabase';

type Result = { data: unknown; error: unknown };

/** Chainable stand-in for the Supabase query builder: every chain resolves to `result`. */
function query(result: Result) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit', 'update']) {
    chain[method] = () => chain;
  }
  chain.single = async () => result;
  chain.then = (resolve: (value: Result) => unknown) => resolve(result);
  return chain;
}

function client(tables: Record<string, Result>, rpcs: Record<string, Result> = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const fake = {
    from: (table: string) => query(tables[table] ?? { data: [], error: null }),
    rpc: async (name: string, args?: unknown) => {
      calls.push({ name, args });
      return rpcs[name] ?? { data: [], error: null };
    },
  } as unknown as AppSupabaseClient;
  return { fake, calls };
}

const postgrestError = (message: string) => ({ message, code: 'P0001', details: '', hint: '' });

it('splits both sides of the circle and the alerts sent, without the medication', async () => {
  const { fake } = client(
    {
      profiles: { data: { first_name: 'Marie', missed_dose_delay_minutes: 60 }, error: null },
      circle_alerts: {
        data: [{ id: 'a1', dose_event_id: 'e1', sent_at: '2026-10-03T06:31:00Z' }],
        error: null,
      },
      dose_events: { data: [{ id: 'e1', scheduled_at: '2026-10-03T06:00:00Z' }], error: null },
    },
    {
      my_circle: {
        data: [
          { link_id: 'l1', role: 'watcher', first_name: 'Robert', since: 's', last_alert_at: null },
          { link_id: 'l2', role: 'patient', first_name: 'Papa', since: 's', last_alert_at: 'x' },
        ],
        error: null,
      },
      my_circle_invite: {
        data: [{ code: 'ABCDEFGH', expires_at: '2026-10-05T10:00:00Z' }],
        error: null,
      },
    },
  );
  const data = await loadCircle(fake, 'user-1');
  expect(data.firstName).toBe('Marie');
  expect(data.delayMinutes).toBe(60);
  expect(data.watchers.map((w) => w.firstName)).toEqual(['Robert']);
  expect(data.watching).toEqual([
    { linkId: 'l2', firstName: 'Papa', since: 's', lastAlertAt: 'x' },
  ]);
  expect(data.invite).toEqual({ code: 'ABCDEFGH', expiresAt: '2026-10-05T10:00:00Z' });
  expect(data.alerts).toEqual([
    { id: 'a1', plannedAt: '2026-10-03T06:00:00Z', sentAt: '2026-10-03T06:31:00Z' },
  ]);
});

it('codes are shown in two groups and shared with clear instructions', () => {
  expect(formatCode('ABCDEFGH')).toBe('ABCD-EFGH');
  const text = inviteMessage('Marie', 'ABCDEFGH');
  expect(text).toContain('ABCD-EFGH');
  expect(text).toContain('Je veille sur un proche');
  expect(text).toContain('48 h');
});

it('accepts a code typed with spaces, dashes or lower case', async () => {
  const { fake, calls } = client(
    {},
    {
      accept_circle_invite: { data: [{ link_id: 'l1', patient_first_name: 'Marie' }], error: null },
    },
  );
  await expect(acceptInvite(fake, ' abcd-efgh ')).resolves.toBe('Marie');
  expect(calls).toEqual([{ name: 'accept_circle_invite', args: { p_code: 'ABCDEFGH' } }]);
});

it('refuses a code of the wrong length before calling the server', async () => {
  const { fake, calls } = client({});
  await expect(acceptInvite(fake, 'ABC')).rejects.toMatchObject({ kind: 'validation' });
  expect(calls).toEqual([]);
});

it('translates server refusals into clear French', async () => {
  const { fake } = client(
    {},
    {
      accept_circle_invite: { data: null, error: postgrestError('invalid_code') },
      create_circle_invite: { data: null, error: postgrestError('first_name_required') },
    },
  );
  await expect(acceptInvite(fake, 'ABCDEFGH')).rejects.toMatchObject({
    userMessage: expect.stringContaining('48 h'),
  });
  await expect(createInvite(fake)).rejects.toMatchObject({
    userMessage: expect.stringContaining('prénom'),
  });
});

it('requires a first name of reasonable length', async () => {
  const { fake } = client({});
  await expect(
    saveSettings(fake, 'user-1', { firstName: '   ', delayMinutes: 30 }),
  ).rejects.toMatchObject({ kind: 'validation' });
});
