import * as Network from 'expo-network';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useUserId } from '@/features/auth/useUserId';
import { useReminders } from '@/features/reminders/ReminderProvider';
import {
  getSyncState,
  onRemoteChanges,
  setSyncContext,
  subscribeSyncState,
  syncNow,
  type SyncState,
} from '@/features/sync/scheduler';
import { useDb } from '@/lib/db/DatabaseProvider';

const PERIODIC_MS = 10 * 60_000;

/** Keeps the phone and the server in step while the user is signed in. */
export function SyncProvider({ children }: { readonly children: ReactNode }) {
  const db = useDb();
  const userId = useUserId();
  const { syncNow: syncReminders } = useReminders();
  // A ref: the reminders context changes at every refresh, which must not restart the sync.
  const syncRemindersRef = useRef(syncReminders);
  useEffect(() => {
    syncRemindersRef.current = syncReminders;
  }, [syncReminders]);

  useEffect(() => {
    setSyncContext({ db, userId });
    void syncNow('app-open');

    // Changes made on another phone can add, move or remove reminders.
    const unsubscribeChanges = onRemoteChanges(() => void syncRemindersRef.current());

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncNow('foreground');
    });
    let wasOnline: boolean | null = null;
    const network = Network.addNetworkStateListener((event) => {
      const online = event.isInternetReachable ?? event.isConnected ?? false;
      if (online && wasOnline === false) void syncNow('network-back');
      wasOnline = online;
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void syncNow('periodic');
    }, PERIODIC_MS);

    return () => {
      unsubscribeChanges();
      appState.remove();
      network.remove();
      clearInterval(timer);
      setSyncContext(null);
    };
  }, [db, userId]);

  return children;
}

export function useSyncState(): SyncState {
  const [state, setState] = useState(getSyncState);
  useEffect(() => subscribeSyncState(setState), []);
  return state;
}
