/**
 * Two-way synchronisation between the phone (SQLite) and Supabase.
 *
 * - The phone works offline; every local change is marked `sync_status = 'pending'`.
 * - Upload: pending rows are sent table by table (parents first), then marked synced
 *   only if they did not change again meanwhile.
 * - Download: rows changed on the server since the last cursor are applied locally.
 * - Conflicts: the most recent change made on a phone wins ("last write wins"), using
 *   the time of the change on the phone, on both sides (see sync_push on the server).
 */

import type { DoseStatus, MedicationForm } from '@/lib/database.types';
import type { LocalDb, SqlValue } from '@/lib/db/types';
import { AppError } from '@/lib/errors';

export type TableName = 'medications' | 'schedules' | 'dose_events';
export const TABLES: readonly TableName[] = ['medications', 'schedules', 'dose_events'];

export type Cursor = { readonly ts: string; readonly id: string };
export type Cursors = Partial<Record<TableName, Cursor>>;

export type PushMedication = {
  id: string;
  name: string;
  form: MedicationForm;
  dose_label: string;
  starts_on: string;
  ends_on: string | null;
  notes: string | null;
  deleted_at: string | null;
  client_updated_at: string;
};
export type PushSchedule = {
  id: string;
  medication_id: string;
  time_of_day: string;
  days_of_week: number[];
  deleted_at: string | null;
  client_updated_at: string;
};
export type PushDoseEvent = {
  id: string;
  medication_id: string;
  schedule_id: string;
  scheduled_at: string;
  status: DoseStatus;
  responded_at: string | null;
  client_updated_at: string;
};

export type PushBatch = {
  readonly medications?: readonly PushMedication[];
  readonly schedules?: readonly PushSchedule[];
  readonly dose_events?: readonly PushDoseEvent[];
};

type ServerMeta = { user_id: string; updated_at: string };
export type RemoteMedication = PushMedication & ServerMeta;
export type RemoteSchedule = PushSchedule & ServerMeta;
export type RemoteDoseEvent = PushDoseEvent & ServerMeta;

export type PullPage = {
  readonly medications: readonly RemoteMedication[];
  readonly schedules: readonly RemoteSchedule[];
  readonly dose_events: readonly RemoteDoseEvent[];
  readonly limit: number;
};

/** What the sync needs from the server (Supabase in the app, a fake in tests). */
export interface SyncRemote {
  push(batch: PushBatch): Promise<void>;
  pull(cursors: Cursors, limit: number): Promise<PullPage>;
}

export type SyncReport = {
  readonly pushed: number;
  /** Rows the server refused (kept pending, reported). */
  readonly rejected: number;
  /** Server rows that changed something on this phone. */
  readonly applied: number;
};

export type SyncOptions = {
  readonly now: () => Date;
  readonly batchSize?: number;
  readonly pullLimit?: number;
  readonly onRejected?: ((table: TableName, id: string, error: unknown) => void) | undefined;
};

/** Re-downloads the last 2 minutes on every sync: a server transaction can commit
 * slightly after a later one, and applying a row twice is harmless. */
const CURSOR_OVERLAP_MS = 2 * 60_000;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const MAX_PULL_PAGES = 50;

const iso = (value: string) => new Date(value).toISOString();
const time = (value: string) => Date.parse(value);

/** Network and session problems stop the sync; anything else is a refused row. */
export function isTransientSyncError(error: unknown): boolean {
  return error instanceof AppError && (error.kind === 'network' || error.kind === 'auth');
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

type PendingRow<T> = { readonly payload: T; readonly updatedAt: string };

async function pendingMedications(db: LocalDb, userId: string, limit: number) {
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    form: MedicationForm;
    dose_label: string;
    starts_on: string;
    ends_on: string | null;
    notes: string | null;
    deleted_at: string | null;
    updated_at: string;
  }>(
    `SELECT id, name, form, dose_label, starts_on, ends_on, notes, deleted_at, updated_at
     FROM medications WHERE user_id = ? AND sync_status = 'pending'
     ORDER BY updated_at LIMIT ?`,
    [userId, limit],
  );
  return rows.map(({ updated_at, ...row }): PendingRow<PushMedication> => ({
    payload: { ...row, client_updated_at: updated_at },
    updatedAt: updated_at,
  }));
}

