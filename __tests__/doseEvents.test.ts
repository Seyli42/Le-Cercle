import { listDoseEvents, recordDose } from '@/features/reminders/doseEvents';
import type { LocalDb } from '@/lib/db/types';

import { createTestDb } from './helpers/nodeDb';

let db: LocalDb;
let n = 0;
const deps = { now: () => new Date('2026-10-02T06:05:00Z'), uuid: () => `e${++n}` };
const dose = {
  scheduleId: 's1',
  medicationId: 'm1',
  scheduledAt: '2026-10-02T06:00:00.000Z',
  status: 'taken' as const,
};

beforeEach(async () => {
  db = await createTestDb();
});

it('records an answer and reads it back', async () => {
  await recordDose(db, 'alice', dose, deps);
  const events = await listDoseEvents(
    db,
    'alice',
    new Date('2026-10-02T00:00:00Z'),
    new Date('2026-10-02T23:59:00Z'),
  );
  expect(events).toEqual([
    expect.objectContaining({
      scheduleId: 's1',
      status: 'taken',
      respondedAt: '2026-10-02T06:05:00.000Z',
    }),
  ]);
});

it('is idempotent and keeps the last answer', async () => {
  await recordDose(db, 'alice', { ...dose, status: 'snoozed' }, deps);
  await recordDose(db, 'alice', dose, deps);
  await recordDose(db, 'alice', dose, deps);
  const rows = await db.getAllAsync<{ status: string }>('SELECT status FROM dose_events');
  expect(rows).toEqual([{ status: 'taken' }]);
});

it('never lets another account overwrite an answer', async () => {
  await recordDose(db, 'alice', dose, deps);
  await recordDose(db, 'bob', { ...dose, status: 'skipped' }, deps);
  const rows = await db.getAllAsync<{ user_id: string; status: string }>(
    'SELECT user_id, status FROM dose_events',
  );
  expect(rows).toEqual([{ user_id: 'alice', status: 'taken' }]);
  expect(await listDoseEvents(db, 'bob', new Date(0), new Date('2030-01-01'))).toEqual([]);
});
