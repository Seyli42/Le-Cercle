/**
 * Reminder planner: turns medications into a list of local notifications to schedule.
 *
 * Pure functions only (no phone APIs) so every rule is covered by tests.
 *
 * Design choices (reliability first):
 * - One notification per intake ("one-shot"), never a repeating trigger: a dose taken
 *   early, skipped or snoozed can then be cancelled individually, so the phone never
 *   says "take your medication" for a dose already taken (risk of double dose).
 * - iOS keeps at most 64 pending notifications per app. The plan is therefore a rolling
 *   window, refreshed at every app opening, after every change, after every answer to
 *   a reminder and by a periodic background task.
 * - If the window is cut short by that limit, a last "open the app" notification is
 *   planned right after the last reminder so the user is never left silently without.
 */

import { t } from '@/i18n';
import type { Medication, Weekday } from '@/features/medications/types';

export type Occurrence = {
  readonly scheduleId: string;
  readonly medicationId: string;
  readonly medicationName: string;
  readonly doseLabel: string;
  /** Local "HH:MM" of the schedule, for display. */
  readonly timeOfDay: string;
  /** Exact instant of the intake. */
  readonly at: Date;
};

export type DoseNotificationData = {
  readonly kind: 'dose';
  readonly userId: string;
  readonly scheduleId: string;
  readonly medicationId: string;
  /** ISO instant of the planned intake (not of a snooze). */
  readonly scheduledAt: string;
};

export type SafetyNotificationData = { readonly kind: 'safety'; readonly userId: string };

export type NotificationData = DoseNotificationData | SafetyNotificationData;

export type PlannedNotification = {
  readonly identifier: string;
  readonly at: Date;
  readonly title: string;
  readonly body: string;
  readonly data: NotificationData;
};

export const DOSE_PREFIX = 'dose_';
export const SNOOZE_PREFIX = 'snooze_';
export const SAFETY_PREFIX = 'safety_';
/** Notifications scheduled by DoseCircle (others, e.g. from tests, are left alone). */
export const OWN_PREFIXES = [DOSE_PREFIX, SNOOZE_PREFIX, SAFETY_PREFIX] as const;

export const MAX_HORIZON_DAYS = 30;

/** ISO weekday of a local date: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: Date): Weekday {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as Weekday;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Key identifying one intake, identical to the (schedule_id, scheduled_at) unique key. */
export function occurrenceKey(scheduleId: string, at: Date | string): string {
  const iso = typeof at === 'string' ? new Date(at).toISOString() : at.toISOString();
  return `${scheduleId}@${iso}`;
}

/**
 * Every intake strictly after `from` and up to `until` (inclusive), sorted by time.
 * Uses the phone's local time, so daylight saving changes are handled by the calendar.
 */
