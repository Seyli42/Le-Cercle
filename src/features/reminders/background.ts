/**
 * Code that must run even when the app is closed. Imported from index.ts, before any
 * screen, because the OS can start the app in the background just to run these tasks.
 */
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import {
  handleNotificationResponse,
  syncReminders,
  type ResponseLike,
} from '@/features/reminders/engine';
import { getLocalDb } from '@/lib/db/expoDb';
import { reportError } from '@/lib/monitoring';
import { supabase } from '@/lib/supabase';

// Also installs the foreground notification handler (module side effect).
import '@/features/reminders/notifications';

export const NOTIFICATION_RESPONSE_TASK = 'lecercle-notification-response';
export const REFRESH_TASK = 'lecercle-reminders-refresh';

/** Signed-in user, read from the session stored on the phone (works offline). */
export async function getStoredUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

function asResponse(payload: unknown): ResponseLike | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Partial<ResponseLike> & { actionIdentifier?: unknown };
  if (typeof value.actionIdentifier !== 'string' || !value.notification?.request?.content) {
    return null;
  }
  return value as ResponseLike;
}

// Android: a button pressed while the app is closed or in the background.
TaskManager.defineTask(NOTIFICATION_RESPONSE_TASK, async ({ data, error }) => {
  if (error) {
    reportError(error, 'reminders.backgroundResponse.task');
    return;
  }
  try {
    const response = asResponse(data);
    if (!response) return;
    const userId = await getStoredUserId();
    if (!userId) return;
    await handleNotificationResponse(await getLocalDb(), userId, response);
  } catch (e) {
    reportError(e, 'reminders.backgroundResponse');
  }
});

// Both platforms: periodic refresh of the rolling window of reminders.
TaskManager.defineTask(REFRESH_TASK, async () => {
  try {
    const userId = await getStoredUserId();
    if (userId) await syncReminders(await getLocalDb(), userId, { reason: 'background' });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    reportError(e, 'reminders.backgroundRefresh');
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

let registered = false;

export async function registerBackgroundTasks(): Promise<void> {
  if (registered) return;
  registered = true;
  try {
    if (Platform.OS === 'android') {
      await Notifications.registerTaskAsync(NOTIFICATION_RESPONSE_TASK);
    }
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Available) {
      // The OS decides the exact moment; every ~4 h is enough with a 10-30 day window.
      await BackgroundTask.registerTaskAsync(REFRESH_TASK, { minimumInterval: 4 * 60 });
    }
  } catch (error) {
    registered = false;
    reportError(error, 'reminders.registerBackgroundTasks');
  }
}
