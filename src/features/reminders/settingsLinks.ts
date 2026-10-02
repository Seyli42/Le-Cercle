import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';
import { getAndroidPackageName } from 'reminder-health';

import type { IssueAction } from '@/features/reminders/health';
import { reportError } from '@/lib/monitoring';

/** Opens the system screen that fixes an issue. Falls back to the app settings. */
export async function openSystemSettings(
  kind: Exclude<IssueAction, 'request-permission' | 'retry-sync'>,
): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      const pkg = getAndroidPackageName();
      if (kind === 'open-exact-alarm-settings' && pkg) {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM,
          { data: `package:${pkg}` },
        );
        return;
      }
      if (kind === 'open-battery-settings') {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
        );
        return;
      }
    }
    await Linking.openSettings();
  } catch (error) {
    reportError(error, `reminders.openSettings.${kind}`, { expected: true });
    await Linking.openSettings().catch(() => undefined);
  }
}
