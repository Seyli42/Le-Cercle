import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { env } from '@/config/env';
import type { Database } from '@/lib/database.types';
import { AppError, DEFAULT_MESSAGES } from '@/lib/errors';
import { secureStorage } from '@/lib/secureStorage';

export type AppSupabaseClient = SupabaseClient<Database>;

/** null only in development when .env is not filled in (a dedicated screen explains it). */
export const supabase: AppSupabaseClient | null = env.supabase
  ? createClient<Database>(env.supabase.url, env.supabase.publishableKey, {
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function requireSupabase(): AppSupabaseClient {
  if (!supabase) throw new AppError('unknown', DEFAULT_MESSAGES.unknown);
  return supabase;
}

// Refresh the session only while the app is in the foreground (Supabase recommendation
// for React Native: timers are unreliable in the background).
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