async function pendingSchedules(db: LocalDb, userId: string, limit: number) {
  const rows = await db.getAllAsync<{
    id: string;
    medication_id: string;
    time_of_day: string;
    days_of_week: string;
    deleted_at: string | null;
    updated_at: string;
  }>(
    `SELECT id, medication_id, time_of_day, days_of_week, deleted_at, updated_at
     FROM schedules WHERE user_id = ? AND sync_status = 'pending'
     ORDER BY updated_at LIMIT ?`,
    [userId, limit],
  );
  return rows.map(({ updated_at, days_of_week, ...row }): PendingRow<PushSchedule> => ({
    payload: {
      ...row,
      days_of_week: JSON.parse(days_of_week) as number[],
      client_updated_at: updated_at,
    },
    updatedAt: updated_at,
  }));
}

async function pendingDoseEvents(db: LocalDb, userId: string, limit: number) {
  const rows = await db.getAllAsync<{
    id: string;
    medication_id: string;
    schedule_id: string;
    scheduled_at: string;
    status: DoseStatus;
    responded_at: string | null;
    updated_at: string;
  }>(
    `SELECT id, medication_id, schedule_id, scheduled_at, status, responded_at, updated_at
     FROM dose_events WHERE user_id = ? AND sync_status = 'pending'
     ORDER BY updated_at LIMIT ?`,
    [userId, limit],
  );
  return rows.map(({ updated_at, ...row }): PendingRow<PushDoseEvent> => ({
    payload: { ...row, client_updated_at: updated_at },
    updatedAt: updated_at,
  }));
}

/** Marks rows synced, unless they were edited again while the upload was running. */
async function markSynced(
  db: LocalDb,
  table: TableName,
  rows: readonly PendingRow<{ id: string }>[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.runAsync(
        `UPDATE ${table} SET sync_status = 'synced'
         WHERE id = ? AND updated_at = ? AND sync_status = 'pending'`,
        [row.payload.id, row.updatedAt],
      );
    }
  });
}

