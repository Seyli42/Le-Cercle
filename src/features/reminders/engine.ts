import { t } from '@/i18n';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';

import { listMedications } from '@/features/medications/repository';
import { listDoseEvents, recordDose, type RecordDoseInput } from '@/features/reminders/doseEvents';
import {
  ACTIONS,
  configureNotifications,
  DOSE_BUDGET,
  getPermissionState,
  parseNotificationData,
  scheduleAt,
  SNOOZE_MINUTES,
} from '@/features/reminders/notifications';
import {
  diffSchedule,
  MAX_HORIZON_DAYS,
  occurrenceKey,
  OWN_PREFIXES,
  planReminders,
  SNOOZE_PREFIX,
  type DoseNotificationData,
} from '@/features/reminders/planner';
import type { LocalDb } from '@/lib/db/types';
import { reportError } from '@/lib/monitoring';

export type SyncResult = {
  readonly at: Date;
  readonly permission: 'granted' | 'denied' | 'undetermined';
  /** Reminders currently waiting on the phone (intakes and snoozes). */
  readonly pending: number;
  readonly nextAt: Date | null;
  readonly coveredUntil: Date | null;
  readonly truncated: boolean;
  /** Notifications that could not be scheduled (reported to Sentry). */
  readonly failures: number;
};

/** No reminder is planned for these intakes (a snoozed one has its own snooze reminder). */
const ANSWERED = new Set(['taken', 'skipped', 'snoozed']);
const FINAL = new Set(['taken', 'skipped']);
const deps = { now: () => new Date(), uuid: () => Crypto.randomUUID() };

let lastResult: SyncResult | null = null;
const listeners = new Set<(result: SyncResult) => void>();

export function getLastSyncResult(): SyncResult | null {
  return lastResult;
}

export function subscribeToSync(listener: (result: SyncResult) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Every change goes through this queue: two refreshes running at the same time could
// both see a reminder as missing and schedule it twice.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function answerKeys(
  db: LocalDb,
  userId: string,
  now: Date,
): Promise<{ answered: Set<string>; finalAnswers: Set<string> }> {
  const from = new Date(now.getTime() - 24 * 3600_000);
  const to = new Date(now.getTime() + (MAX_HORIZON_DAYS + 1) * 24 * 3600_000);
  const events = await listDoseEvents(db, userId, from, to);
  const keys = (statuses: Set<string>) =>
    new Set(
      events
        .filter((e) => statuses.has(e.status))
        .map((e) => occurrenceKey(e.scheduleId, e.scheduledAt)),
    );
  return { answered: keys(ANSWERED), finalAnswers: keys(FINAL) };
}

async function ownScheduled() {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all
    .filter((n) => OWN_PREFIXES.some((prefix) => n.identifier.startsWith(prefix)))
    .map((n) => ({ identifier: n.identifier, data: parseNotificationData(n.content.data) }));
}

/**
 * Brings the notifications scheduled on the phone in line with the medications.
 * `force` reschedules everything (needed after Android grants exact alarms: alarms
 * created before stay inexact otherwise).
 */
export function syncReminders(
  db: LocalDb,
  userId: string,
  options: { readonly force?: boolean; readonly reason: string },
): Promise<SyncResult> {
  return serialized(async () => {
    const now = new Date();
    try {
      await configureNotifications();
      const { state: permission } = await getPermissionState();
      const medications = await listMedications(db, userId);
      const { answered, finalAnswers } = await answerKeys(db, userId, now);
      const plan = planReminders({ userId, medications, answered, now, budget: DOSE_BUDGET });

      let scheduled = await ownScheduled();
      if (options.force) {
        const forced = scheduled.filter((n) => !n.identifier.startsWith(SNOOZE_PREFIX));
        await Promise.all(
          forced.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
        );
        scheduled = scheduled.filter((n) => n.identifier.startsWith(SNOOZE_PREFIX));
      }

      const activeScheduleIds = new Set(medications.flatMap((m) => m.schedules.map((s) => s.id)));
      const { toCancel, toSchedule } = diffSchedule(plan.notifications, scheduled, {
        finalAnswers,
        activeScheduleIds,
      });

      for (const identifier of toCancel) {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      }
      // Without permission nothing would be displayed, but scheduling anyway means the
      // reminders ring as soon as the user allows notifications.
      let failures = 0;
      for (const notification of toSchedule) {
        try {
          await scheduleAt(notification);
        } catch (error) {
          failures += 1;
          if (failures === 1) reportError(error, 'reminders.schedule');
        }
      }

      const remaining = await ownScheduled();
      const nextDose = plan.notifications.find((n) => n.data.kind === 'dose');
      const result: SyncResult = {
        at: now,
        permission,
        pending: remaining.length,
        nextAt: nextDose?.at ?? null,
        coveredUntil: plan.coveredUntil,
        truncated: plan.truncated,
        failures,
      };
      lastResult = result;
      listeners.forEach((listener) => listener(result));
      return result;
    } catch (error) {
      throw reportError(error, `reminders.sync.${options.reason}`);
    }
  });
}

