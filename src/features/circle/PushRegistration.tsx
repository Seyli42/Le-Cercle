import { useEffect } from 'react';
import { AppState } from 'react-native';

import { registerPushToken } from '@/features/circle/push';
import { reportError } from '@/lib/monitoring';
import { supabase } from '@/lib/supabase';

/**
 * Keeps this phone registered for the circle alerts (at launch and when coming back to
 * the app: the token can change, notifications can be allowed in the settings meanwhile).
 */
export function PushRegistration() {
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const register = () =>
      void registerPushToken(client).catch((error: unknown) =>
        reportError(error, 'circle.registerPush', { expected: true }),
      );
    register();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') register();
    });
    return () => subscription.remove();
  }, []);
  return null;
}
