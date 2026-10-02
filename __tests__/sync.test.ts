import {
  createMedication,
  listMedications,
  updateMedication,
} from '@/features/medications/repository';
import type { MedicationInput } from '@/features/medications/types';
import { listDoseEvents, recordDose } from '@/features/reminders/doseEvents';
import {
  countPending,
  runSync,
  type Cursors,
  type PullPage,
  type PushBatch,
  type RemoteDoseEvent,
  type RemoteMedication,
  type RemoteSchedule,
  type SyncRemote,
  type TableName,
} from '@/features/sync/sync';
import type { LocalDb } from '@/lib/db/types';
import { AppError } from '@/lib/errors';

import { createTestDb } from './helpers/nodeDb';

/**
 * In-memory server with the same rules as supabase/migrations/…_sync.sql:
 * owner from the session, last write wins on client_updated_at, one intake per
 * (schedule, time), rows returned in (updated_at, id) order after a cursor.
 */
class FakeServer {
  private clock = Date.parse('2026-10-02T12:00:00Z');
  readonly rows: { [K in TableName]: Map<string, PullPage[K][number]> } = {
    medications: new Map(),
    schedules: new Map(),
    dose_events: new Map(),
  };
  /** Ids the server refuses (simulates a constraint violation). */
  readonly poison = new Set<string>();
  offline = false;
  beforePush: (() => Promise<void>) | null = null;

  private tick() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  remoteFor(userId: string): SyncRemote {
    return {
      push: async (batch: PushBatch) => {
        if (this.offline) throw new AppError('network', 'offline');
        await this.beforePush?.();
        for (const row of [
          ...(batch.medications ?? []),
          ...(batch.schedules ?? []),
          ...(batch.dose_events ?? []),
        ]) {
          if (this.poison.has(row.id)) throw new AppError('unknown', 'check violation');
        }
        const upsert = <T extends { id: string; client_updated_at: string }>(
          table: TableName,
          row: T,
          key: string,
        ) => {
          const map = this.rows[table] as unknown as Map<
            string,
            T & { user_id: string; updated_at: string }
          >;
          const existing = map.get(key);
          if (existing && existing.user_id !== userId) throw new AppError('unknown', 'rls');
          if (
            existing &&
            Date.parse(existing.client_updated_at) >= Date.parse(row.client_updated_at)
          )
            return;
          map.set(key, {
            ...row,
            id: existing?.id ?? row.id,
            user_id: userId,
            updated_at: this.tick(),
          });
        };
        batch.medications?.forEach((r) => upsert('medications', r, r.id));
        batch.schedules?.forEach((r) => upsert('schedules', r, r.id));
        batch.dose_events?.forEach((r) =>
          upsert('dose_events', r, `${r.schedule_id}@${new Date(r.scheduled_at).toISOString()}`),
        );
      },
      pull: async (cursors: Cursors, limit: number) => {
        if (this.offline) throw new AppError('network', 'offline');
        const page = <K extends TableName>(table: K) =>
          [...this.rows[table].values()]
            .filter((r) => r.user_id === userId)
            .filter((r) => {
              const c = cursors[table];
              return !c || r.updated_at > c.ts || (r.updated_at === c.ts && r.id > c.id);
            })
            .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id))
            .slice(0, limit) as PullPage[K][number][];
        return {
          medications: page('medications') as RemoteMedication[],
          schedules: page('schedules') as RemoteSchedule[],
          dose_events: page('dose_events') as RemoteDoseEvent[],
          limit,
        };
      },
    };
  }
}