/** Removes every reminder of DoseCircle (sign-out: nobody should be reminded anymore). */
export function cancelAllReminders(): Promise<void> {
  return serialized(async () => {
    const scheduled = await ownScheduled();
    await Promise.all(
      scheduled.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
    lastResult = null;
  });
}

/** Hides the reminders already displayed for an intake once it has been answered. */
async function dismissPresented(scheduleId: string, scheduledAt: string): Promise<void> {
  const key = occurrenceKey(scheduleId, scheduledAt);
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    presented
      .filter((n) => {
        const data = parseNotificationData(n.request.content.data);
        return data?.kind === 'dose' && occurrenceKey(data.scheduleId, data.scheduledAt) === key;
      })
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
  );
}

/** Answer given in the app (today's list) or through a notification button. */
export async function answerDose(
  db: LocalDb,
  userId: string,
  input: RecordDoseInput,
): Promise<void> {
  await recordDose(db, userId, input, deps);
  await dismissPresented(input.scheduleId, input.scheduledAt).catch((error: unknown) =>
    reportError(error, 'reminders.dismiss', { expected: true }),
  );
  await syncReminders(db, userId, { reason: 'answer' });
}

async function snooze(
  db: LocalDb,
  userId: string,
  data: DoseNotificationData,
  content: { title: string | null; body: string | null },
): Promise<void> {
  await recordDose(db, userId, { ...data, status: 'snoozed' }, deps);
  const at = new Date(Date.now() + SNOOZE_MINUTES * 60_000);
  await scheduleAt({
    // Same identifier for the same intake: snoozing twice replaces, never duplicates.
    identifier: `${SNOOZE_PREFIX}${data.scheduleId}_${data.scheduledAt.replace(/[-:.]/g, '')}`,
    at,
    title: content.title ?? t('notifications.snoozedTitle'),
    body: `${content.body ?? ''} ${t('notifications.snoozedSuffix')}`.trim(),
    data,
  });
  await dismissPresented(data.scheduleId, data.scheduledAt).catch(() => undefined);
  await syncReminders(db, userId, { reason: 'snooze' });
}

export type ResponseLike = {
  readonly actionIdentifier: string;
  readonly notification: {
    readonly request: {
      readonly identifier: string;
      readonly content: {
        readonly title: string | null;
        readonly body: string | null;
        readonly data?: unknown;
      };
    };
  };
};

const handled = new Set<string>();

/**
 * Applies the button pressed on a reminder. Safe to call twice for the same tap (it can
 * arrive through both the background task and the app): the answer is idempotent.
 * Returns the intake concerned, so the app can open it.
 */
export async function handleNotificationResponse(
  db: LocalDb,
  currentUserId: string,
  response: ResponseLike,
): Promise<DoseNotificationData | null> {
  const data = parseNotificationData(response.notification.request.content.data);
  // A reminder planned for another account (before a sign-out) is ignored.
  if (!data || data.userId !== currentUserId) return null;
  if (data.kind === 'safety') {
    await syncReminders(db, currentUserId, { reason: 'safety' });
    return null;
  }

  const dedupeKey = `${response.notification.request.identifier}|${response.actionIdentifier}`;
  if (handled.has(dedupeKey)) return data;
  handled.add(dedupeKey);

  switch (response.actionIdentifier) {
    case ACTIONS.taken:
      await answerDose(db, currentUserId, { ...data, status: 'taken' });
      break;
    case ACTIONS.skip:
      await answerDose(db, currentUserId, { ...data, status: 'skipped' });
      break;
    case ACTIONS.snooze:
      await snooze(db, currentUserId, data, response.notification.request.content);
      break;
    default:
      // Tap on the notification itself: the app opens on the intake, nothing is recorded.
      break;
  }
  return data;
}
