import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotificationData, PlannedNotification } from '@/features/reminders/planner';

export const CHANNEL_ID = 'reminders';
export const DOSE_CATEGORY = 'dose';

export const ACTIONS = {
  taken: 'TAKEN',
  snooze: 'SNOOZE',
  skip: 'SKIP',
} as const;

export const SNOOZE_MINUTES = 10;

/**
 * iOS keeps 64 pending notifications per app: 60 intakes + 1 "open the app" + 3 snoozes.
 * Android has no such limit (≈500 alarms per app): 200 intakes cover several weeks.
 */
export const DOSE_BUDGET = Platform.OS === 'ios' ? 60 : 200;

// Shows reminders even while the app is open on screen.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

let configured: Promise<void> | null = null;

/** Creates the Android channel and the action buttons. Safe to call many times. */
export function configureNotifications(): Promise<void> {
  configured ??= (async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Rappels de médicaments',
        description: 'Les rappels de prise. Désactiver ce canal arrête tous les rappels.',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 400, 250, 400],
        enableVibrate: true,
        showBadge: false,
      });
    }
    // iOS cannot reliably run code in the background for a button: the buttons open the
    // app, which records the answer. Android handles them in a background task.
    const opensApp = Platform.OS === 'ios';
    await Notifications.setNotificationCategoryAsync(DOSE_CATEGORY, [
      {
        identifier: ACTIONS.taken,
        buttonTitle: '✓ Pris',
        options: { opensAppToForeground: opensApp },
      },
      {
        identifier: ACTIONS.snooze,
        buttonTitle: `Dans ${SNOOZE_MINUTES} min`,
        options: { opensAppToForeground: opensApp },
      },
      {
        identifier: ACTIONS.skip,
        buttonTitle: 'Passer',
        options: { opensAppToForeground: opensApp, isDestructive: true },
      },
    ]);
  })().catch((error: unknown) => {
    configured = null;
    throw error;
  });
  return configured;
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getPermissionState(): Promise<{
  state: PermissionState;
  canAskAgain: boolean;
}> {
  const result = await Notifications.getPermissionsAsync();
  const provisional =
    result.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    result.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL;
  const state: PermissionState =
    result.granted || provisional
      ? 'granted'
      : result.status === Notifications.PermissionStatus.DENIED
        ? 'denied'
        : 'undetermined';
  return { state, canAskAgain: result.canAskAgain };
}

export async function requestPermission(): Promise<PermissionState> {
  await configureNotifications();
  await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return (await getPermissionState()).state;
}

/** Schedules one notification at an exact date (the trigger type used for every intake). */
export async function scheduleAt(
  notification: Pick<PlannedNotification, 'identifier' | 'at' | 'title' | 'body' | 'data'>,
): Promise<void> {
  const isDose = notification.data.kind === 'dose';
  await Notifications.scheduleNotificationAsync({
    identifier: notification.identifier,
    content: {
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      // Breaks through iOS Focus modes (requires the time-sensitive entitlement).
      interruptionLevel: 'timeSensitive',
      ...(isDose ? { categoryIdentifier: DOSE_CATEGORY } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: notification.at,
      channelId: CHANNEL_ID,
    },
  });
}

/** Reads the data we attached to a notification, refusing anything malformed. */
export function parseNotificationData(raw: unknown): NotificationData | null {
  if (typeof raw === 'string') {
    try {
      return parseNotificationData(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.userId !== 'string') return null;
  if (data.kind === 'safety') return { kind: 'safety', userId: data.userId };
  if (
    data.kind === 'dose' &&
    typeof data.scheduleId === 'string' &&
    typeof data.medicationId === 'string' &&
    typeof data.scheduledAt === 'string' &&
    !Number.isNaN(Date.parse(data.scheduledAt))
  ) {
    return {
      kind: 'dose',
      userId: data.userId,
      scheduleId: data.scheduleId,
      medicationId: data.medicationId,
      scheduledAt: data.scheduledAt,
    };
  }
  return null;
}
