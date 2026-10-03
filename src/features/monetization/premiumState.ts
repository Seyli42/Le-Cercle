import type { PremiumState } from '@/features/monetization/adPolicy';

/** Subscription bought in the App Store / Google Play (via RevenueCat). */
export type StoreStatus = 'loading' | 'active' | 'inactive' | 'unavailable' | 'error';
/** Premium offered by the administrator (B2B contract, gift): see premium_grants. */
export type Grant = { readonly endsAt: string | null; readonly reason: string };
export type GrantStatus = 'loading' | 'error' | Grant | null;

export type PremiumResolution = {
  readonly state: PremiumState;
  readonly source: 'store' | 'grant' | null;
  readonly grant: Grant | null;
};

const isGrant = (value: GrantStatus): value is Grant => value !== null && typeof value === 'object';

/**
 * Combines both sources. Anything not confirmed is "unknown", and "unknown" never shows
 * ads (see adPolicy): a paying person must never see an ad because a server was slow.
 */
export function resolvePremium(
  store: StoreStatus,
  grant: GrantStatus,
  now: Date,
): PremiumResolution {
  const activeGrant =
    isGrant(grant) && (grant.endsAt === null || new Date(grant.endsAt) > now) ? grant : null;
  if (store === 'active') return { state: 'premium', source: 'store', grant: activeGrant };
  if (activeGrant) return { state: 'premium', source: 'grant', grant: activeGrant };
  if (store === 'loading' || store === 'error' || grant === 'loading' || grant === 'error') {
    return { state: 'unknown', source: null, grant: null };
  }
  return { state: 'free', source: null, grant: null };
}
