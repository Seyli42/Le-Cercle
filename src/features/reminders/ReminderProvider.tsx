import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { canScheduleExactAlarms, isIgnoringBatteryOptimizations } from 'reminder-health';

import { useUserId } from '@/features/auth/useUserId';
import { registerBackgroundTasks } from '@/features/reminders/background';
import {
  getLastSyncResult,
  handleNotificationResponse,
  subscribeToSync,
  syncReminders,
  type SyncResult,
} from '@/features/reminders/engine';
import { computeIssues, type Issue, type ReminderHealth } from '@/features/reminders/health';
import { getPermissionState, requestPermission } from '@/features/reminders/notifications';
import { requestSync } from '@/features/sync/scheduler';
import { useDb } from '@/lib/db/DatabaseProvider';
import { reportError } from '@/lib/monitoring';

type ReminderContextValue = {
  readonly health: ReminderHealth | null;
  readonly issues: readonly Issue[];
  readonly sync: SyncResult | null;
  /** Increases whenever intakes or reminders changed: screens reload their data. */
  readonly version: number;
  readonly refresh: () => Promise<void>;
  readonly syncNow: () => Promise<void>;
  readonly askPermission: () => Promise<void>;
  /** To call after a medication was created, edited or deleted. */
  readonly afterMedicationChange: () => Promise<void>;
};

const ReminderContext = createContext<ReminderContextValue | null>(null);

async function readHealth(scheduleFailures: number): Promise<ReminderHealth> {
  const { state, canAskAgain } = await getPermissionState();
  return {
    permission: state,
    canAskAgain,
    exactAlarms: canScheduleExactAlarms(),
    ignoringBatteryOptimizations: isIgnoringBatteryOptimizations(),
    scheduleFailures,
  };
}

/** Runs the reminder engine while the user is signed in and the app is open. */
export function ReminderProvider({ children }: { readonly children: ReactNode }) {
  const db = useDb();
  const userId = useUserId();
  const [health, setHealth] = useState<ReminderHealth | null>(null);
  const [sync, setSync] = useState<SyncResult | null>(getLastSyncResult());
  const [version, setVersion] = useState(0);
  const exactAlarmsRef = useRef<boolean | null>(canScheduleExactAlarms());

  const refresh = useCallback(async () => {
    try {
      setHealth(await readHealth(getLastSyncResult()?.failures ?? 0));
    } catch (error) {
      reportError(error, 'reminders.health');
    }
  }, []);

  const runSync = useCallback(
    async (reason: string, force = false) => {
      try {
        await syncReminders(db, userId, { reason, force });
      } catch {
        // Already reported by the engine; the health check shows the problem.
      }
      await refresh();
    },
    [db, userId, refresh],
  );

  // Start: background tasks, first sync, and the reminder tapped to open the app.
  useEffect(() => {
    void registerBackgroundTasks();
    syncReminders(db, userId, { reason: 'app-open' })
      .catch(() => undefined) // Already reported by the engine.
      .then(() => readHealth(getLastSyncResult()?.failures ?? 0))
      .then(setHealth)
      .catch((error: unknown) => reportError(error, 'reminders.health'));

    const unsubscribe = subscribeToSync((result) => {
      setSync(result);
      setVersion((v) => v + 1);
      // Reminders are refreshed after every answer: send the answers to the server too.
      requestSync();
    });

    const onResponse = (response: Notifications.NotificationResponse) => {
      handleNotificationResponse(db, userId, response)
        .then((dose) => {
          if (dose) router.navigate('/');
        })
        .catch((error: unknown) => reportError(error, 'reminders.response'))
        .finally(() => Notifications.clearLastNotificationResponse());
    };
    const initial = Notifications.getLastNotificationResponse();
    if (initial) onResponse(initial);
    const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);

    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, [db, userId]);

  // Back to the app: settings may have changed, and answers given in the background
  // must show up in today's list.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const exact = canScheduleExactAlarms();
      // Alarms created while exact alarms were refused stay inexact: recreate them all.
      const force = exact === true && exactAlarmsRef.current === false;
      exactAlarmsRef.current = exact;
      void runSync('foreground', force);
    });
    return () => subscription.remove();
  }, [runSync]);

  const value = useMemo<ReminderContextValue>(
    () => ({
      health,
      issues: health ? computeIssues(health) : [],
      sync,
      version,
      refresh,
      syncNow: () => runSync('manual'),
      askPermission: async () => {
        try {
          await requestPermission();
        } catch (error) {
          reportError(error, 'reminders.requestPermission');
        }
        await runSync('permission');
      },
      afterMedicationChange: async () => {
        const { state } = await getPermissionState().catch(() => ({ state: 'granted' as const }));
        // Asked in context, right after the first medication: the reason is obvious.
        if (state === 'undetermined') await requestPermission().catch(() => undefined);
        await runSync('medication-change');
      },
    }),
    [health, sync, version, refresh, runSync],
  );

  return <ReminderContext.Provider value={value}>{children}</ReminderContext.Provider>;
}

export function useReminders(): ReminderContextValue {
  const context = useContext(ReminderContext);
  if (!context) throw new Error('useReminders must be used inside <ReminderProvider>.');
  return context;
}
