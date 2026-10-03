import type { LocalDb } from '@/lib/db/types';

/** Erases everything this account left on the phone (after deleting the account). */
export async function wipeLocalData(db: LocalDb, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of ['dose_events', 'schedules', 'medications', 'sync_state'] as const) {
      await tx.runAsync(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    }
  });
}

type Row = Record<string, string | number | null>;

export type DataExport = {
  readonly exportedAt: string;
  readonly app: 'Le Cercle';
  readonly account: { readonly id: string; readonly email: string | null };
  readonly medications: Row[];
  readonly schedules: Row[];
  readonly doseEvents: Row[];
  readonly circle: unknown;
};

/**
 * Everything the app holds about the person, in a readable JSON file (GDPR right to data
 * portability). Medications, schedules and intake history come from the phone; the circle
 * comes from the server when online.
 */
export async function buildExport(
  db: LocalDb,
  account: { readonly id: string; readonly email: string | null },
  circle: unknown,
  now: Date = new Date(),
): Promise<DataExport> {
  const select = (sql: string) => db.getAllAsync<Row>(sql, [account.id]);
  const [medications, schedules, doseEvents] = await Promise.all([
    select(
      `SELECT id, name, form, dose_label, starts_on, ends_on, notes, created_at, updated_at, deleted_at
       FROM medications WHERE user_id = ? ORDER BY created_at`,
    ),
    select(
      `SELECT id, medication_id, time_of_day, days_of_week, created_at, updated_at, deleted_at
       FROM schedules WHERE user_id = ? ORDER BY created_at`,
    ),
    select(
      `SELECT medication_id, schedule_id, scheduled_at, status, responded_at
       FROM dose_events WHERE user_id = ? ORDER BY scheduled_at`,
    ),
  ]);
  return {
    exportedAt: now.toISOString(),
    app: 'Le Cercle',
    account,
    medications,
    schedules,
    doseEvents,
    circle,
  };
}
