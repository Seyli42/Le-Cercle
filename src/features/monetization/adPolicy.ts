/**
 * When an ad may be shown. Pure rules, tested in __tests__/adPolicy.test.ts.
 *
 * Product rules: ads pay for the free version, but they must never get between a person
 * and their medication. So:
 * - never on the reminder path (home with today's doses, a reminder just tapped, an
 *   intake due or late), never during sign-in, onboarding, the medication form or the
 *   scan check;
 * - a full-screen ad only after a finished task (medication saved, history closed), at
 *   most once a day, never during the first days;
 * - a single small banner, at the bottom of the history only;
 * - nothing as long as we are not SURE the person is not Premium.
 */
import type { TodayDose } from '@/features/reminders/today';

/** Days without any ad after the first launch: time to trust the app first. */
export const AD_FREE_DAYS = 3;
/** Minimum gap between two full-screen ads. */
export const INTERSTITIAL_MIN_GAP_MS = 24 * 3600_000;
/** No full-screen ad when an intake is this close (it could hide a reminder). */
export const DOSE_QUIET_MS = 30 * 60_000;
/** A late intake still blocks full-screen ads this long (the person may be about to answer). */
export const LATE_QUIET_MS = 2 * 3600_000;

/** The only two moments a full-screen ad may appear. */
export type InterstitialMoment = 'medication_saved' | 'history_closed';

export type PremiumState = 'premium' | 'free' | 'unknown';

export type AdContext = {
  readonly premium: PremiumState;
  /** Consent obtained (or not required) and the ad SDK started. */
  readonly adsReady: boolean;
  readonly firstLaunchAt: number | null;
  readonly lastInterstitialAt: number | null;
  /** This app session started from a reminder notification. */
  readonly openedFromReminder: boolean;
  readonly now: number;
};

export type AdRefusal =
  | 'premium'
  | 'premium_unknown'
  | 'not_ready'
  | 'first_days'
  | 'opened_from_reminder'
  | 'dose_soon'
  | 'already_today';

export type AdDecision =
  { readonly show: true } | { readonly show: false; readonly reason: AdRefusal };

const refuse = (reason: AdRefusal): AdDecision => ({ show: false, reason });

function baseRules(ctx: AdContext): AdDecision | null {
  if (ctx.premium === 'premium') return refuse('premium');
  // A paying user must never see an ad: in doubt (offline, store unreachable), none.
  if (ctx.premium === 'unknown') return refuse('premium_unknown');
  if (!ctx.adsReady) return refuse('not_ready');
  if (ctx.firstLaunchAt === null || ctx.now - ctx.firstLaunchAt < AD_FREE_DAYS * 24 * 3600_000) {
    return refuse('first_days');
  }
  return null;
}

export function canShowBanner(ctx: AdContext): AdDecision {
  return baseRules(ctx) ?? { show: true };
}

export function canShowInterstitial(ctx: AdContext, doseSoon: boolean): AdDecision {
  const base = baseRules(ctx);
  if (base) return base;
  if (ctx.openedFromReminder) return refuse('opened_from_reminder');
  if (doseSoon) return refuse('dose_soon');
  if (
    ctx.lastInterstitialAt !== null &&
    ctx.now - ctx.lastInterstitialAt < INTERSTITIAL_MIN_GAP_MS
  ) {
    return refuse('already_today');
  }
  return { show: true };
}

/** An intake is due, snoozed, recently late, or comes within DOSE_QUIET_MS. */
export function isDoseSoon(doses: readonly TodayDose[], now: number): boolean {
  return doses.some((dose) => {
    const delta = dose.occurrence.at.getTime() - now;
    switch (dose.status) {
      case 'due':
      case 'snoozed':
        return true;
      case 'late':
        return -delta <= LATE_QUIET_MS;
      case 'upcoming':
        return delta <= DOSE_QUIET_MS;
      default:
        return false;
    }
  });
}