async function pushTable<T extends { id: string }>(
  db: LocalDb,
  remote: SyncRemote,
  table: TableName,
  load: (limit: number) => Promise<PendingRow<T>[]>,
  options: Required<Pick<SyncOptions, 'batchSize'>> & Pick<SyncOptions, 'onRejected'>,
): Promise<{ pushed: number; rejected: number }> {
  let pushed = 0;
  const refused = new Set<string>();
  // Bounded loop: a row edited at every pass cannot keep the sync running forever.
  for (let pass = 0; pass < 100; pass += 1) {
    const rows = (await load(options.batchSize + refused.size)).filter(
      (r) => !refused.has(r.payload.id),
    );
    if (rows.length === 0) break;
    const batch = rows.slice(0, options.batchSize);
    try {
      await remote.push({ [table]: batch.map((r) => r.payload) });
      await markSynced(db, table, batch);
      pushed += batch.length;
    } catch (error) {
      if (isTransientSyncError(error)) throw error;
      // One bad row must not block every other change: retry them one by one.
      for (const row of batch) {
        try {
          await remote.push({ [table]: [row.payload] });
          await markSynced(db, table, [row]);
          pushed += 1;
        } catch (rowError) {
          if (isTransientSyncError(rowError)) throw rowError;
          refused.add(row.payload.id);
          options.onRejected?.(table, row.payload.id, rowError);
        }
      }
    }
  }
  return { pushed, rejected: refused.size };
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

async function readCursors(db: LocalDb, userId: string): Promise<Cursors> {
  const rows = await db.getAllAsync<{ table_name: TableName; cursor_ts: string | null }>(
    'SELECT table_name, cursor_ts FROM sync_state WHERE user_id = ?',
    [userId],
  );
  const cursors: Cursors = {};
  for (const row of rows) {
    if (row.cursor_ts) {
      cursors[row.table_name] = {
        ts: new Date(time(row.cursor_ts) - CURSOR_OVERLAP_MS).toISOString(),
        id: ZERO_UUID,
      };
    }
  }
  return cursors;
}

async function applyMedication(tx: LocalDb, row: RemoteMedication): Promise<boolean> {
  const local = await tx.getFirstAsync<{ updated_at: string; sync_status: string }>(
    'SELECT updated_at, sync_status FROM medications WHERE id = ?',
    [row.id],
  );
  if (local && time(local.updated_at) >= time(row.client_updated_at)) return false;
  const changedAt = iso(row.client_updated_at);
  await tx.runAsync(
    `INSERT INTO medications
       (id, user_id, name, form, dose_label, starts_on, ends_on, notes, created_at, updated_at, deleted_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name, form = excluded.form, dose_label = excluded.dose_label,
       starts_on = excluded.starts_on, ends_on = excluded.ends_on, notes = excluded.notes,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, sync_status = 'synced'`,
    [
      row.id,
      row.user_id,
      row.name,
      row.form,
      row.dose_label,
      row.starts_on,
      row.ends_on,
      row.notes,
      changedAt,
      changedAt,
      row.deleted_at ? iso(row.deleted_at) : null,
    ],
  );
  return true;
}

/** Returns 'orphan' when the medication is not on this phone (cursor out of step). */
async function applySchedule(tx: LocalDb, row: RemoteSchedule): Promise<boolean | 'orphan'> {
  const parent = await tx.getFirstAsync<{ id: string }>('SELECT id FROM medications WHERE id = ?', [
    row.medication_id,
  ]);
  if (!parent) return 'orphan';
  const local = await tx.getFirstAsync<{ updated_at: string }>(
    'SELECT updated_at FROM schedules WHERE id = ?',
    [row.id],
  );
  if (local && time(local.updated_at) >= time(row.client_updated_at)) return false;
  const changedAt = iso(row.client_updated_at);
  await tx.runAsync(
    `INSERT INTO schedules
       (id, user_id, medication_id, time_of_day, days_of_week, created_at, updated_at, deleted_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')
     ON CONFLICT (id) DO UPDATE SET
       time_of_day = excluded.time_of_day, days_of_week = excluded.days_of_week,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, sync_status = 'synced'`,
    [
      row.id,
      row.user_id,
      row.medication_id,
      row.time_of_day.slice(0, 5),
      JSON.stringify([...row.days_of_week].sort()),
      changedAt,
      changedAt,
      row.deleted_at ? iso(row.deleted_at) : null,
    ],
  );
  return true;
}

async function applyDoseEvent(tx: LocalDb, row: RemoteDoseEvent): Promise<boolean> {
  const scheduledAt = iso(row.scheduled_at);
  const local = await tx.getFirstAsync<{ updated_at: string }>(
    'SELECT updated_at FROM dose_events WHERE schedule_id = ? AND scheduled_at = ?',
    [row.schedule_id, scheduledAt],
  );
  if (local && time(local.updated_at) >= time(row.client_updated_at)) return false;
  const changedAt = iso(row.client_updated_at);
  await tx.runAsync(
    `INSERT INTO dose_events
       (id, user_id, medication_id, schedule_id, scheduled_at, status, responded_at, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
     ON CONFLICT (schedule_id, scheduled_at) DO UPDATE SET
       status = excluded.status, responded_at = excluded.responded_at,
       updated_at = excluded.updated_at, sync_status = 'synced'`,
    [
      row.id,
      row.user_id,
      row.medication_id,
      row.schedule_id,
      scheduledAt,
      row.status,
      row.responded_at ? iso(row.responded_at) : null,
      changedAt,
      changedAt,
    ] satisfies SqlValue[],
  );
  return true;
}

async function pullAll(
  db: LocalDb,
  userId: string,
  remote: SyncRemote,
  pullLimit: number,
  now: Date,
): Promise<number> {
  const cursors = await readCursors(db, userId);
  const received: { -readonly [K in TableName]: PullPage[K][number][] } = {
    medications: [],
    schedules: [],
    dose_events: [],
  };

  // Download everything first, then apply in one go: parents (medications) must be
  // written before their schedules, whatever page each one arrived in.
  for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
    const result = await remote.pull(cursors, pullLimit);
    let more = false;
    for (const table of TABLES) {
      const rows = result[table];
      (received[table] as unknown[]).push(...rows);
      const last = rows.at(-1);
      if (last) cursors[table] = { ts: last.updated_at, id: last.id };
      if (rows.length >= result.limit) more = true;
    }
    if (!more) break;
  }

  let applied = 0;
  let orphans = 0;
  await db.transaction(async (tx) => {
    for (const row of received.medications) if (await applyMedication(tx, row)) applied += 1;
    for (const row of received.schedules) {
      const result = await applySchedule(tx, row);
      if (result === 'orphan') orphans += 1;
      else if (result) applied += 1;
    }
    for (const row of received.dose_events) if (await applyDoseEvent(tx, row)) applied += 1;
    if (orphans > 0) {
      // This phone missed some rows: forget the cursors, the next sync downloads everything.
      await tx.runAsync('DELETE FROM sync_state WHERE user_id = ?', [userId]);
      return;
    }
    for (const table of TABLES) {
      const cursor = cursors[table];
      await tx.runAsync(
        `INSERT INTO sync_state (user_id, table_name, cursor_ts, cursor_id, last_success_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, table_name) DO UPDATE SET
           cursor_ts = COALESCE(excluded.cursor_ts, sync_state.cursor_ts),
           cursor_id = COALESCE(excluded.cursor_id, sync_state.cursor_id),
           last_success_at = excluded.last_success_at`,
        [userId, table, cursor?.ts ?? null, cursor?.id ?? null, now.toISOString()],
      );
    }
  });
  return applied;
}

