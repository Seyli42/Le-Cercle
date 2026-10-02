import type { Medication } from '@/features/medications/types';
import type { DoseEvent } from '@/features/reminders/doseEvents';
import { occurrenceKey, upcomingOccurrences, type Occurrence } from '@/features/reminders/planner';

export type TodayStatus = 'taken' | 'skipped' | 'snoozed' | 'due' | 'late' | 'upcoming';

export type TodayDose = {
  readonly occurrence: Occurrence;
  readonly status: TodayStatus;
  readonly respondedAt: string | null;
  /** "Pris" / "Passer" are offered from 2 h before the intake. */
  readonly canAnswer: boolean;
};

const EARLY_WINDOW_MS = 2 * 3600_000;
const DUE_WINDOW_MS = 60 * 60_000;

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** Every intake of the day with what happened to it. */
export function buildTodayDoses(
  medications: readonly Medication[],
  events: readonly DoseEvent[],
  now: Date,
): TodayDose[] {
  const byKey = new Map(events.map((e) => [occurrenceKey(e.scheduleId, e.scheduledAt), e]));
  const from = new Date(startOfLocalDay(now).getTime() - 1);
  return upcomingOccurrences(medications, from, endOfLocalDay(now)).map((occurrence) => {
    const event = byKey.get(occurrenceKey(occurrence.scheduleId, occurrence.at));
    const answered: 'taken' | 'skipped' | 'snoozed' | null =
      event?.status === 'taken' || event?.status === 'skipped' || event?.status === 'snoozed'
        ? event.status
        : null;
    const elapsed = now.getTime() - occurrence.at.getTime();
    const status: TodayStatus = answered
      ? answered
      : elapsed < 0
        ? 'upcoming'
        : elapsed < DUE_WINDOW_MS
          ? 'due'
          : 'late';
    return {
      occurrence,
      status,
      respondedAt: answered ? (event?.respondedAt ?? null) : null,
      canAnswer: status !== 'taken' && status !== 'skipped' && elapsed >= -EARLY_WINDOW_MS,
    };
  });
}
