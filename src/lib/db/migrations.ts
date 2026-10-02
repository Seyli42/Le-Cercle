import type { LocalDb } from '@/lib/db/types';

/**
 * Local schema, mirroring the server tables (supabase/migrations) plus a `sync_status`
 * column for the synchronisation of step 5. Append new migrations at the end; never edit
 * a migration that has shipped.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE medications (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    form TEXT NOT NULL,
    dose_label TEXT NOT NULL CHECK (length(trim(dose_label)) BETWEEN 1 AND 50),
    starts_on TEXT NOT NULL,
    ends_on TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced')),
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
  );
  CREATE INDEX medications_user_idx ON medications (user_id, deleted_at);

  CREATE TABLE schedules (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    medication_id TEXT NOT NULL REFERENCES medications (id) ON DELETE CASCADE,
    time_of_day TEXT NOT NULL CHECK (time_of_day GLOB '[0-2][0-9]:[0-5][0-9]'),
    days_of_week TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced'))
  );
  CREATE INDEX schedules_medication_idx ON schedules (medication_id);
  CREATE INDEX schedules_user_idx ON schedules (user_id, deleted_at);
  `,
  // 2 — intake journal (answers to reminders), mirrors public.dose_events.
  `
  CREATE TABLE dose_events (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    medication_id TEXT NOT NULL,
    schedule_id TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'taken', 'snoozed', 'skipped', 'missed')),
    responded_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced')),
    UNIQUE (schedule_id, scheduled_at)
  );
  CREATE INDEX dose_events_user_time_idx ON dose_events (user_id, scheduled_at);
  `,
];

export async function migrate(db: LocalDb): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const sql = MIGRATIONS[version];
    if (sql === undefined) break;
    await db.transaction(async (tx) => {
      await tx.execAsync(sql);
      await tx.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