export function upcomingOccurrences(
  medications: readonly Medication[],
  from: Date,
  until: Date,
): Occurrence[] {
  const result: Occurrence[] = [];
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (day <= until) {
    const dateKey = localDateKey(day);
    const weekday = isoWeekday(day);
    for (const medication of medications) {
      if (dateKey < medication.startsOn) continue;
      if (medication.endsOn !== null && dateKey > medication.endsOn) continue;
      for (const schedule of medication.schedules) {
        if (!schedule.daysOfWeek.includes(weekday)) continue;
        const [hours, minutes] = schedule.timeOfDay.split(':').map(Number);
        if (hours === undefined || minutes === undefined) continue;
        const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
        // A time skipped by the spring DST change (e.g. 02:30) is moved by JS to 03:30:
        // the reminder still rings, one hour later, rather than not at all.
        if (at > from && at <= until) {
          result.push({
            scheduleId: schedule.id,
            medicationId: medication.id,
            medicationName: medication.name,
            doseLabel: medication.doseLabel,
            timeOfDay: schedule.timeOfDay,
            at,
          });
        }
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return result.sort(
    (a, b) => a.at.getTime() - b.at.getTime() || a.medicationName.localeCompare(b.medicationName),
  );
}

/** Small stable hash, so that renaming a medication replaces its pending notifications. */
function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

function compactInstant(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').slice(0, 13);
}

export function doseContent(
  occurrence: Pick<Occurrence, 'medicationName' | 'doseLabel' | 'timeOfDay'>,
) {
  return {
    title: `💊 ${occurrence.medicationName}`,
    body: t('notifications.doseBody', { time: occurrence.timeOfDay, dose: occurrence.doseLabel }),
  };
}

export type PlanInput = {
  readonly userId: string;
  readonly medications: readonly Medication[];
  /** Keys (see occurrenceKey) of intakes already answered: taken, skipped or snoozed. */
  readonly answered: ReadonlySet<string>;
  readonly now: Date;
  /** Maximum number of dose notifications (platform limit minus a margin). */
  readonly budget: number;
  readonly horizonDays?: number;
};

export type Plan = {
  readonly notifications: readonly PlannedNotification[];
  /** Last planned reminder, or null if there is nothing to remind. */
  readonly coveredUntil: Date | null;
  /** True when the platform limit cut the plan before the horizon. */
  readonly truncated: boolean;
};

export function planReminders(input: PlanInput): Plan {
  const horizon = new Date(input.now);
  horizon.setDate(horizon.getDate() + (input.horizonDays ?? MAX_HORIZON_DAYS));

  const pending = upcomingOccurrences(input.medications, input.now, horizon).filter(
    (o) => !input.answered.has(occurrenceKey(o.scheduleId, o.at)),
  );
  const kept = pending.slice(0, Math.max(0, input.budget));
  const truncated = pending.length > kept.length;

  const notifications: PlannedNotification[] = kept.map((o) => {
    const content = doseContent(o);
    return {
      identifier: `${DOSE_PREFIX}${o.scheduleId}_${compactInstant(o.at)}_${shortHash(content.title + content.body)}`,
      at: o.at,
      ...content,
      data: {
        kind: 'dose',
        userId: input.userId,
        scheduleId: o.scheduleId,
        medicationId: o.medicationId,
        scheduledAt: o.at.toISOString(),
      },
    };
  });

  const last = kept.at(-1);
  if (truncated && last) {
    const at = new Date(last.at.getTime() + 60_000);
    notifications.push({
      identifier: `${SAFETY_PREFIX}${compactInstant(at)}`,
      at,
      title: t('notifications.safetyTitle'),
      body: t('notifications.safetyBody'),
      data: { kind: 'safety', userId: input.userId },
    });
  }

  return { notifications, coveredUntil: last?.at ?? null, truncated };
}

export type ScheduledSummary = {
  readonly identifier: string;
  readonly data: Partial<NotificationData> | null;
};

/**
 * Compares what is scheduled on the phone with what should be, and returns the minimal
 * set of changes. Untouched notifications keep ringing even if applying the diff fails.
 */
export function diffSchedule(
  plan: readonly PlannedNotification[],
  scheduled: readonly ScheduledSummary[],
  context: {
    /** Intakes taken or skipped: their snoozes are obsolete. (A snooze is not final.) */
    readonly finalAnswers: ReadonlySet<string>;
    readonly activeScheduleIds: ReadonlySet<string>;
  },
): { toCancel: string[]; toSchedule: PlannedNotification[] } {
  const wanted = new Set(plan.map((n) => n.identifier));
  const present = new Set(scheduled.map((n) => n.identifier));

  const toCancel = scheduled
    .filter((n) => {
      if (n.identifier.startsWith(SNOOZE_PREFIX)) {
        // A snooze stays unless its dose was answered since, or the schedule was removed.
        const data = n.data;
        if (!data || data.kind !== 'dose' || !data.scheduleId || !data.scheduledAt) return true;
        return (
          !context.activeScheduleIds.has(data.scheduleId) ||
          context.finalAnswers.has(occurrenceKey(data.scheduleId, data.scheduledAt))
        );
      }
      return (
        (n.identifier.startsWith(DOSE_PREFIX) || n.identifier.startsWith(SAFETY_PREFIX)) &&
        !wanted.has(n.identifier)
      );
    })
    .map((n) => n.identifier);

  const toSchedule = plan.filter((n) => !present.has(n.identifier));
  return { toCancel, toSchedule };
}
