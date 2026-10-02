import type { MedicationForm } from '@/lib/database.types';

export type { MedicationForm };

/** ISO weekday: 1 = Monday … 7 = Sunday (same convention as the server). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const ALL_WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export type Schedule = {
  readonly id: string;
  /** Local time "HH:MM", 24 h. */
  readonly timeOfDay: string;
  readonly daysOfWeek: readonly Weekday[];
  /** When the schedule was created: no intake is expected before (history). */
  readonly createdAt?: string;
};

export type Medication = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly form: MedicationForm;
  /** Exactly what the user typed ("1 comprimé", "5 ml"): never computed by the app. */
  readonly doseLabel: string;
  /** Local date "YYYY-MM-DD". */
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly notes: string | null;
  readonly schedules: readonly Schedule[];
  readonly updatedAt: string;
};

export type ScheduleInput = {
  readonly timeOfDay: string;
  readonly daysOfWeek: readonly Weekday[];
};

export type MedicationInput = {
  readonly name: string;
  readonly form: MedicationForm;
  readonly doseLabel: string;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly notes: string | null;
  readonly schedules: readonly ScheduleInput[];
};
