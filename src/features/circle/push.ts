/**
 * Registers this phone to receive the circle alerts (Expo push token, free). Done for
 * every signed-in account: anyone can start watching over a relative at any time, and
 * the server only notifies watchers.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AppSupabaseClient } from '@/lib/supabase';

const TOKEN_KEY = 'push_token_v1';

export type PushRegistration = 'registered' | 'no_permission' | 'unavailable';

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

export async function registerPushToken(client: AppSupabaseClient): Promise<PushRegistration> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unavailable';
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return 'no_permission';
  const id = projectId();
  // Development without EAS project (see docs/PUBLICATION.md): no remote notifications.
  if (!id) return 'unavailable';
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  const { error } = await client.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS,
  });
  if (error) throw new Error(error.message);
  await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => undefined);
  return 'registered';
}

/** Sign-out: this phone stops receiving the alerts of this account. */
export async function unregisterPushToken(client: AppSupabaseClient): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  if (!token) return;
  const { error } = await client.rpc('unregister_push_token', { p_token: token });
  if (error) throw new Error(error.message);
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
}