/**
 * Another account used this phone before: its data already safe on the server is
 * removed. Its unsent changes are kept until that person signs in again.
 */
async function purgeOtherAccounts(db: LocalDb, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of ['dose_events', 'schedules', 'medications'] as const) {
      await tx.runAsync(`DELETE FROM ${table} WHERE user_id <> ? AND sync_status = 'synced'`, [
        userId,
      ]);
    }
  });
}

export async function runSync(
  db: LocalDb,
  userId: string,
  remote: SyncRemote,
  options: SyncOptions,
): Promise<SyncReport> {
  const batchSize = options.batchSize ?? 200;
  await purgeOtherAccounts(db, userId);

  let pushed = 0;
  let rejected = 0;
  const push = <T extends { id: string }>(
    table: TableName,
    load: (limit: number) => Promise<PendingRow<T>[]>,
  ) => pushTable(db, remote, table, load, { batchSize, onRejected: options.onRejected });

  for (const result of [
    await push('medications', (n) => pendingMedications(db, userId, n)),
    await push('schedules', (n) => pendingSchedules(db, userId, n)),
    await push('dose_events', (n) => pendingDoseEvents(db, userId, n)),
  ]) {
    pushed += result.pushed;
    rejected += result.rejected;
  }

  const applied = await pullAll(db, userId, remote, options.pullLimit ?? 500, options.now());
  return { pushed, rejected, applied };
}

/** Number of local changes not yet on the server (shown to the user). */
export async function countPending(db: LocalDb, userId: string): Promise<number> {
  let total = 0;
  for (const table of TABLES) {
    const row = await db.getFirstAsync<{ n: number }>(
      `SELECT count(*) AS n FROM ${table} WHERE user_id = ? AND sync_status = 'pending'`,
      [userId],
    );
    total += row?.n ?? 0;
  }
  return total;
}

export async function lastSuccessfulSync(db: LocalDb, userId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ at: string | null }>(
    'SELECT max(last_success_at) AS at FROM sync_state WHERE user_id = ?',
    [userId],
  );
  return row?.at ?? null;
}