const ALICE = 'alice';
const input: MedicationInput = {
  name: 'Levothyrox',
  form: 'tablet',
  doseLabel: '1 comprimé',
  startsOn: '2026-10-01',
  endsOn: null,
  notes: null,
  schedules: [{ timeOfDay: '08:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }],
};

let phoneA: LocalDb;
let phoneB: LocalDb;
let server: FakeServer;
let uuid = 0;
const at = (iso: string) => ({
  now: () => new Date(iso),
  uuid: () => `id-${String(++uuid).padStart(4, '0')}`,
});
const sync = (db: LocalDb, user = ALICE, extra: { pullLimit?: number; batchSize?: number } = {}) =>
  runSync(db, user, server.remoteFor(user), {
    now: () => new Date('2026-10-02T12:00:00Z'),
    ...extra,
  });

beforeEach(async () => {
  phoneA = await createTestDb();
  phoneB = await createTestDb();
  server = new FakeServer();
});

it('sends what was created offline and brings it to the second phone', async () => {
  const med = await createMedication(phoneA, ALICE, input, at('2026-10-02T08:00:00Z'));
  expect(await countPending(phoneA, ALICE)).toBe(2);

  const report = await sync(phoneA);
  expect(report).toEqual({ pushed: 2, rejected: 0, applied: 0 });
  expect(await countPending(phoneA, ALICE)).toBe(0);

  expect((await sync(phoneB)).applied).toBe(2);
  const onB = await listMedications(phoneB, ALICE);
  expect(onB).toHaveLength(1);
  expect(onB[0]).toMatchObject({ id: med.id, name: 'Levothyrox' });
  expect(onB[0]!.schedules[0]).toMatchObject({
    timeOfDay: '08:00',
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  });
  expect(await countPending(phoneB, ALICE)).toBe(0);
});

it('resolves a conflict by keeping the most recent change, on both phones', async () => {
  const med = await createMedication(phoneA, ALICE, input, at('2026-10-02T08:00:00Z'));
  await sync(phoneA);
  await sync(phoneB);

  // Both phones offline, edited at different times. B is more recent but syncs first.
  await updateMedication(
    phoneA,
    ALICE,
    med.id,
    { ...input, name: 'Nom de A' },
    at('2026-10-02T09:00:00Z'),
  );
  await updateMedication(
    phoneB,
    ALICE,
    med.id,
    { ...input, name: 'Nom de B' },
    at('2026-10-02T10:00:00Z'),
  );
  await sync(phoneB);
  await sync(phoneA); // older change: refused by the server, then replaced locally
  await sync(phoneB);

  expect((await listMedications(phoneA, ALICE))[0]?.name).toBe('Nom de B');
  expect((await listMedications(phoneB, ALICE))[0]?.name).toBe('Nom de B');
  expect(server.rows.medications.get(med.id)?.name).toBe('Nom de B');
});

it('keeps a single answer per intake when two phones answered it', async () => {
  const med = await createMedication(phoneA, ALICE, input, at('2026-10-02T05:00:00Z'));
  await sync(phoneA);
  await sync(phoneB);
  const dose = {
    scheduleId: med.schedules[0]!.id,
    medicationId: med.id,
    scheduledAt: '2026-10-02T06:00:00.000Z',
  };
  await recordDose(phoneA, ALICE, { ...dose, status: 'taken' }, at('2026-10-02T06:05:00Z'));
  await recordDose(phoneB, ALICE, { ...dose, status: 'skipped' }, at('2026-10-02T06:02:00Z'));
  await sync(phoneB);
  await sync(phoneA);
  await sync(phoneB);

  for (const phone of [phoneA, phoneB]) {
    const events = await listDoseEvents(phone, ALICE, new Date(0), new Date('2030-01-01'));
    expect(events.map((e) => e.status)).toEqual(['taken']);
  }
  expect(server.rows.dose_events.size).toBe(1);
});

it('does not mark as synced a row edited while it was being sent', async () => {
  const med = await createMedication(phoneA, ALICE, input, at('2026-10-02T08:00:00Z'));
  let edited = false;
  server.beforePush = async () => {
    if (edited) return;
    edited = true;
    await updateMedication(
      phoneA,
      ALICE,
      med.id,
      { ...input, name: 'Modifié pendant l’envoi' },
      at('2026-10-02T08:00:05Z'),
    );
  };
  await sync(phoneA);
  // The edit was sent in a second pass, and nothing is left pending.
  expect(server.rows.medications.get(med.id)?.name).toBe('Modifié pendant l’envoi');
  expect(await countPending(phoneA, ALICE)).toBe(0);
});

it('stops cleanly when offline and keeps every change pending', async () => {
  await createMedication(phoneA, ALICE, input, at('2026-10-02T08:00:00Z'));
  server.offline = true;
  await expect(sync(phoneA)).rejects.toMatchObject({ kind: 'network' });
  expect(await countPending(phoneA, ALICE)).toBe(2);
  server.offline = false;
  await sync(phoneA);
  expect(await countPending(phoneA, ALICE)).toBe(0);
});

it('isolates a row refused by the server instead of blocking everything', async () => {
  const bad = await createMedication(
    phoneA,
    ALICE,
    { ...input, name: 'Refusé' },
    at('2026-10-02T08:00:00Z'),
  );
  await createMedication(phoneA, ALICE, { ...input, name: 'Accepté' }, at('2026-10-02T08:01:00Z'));
  server.poison.add(bad.id);
  const rejected: string[] = [];
  const report = await runSync(phoneA, ALICE, server.remoteFor(ALICE), {
    now: () => new Date(),
    onRejected: (_table, id) => rejected.push(id),
  });
  expect(rejected).toEqual([bad.id]);
  expect(report.rejected).toBe(1);
  expect([...server.rows.medications.values()].map((m) => m.name)).toEqual(['Accepté']);
});

it('downloads everything across several pages, parents before children', async () => {
  for (let i = 0; i < 5; i += 1) {
    await createMedication(
      phoneA,
      ALICE,
      { ...input, name: `Med ${i}` },
      at(`2026-10-02T08:0${i}:00Z`),
    );
  }
  await sync(phoneA, ALICE, { batchSize: 2 });
  expect((await sync(phoneB, ALICE, { pullLimit: 2 })).applied).toBe(10);
  expect(await listMedications(phoneB, ALICE)).toHaveLength(5);
  // A second sync downloads nothing new (only the 2-minute overlap, applied as no-ops).
  expect((await sync(phoneB, ALICE, { pullLimit: 2 })).applied).toBe(0);
});

it('never shows another account’s data and removes it once safe on the server', async () => {
  await createMedication(phoneA, 'bob', input, at('2026-10-02T08:00:00Z'));
  await sync(phoneA, 'bob');
  await createMedication(
    phoneA,
    'bob',
    { ...input, name: 'Pas encore envoyé' },
    at('2026-10-02T08:30:00Z'),
  );

  await sync(phoneA, ALICE);
  expect(await listMedications(phoneA, ALICE)).toEqual([]);
  const bobRows = await phoneA.getAllAsync<{ name: string }>('SELECT name FROM medications');
  // Bob's synced data is gone from the phone; his unsent change is kept for him.
  expect(bobRows).toEqual([{ name: 'Pas encore envoyé' }]);
});
