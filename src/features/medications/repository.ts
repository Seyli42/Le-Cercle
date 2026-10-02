import type { Medication, MedicationInput, Schedule, Weekday } from '@/features/medications/types';
import { validateMedicationInput, type FieldErrors } from '@/features/medications/validation';
import type { LocalDb } from '@/lib/db/types';
import { AppError } from '@/lib/errors';

export type RepositoryDeps = {
  readonly now: () => Date;
  readonly uuid: () => string;
};

/** Thrown when input is invalid; `fieldErrors` says which field to fix. */
export class MedicationValidationError extends AppError {
  readonly fieldErrors: FieldErrors;
  constructor(fieldErrors: FieldErrors) {
    super('validation', 'Certaines informations sont à corriger.');
    this.fieldErrors = fieldErrors;
  }
}

type MedicationRow = {
  id: string;
  user_id: string;
  name: string;
  form: Medication['form'];
  dose_label: string;
  starts_on: string;
  ends_on: string | null;
  notes: string | null;
  updated_at: string;
};

type ScheduleRow = {
  id: string;
  medication_id: string;
  time_of_day: string;
  days_of_week: string;
};

function parseDays(raw: string): Weekday[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) {
      return value.filter((d): d is Weekday => typeof d === 'number' && d >= 1 && d <= 7);
    }
  } catch {
    // Corrupted row: treated as "no day" rather than crashing the list.
  }
  return [];
}

function toMedication(row: MedicationRow, schedules: readonly ScheduleRow[]): Medication {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    form: row.form,
    doseLabel: row.dose_label,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    notes: row.notes,
    updatedAt: row.updated_at,
    schedules: schedules
      .filter((s) => s.medication_id === row.id)
      .map((s): Schedule => ({
        id: s.id,
        timeOfDay: s.time_of_day,
        daysOfWeek: parseDays(s.days_of_week),
      }))
      .sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay)),
  };
}

const MEDICATION_COLUMNS =
  'id, user_id, name, form, dose_label, starts_on, ends_on, notes, updated_at';

export async function listMedications(db: LocalDb, userId: string): Promise<Medication[]> {
  const rows = await db.getAllAsync<MedicationRow>(
    `SELECT ${MEDICATION_COLUMNS} FROM medications
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY name COLLATE NOCASE`,
    [userId],
  );
  const schedules = await db.getAllAsync<ScheduleRow>(
    `SELECT id, medication_id, time_of_day, days_of_week FROM schedules
     WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  return rows.map((row) => toMedication(row, schedules));
}

export async function getMedication(
  db: LocalDb,
  userId: string,
  id: string,
): Promise<Medication | null> {
  const row = await db.getFirstAsync<MedicationRow>(
    `SELECT ${MEDICATION_COLUMNS} FROM medications
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, userId],
  );
  if (!row) return null;
  const schedules = await db.getAllAsync<ScheduleRow>(
    `SELECT id, medication_id, time_of_day, days_of_week FROM schedules
     WHERE medication_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, userId],
  );
  return toMedication(row, schedules);
}

function validOrThrow(input: MedicationInput): MedicationInput {
  const result = validateMedicationInput(input);
  if (!result.ok) throw new MedicationValidationError(result.errors);
  return result.value;
}

/**
 * Replaces the schedules of a medication. A time that still exists keeps its id, so the
 * reminders and the intake history attached to it stay linked (important for sync).
 */
async function writeSchedules(
  tx: LocalDb,
  userId: string,
  medicationId: string,
  input: MedicationInput,
  timestamp: string,
  deps: RepositoryDeps,
): Promise<void> {
  const existing = await tx.getAllAsync<ScheduleRow>(
    `SELECT id, medication_id, time_of_day, days_of_week FROM schedules
     WHERE medication_id = ? AND deleted_at IS NULL`,
    [medicationId],
  );
  const byTime = new Map(existing.map((s) => [s.time_of_day, s]));

  for (const schedule of input.schedules) {
    const days = JSON.stringify(schedule.daysOfWeek);
    const current = byTime.get(schedule.timeOfDay);
    if (current) {
      byTime.delete(schedule.timeOfDay);
      if (current.days_of_week !== days) {
        await tx.runAsync(
          `UPDATE schedules SET days_of_week = ?, updated_at = ?, sync_status = 'pending'
           WHERE id = ?`,
          [days, timestamp, current.id],
        );
      }
    } else {
      await tx.runAsync(
        `INSERT INTO schedules (id, user_id, medication_id, time_of_day, days_of_week, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [deps.uuid(), userId, medicationId, schedule.timeOfDay, days, timestamp, timestamp],
      );
    }
  }
  for (const removed of byTime.values()) {
    await tx.runAsync(
      `UPDATE schedules SET deleted_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
      [timestamp, timestamp, removed.id],
    );
  }
}

export async function createMedication(
  db: LocalDb,
  userId: string,
  rawInput: MedicationInput,
  deps: RepositoryDeps,
): Promise<Medication> {
  const input = validOrThrow(rawInput);
  const id = deps.uuid();
  const timestamp = deps.now().toISOString();
  await db.transaction(async (tx) => {
    await tx.runAsync(
      `INSERT INTO medications (id, user_id, name, form, dose_label, starts_on, ends_on, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        input.name,
        input.form,
        input.doseLabel,
        input.startsOn,
        input.endsOn,
        input.notes,
        timestamp,
        timestamp,
      ],
    );
    await writeSchedules(tx, userId, id, input, timestamp, deps);
  });
  const saved = await getMedication(db, userId, id);
  if (!saved) throw new AppError('unknown', 'L’enregistrement a échoué. Réessayez.');
  return saved;
}

export async function updateMedication(
  db: LocalDb,
  userId: string,
  id: string,
  rawInput: MedicationInput,
  deps: RepositoryDeps,
): Promise<Medication> {
  const input = validOrThrow(rawInput);
  const timestamp = deps.now().toISOString();
  await db.transaction(async (tx) => {
    const result = await tx.runAsync(
      `UPDATE medications
       SET name = ?, form = ?, dose_label = ?, starts_on = ?, ends_on = ?, notes = ?,
           updated_at = ?, sync_status = 'pending'
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [
        input.name,
        input.form,
        input.doseLabel,
        input.startsOn,
        input.endsOn,
        input.notes,
        timestamp,
        id,
        userId,
      ],
    );
    if (result.changes === 0) {
      throw new AppError('validation', 'Ce médicament n’existe plus.');
    }
    await writeSchedules(tx, userId, id, input, timestamp, deps);
  });
  const saved = await getMedication(db, userId, id);
  if (!saved) throw new AppError('unknown', 'L’enregistrement a échoué. Réessayez.');
  return saved;
}

/** Soft delete: the row stays until the deletion has reached the server (step 5). */
export async function deleteMedication(
  db: LocalDb,
  userId: string,
  id: string,
  deps: Pick<RepositoryDeps, 'now'>,
): Promise<void> {
  const timestamp = deps.now().toISOString();
  await db.transaction(async (tx) => {
    await tx.runAsync(
      `UPDATE medications SET deleted_at = ?, updated_at = ?, sync_status = 'pending'
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [timestamp, timestamp, id, userId],
    );
    await tx.runAsync(
      `UPDATE schedules SET deleted_at = ?, updated_at = ?, sync_status = 'pending'
       WHERE medication_id = ? AND user_id = ? AND deleted_at IS NULL`,
      [timestamp, timestamp, id, userId],
    );
  });
}
