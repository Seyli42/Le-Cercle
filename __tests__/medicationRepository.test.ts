import {
  createMedication,
  deleteMedication,
  getMedication,
  listMedications,
  MedicationValidationError,
  updateMedication,
  type RepositoryDeps,
} from '@/features/medications/repository';
import type { MedicationInput } from '@/features/medications/types';
import { migrate } from '@/lib/db/migrations';
import type { LocalDb } from '@/lib/db/types';

import { createTestDb } from './helpers/nodeDb';

const ALICE = 'user-alice';
const BOB = 'user-bob';

const input: MedicationInput = {
  name: 'Levothyrox',
  form: 'tablet',
  doseLabel: '1 comprimé',
  startsOn: '2026-10-02',
  endsOn: null,
  notes: 'À jeun',
  schedules: [
    { timeOfDay: '08:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
    { timeOfDay: '20:00', daysOfWeek: [1, 2, 3, 4, 5] },
  ],
};

let db: LocalDb;
let counter = 0;
const deps: RepositoryDeps = {
  now: () => new Date('2026-10-02T10:00:00Z'),
  uuid: () => `id-${++counter}`,
};

beforeEach(async () => {
  db = await createTestDb();
  counter = 0;
});

it('re-running migrations is harmless', async () => {
  await migrate(db);
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  expect(row?.user_version).toBe(3);
});

it('creates and reads back a medication with its schedules', async () => {
  const created = await createMedication(db, ALICE, input, deps);
  expect(created).toMatchObject({ name: 'Levothyrox', doseLabel: '1 comprimé', notes: 'À jeun' });
  expect(created.schedules.map((s) => [s.timeOfDay, s.daysOfWeek])).toEqual([
    ['08:00', [1, 2, 3, 4, 5, 6, 7]],
    ['20:00', [1, 2, 3, 4, 5]],
  ]);
  expect(await listMedications(db, ALICE)).toHaveLength(1);
});

it('keeps every user isolated', async () => {
  const created = await createMedication(db, ALICE, input, deps);
  expect(await listMedications(db, BOB)).toEqual([]);
  expect(await getMedication(db, BOB, created.id)).toBeNull();
  await expect(updateMedication(db, BOB, created.id, input, deps)).rejects.toThrow(/n’existe plus/);
  await deleteMedication(db, BOB, created.id, deps);
  expect(await getMedication(db, ALICE, created.id)).not.toBeNull();
});

it('refuses invalid input without writing anything', async () => {
  await expect(createMedication(db, ALICE, { ...input, name: '' }, deps)).rejects.toBeInstanceOf(
    MedicationValidationError,
  );
  expect(await listMedications(db, ALICE)).toEqual([]);
});

it('keeps schedule ids when a time is unchanged (history stays linked)', async () => {
  const created = await createMedication(db, ALICE, input, deps);
  const morningId = created.schedules[0]?.id;
  const updated = await updateMedication(
    db,
    ALICE,
    created.id,
    {
      ...input,
      name: 'Levothyrox 75',
      schedules: [
        { timeOfDay: '08:00', daysOfWeek: [1, 2, 3] },
        { timeOfDay: '13:00', daysOfWeek: [1] },
      ],
    },
    deps,
  );
  expect(updated.name).toBe('Levothyrox 75');
  expect(updated.schedules.map((s) => s.timeOfDay)).toEqual(['08:00', '13:00']);
  expect(updated.schedules[0]?.id).toBe(morningId);
  expect(updated.schedules[0]?.daysOfWeek).toEqual([1, 2, 3]);

  const removed = await db.getFirstAsync<{ deleted_at: string | null }>(
    "SELECT deleted_at FROM schedules WHERE time_of_day = '20:00'",
  );
  expect(removed?.deleted_at).not.toBeNull();
});

it('soft-deletes a medication and its schedules, marked for sync', async () => {
  const created = await createMedication(db, ALICE, input, deps);
  await deleteMedication(db, ALICE, created.id, deps);
  expect(await listMedications(db, ALICE)).toEqual([]);
  const rows = await db.getAllAsync<{ deleted_at: string | null; sync_status: string }>(
    'SELECT deleted_at, sync_status FROM schedules',
  );
  expect(rows.every((r) => r.deleted_at !== null && r.sync_status === 'pending')).toBe(true);
});

it('rolls back the whole save if a schedule cannot be written', async () => {
  // Simulates a crash in the middle of the transaction.
  let calls = 0;
  const failingDeps: RepositoryDeps = {
    ...deps,
    uuid: () => {
      calls += 1;
      if (calls === 3) throw new Error('disk full');
      return `id-${calls}`;
    },
  };
  await expect(createMedication(db, ALICE, input, failingDeps)).rejects.toThrow('disk full');
  expect(await listMedications(db, ALICE)).toEqual([]);
  const orphans = await db.getAllAsync('SELECT id FROM schedules');
  expect(orphans).toEqual([]);
});

it('sorts the list alphabetically, ignoring case', async () => {
  await createMedication(db, ALICE, { ...input, name: 'zyrtec' }, deps);
  await createMedication(db, ALICE, { ...input, name: 'Aspirine' }, deps);
  await createMedication(db, ALICE, { ...input, name: 'doliprane' }, deps);
  expect((await listMedications(db, ALICE)).map((m) => m.name)).toEqual([
    'Aspirine',
    'doliprane',
    'zyrtec',
  ]);
});
