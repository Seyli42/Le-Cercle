import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useUserId } from '@/features/auth/useUserId';
import {
  resolvePremium,
  type Grant,
  type GrantStatus,
  type PremiumResolution,
  type StoreStatus,
} from '@/features/monetization/premiumState';
import {
  addPremiumListener,
  connectPurchases,
  disconnectPurchases,
  hasPremium,
  revenueCatKey,
} from '@/features/monetization/purchases';
import { reportError } from '@/lib/monitoring';
import { supabase } from '@/lib/supabase';

const GRANT_CACHE_KEY = 'premium_grant_v1';

type Value = PremiumResolution & {
  /** False when the stores are not configured (development without RevenueCat keys). */
  readonly canPurchase: boolean;
  /** Called by the Premium screen after a purchase or a restore. */
  readonly setStoreActive: (active: boolean) => void;
};

const PremiumContext = createContext<Value | null>(null);

async function readCachedGrant(userId: string): Promise<Grant | null | undefined> {
  const raw = await SecureStore.getItemAsync(GRANT_CACHE_KEY).catch(() => null);
  if (!raw) return undefined;
  try {
    const cached = JSON.parse(raw) as { userId: string; grant: Grant | null };
    return cached.userId === userId ? cached.grant : undefined;
  } catch {
    return undefined;
  }
}

/** Is the signed-in person Premium? (store subscription or grant). */
export function PremiumProvider({ children }: { readonly children: ReactNode }) {
  const userId = useUserId();
  const apiKey = revenueCatKey();
  const [store, setStore] = useState<StoreStatus>(apiKey ? 'loading' : 'unavailable');
  const [grant, setGrant] = useState<GrantStatus>('loading');

  useEffect(() => {
    if (!apiKey) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    connectPurchases(apiKey, userId)
      .then((info) => {
        if (!active) return;
        setStore(hasPremium(info) ? 'active' : 'inactive');
        unsubscribe = addPremiumListener((premium) => setStore(premium ? 'active' : 'inactive'));
      })
      .catch((error: unknown) => {
        // Unknown => no ads (see resolvePremium); retried at the next launch.
        reportError(error, 'premium.store', { expected: true });
        if (active) setStore('error');
      });
    return () => {
      active = false;
      unsubscribe();
      void disconnectPurchases().catch(() => undefined);
    };
  }, [apiKey, userId]);

  useEffect(() => {
    let active = true;
    const set = (value: GrantStatus) => {
      if (active) setGrant(value);
    };
    (async () => {
      const cached = await readCachedGrant(userId);
      if (!supabase) return set(cached ?? null);
      const { data, error } = await supabase.rpc('my_premium_grant');
      if (error) {
        reportError(error, 'premium.grant', { expected: true });
        // Offline: last known answer for this account, otherwise "not confirmed".
        return set(cached === undefined ? 'error' : cached);
      }
      const row = data[0];
      const fresh: Grant | null = row ? { endsAt: row.ends_at, reason: row.reason } : null;
      set(fresh);
      await SecureStore.setItemAsync(
        GRANT_CACHE_KEY,
        JSON.stringify({ userId, grant: fresh }),
      ).catch(() => undefined);
    })().catch((error: unknown) => {
      reportError(error, 'premium.grant');
      set('error');
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const value = useMemo<Value>(
    () => ({
      ...resolvePremium(store, grant, new Date()),
      canPurchase: apiKey !== null && store !== 'error',
      setStoreActive: (premium) => setStore(premium ? 'active' : 'inactive'),
    }),
    [store, grant, apiKey],
  );
  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): Value {
  const context = useContext(PremiumContext);
  if (!context) throw new Error('usePremium must be used inside <PremiumProvider>.');
  return context;
}
