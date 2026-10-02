import type { DoseStatus } from '@/lib/database.types';
import type { LocalDb } from '@/lib/db/types';

export type { DoseStatus };

export type DoseEvent = {
  readonly scheduleId: string;
  readonly medicationId: string;
  readonly scheduledAt: string;
  readonly status: DoseStatus;
  readonly respondedAt: string | null;
};

export type RecordDoseInput = {
  readonly scheduleId: string;
  readonly medicationId: string;
  /** ISO instant of the planned intake. */
  readonly scheduledAt: string;
  /** 'pending' cancels a previous answer (tapped "Pris" by mistake). */
  readonly status: Exclude<DoseStatus, 'missed'>;
};

type Row = {
  schedule_id: string;
  medication_id: string;
  scheduled_at: string;
  status: DoseStatus;
  responded_at: string | null;
};

/**
 * Records the answer to an intake. Idempotent: answering twice (e.g. the same tap
 * delivered both in background and foreground) keeps a single row, with the last answer.
 */
export async function recordDose(
  db: LocalDb,
  userId: string,
  input: RecordDoseInput,
  deps: { readonly now: () => Date; readonly uuid: () => string },
): Promise<void> {
  const timestamp = deps.now().toISOString();
  const scheduledAt = new Date(input.scheduledAt).toISOString();
  await db.runAsync(
    `INSERT INTO dose_events
       (id, user_id, medication_id, schedule_id, scheduled_at, status, responded_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (schedule_id, scheduled_at) DO UPDATE SET
       status = excluded.status,
       responded_at = excluded.responded_at,
       updated_at = excluded.updated_at,
       sync_status = 'pending'
     WHERE dose_events.user_id = excluded.user_id`,
    [
      deps.uuid(),
      userId,
      input.medicationId,
      input.scheduleId,
      scheduledAt,
      input.status,
      input.status === 'pending' ? null : timestamp,
      timestamp,
      timestamp,
    ],
  );
}

export async function listDoseEvents(
  db: LocalDb,
  userId: string,
  from: Date,
  to: Date,
): Promise<DoseEvent[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT schedule_id, medication_id, scheduled_at, status, responded_at FROM dose_events
     WHERE user_id = ? AND scheduled_at >= ? AND scheduled_at <= ?
     ORDER BY scheduled_at`,
    [userId, from.toISOString(), to.toISOString()],
  );
  return rows.map((r) => ({
    scheduleId: r.schedule_id,
    medicationId: r.medication_id,
    scheduledAt: r.scheduled_at,
    status: r.status,
    respondedAt: r.responded_at,
  }));
}
