import {
  AD_FREE_DAYS,
  canShowBanner,
  canShowInterstitial,
  isDoseSoon,
  type AdContext,
} from '@/features/monetization/adPolicy';
import type { TodayDose, TodayStatus } from '@/features/reminders/today';

const DAY = 24 * 3600_000;
const NOW = Date.UTC(2026, 9, 10, 15, 0);

const ctx = (over: Partial<AdContext> = {}): AdContext => ({
  premium: 'free',
  adsReady: true,
  firstLaunchAt: NOW - 10 * DAY,
  lastInterstitialAt: null,
  openedFromReminder: false,
  now: NOW,
  ...over,
});

const dose = (status: TodayStatus, minutesFromNow: number): TodayDose => ({
  occurrence: {
    scheduleId: 's',
    medicationId: 'm',
    medicationName: 'X',
    doseLabel: '1',
    timeOfDay: '15:00',
    at: new Date(NOW + minutesFromNow * 60_000),
  },
  status,
  respondedAt: null,
  canAnswer: true,
});

describe('full-screen ads', () => {
  it('shown after a finished task when nothing else forbids it', () => {
    expect(canShowInterstitial(ctx(), false)).toEqual({ show: true });
  });

  it('never for Premium, nor while Premium is not confirmed', () => {
    expect(canShowInterstitial(ctx({ premium: 'premium' }), false)).toEqual({
      show: false,
      reason: 'premium',
    });
    expect(canShowInterstitial(ctx({ premium: 'unknown' }), false)).toEqual({
      show: false,
      reason: 'premium_unknown',
    });
  });

  it('never without consent / SDK started', () => {
    expect(canShowInterstitial(ctx({ adsReady: false }), false)).toMatchObject({
      reason: 'not_ready',
    });
  });

  it(`none during the first ${AD_FREE_DAYS} days`, () => {
    expect(canShowInterstitial(ctx({ firstLaunchAt: NOW - 2 * DAY }), false)).toMatchObject({
      reason: 'first_days',
    });
    expect(canShowInterstitial(ctx({ firstLaunchAt: null }), false)).toMatchObject({
      reason: 'first_days',
    });
    expect(canShowInterstitial(ctx({ firstLaunchAt: NOW - 3 * DAY }), false)).toEqual({
      show: true,
    });
  });

  it('never in a session opened from a reminder', () => {
    expect(canShowInterstitial(ctx({ openedFromReminder: true }), false)).toMatchObject({
      reason: 'opened_from_reminder',
    });
  });

  it('never when an intake is close', () => {
    expect(canShowInterstitial(ctx(), true)).toMatchObject({ reason: 'dose_soon' });
  });

  it('at most one a day', () => {
    expect(
      canShowInterstitial(ctx({ lastInterstitialAt: NOW - 23 * 3600_000 }), false),
    ).toMatchObject({ reason: 'already_today' });
    expect(canShowInterstitial(ctx({ lastInterstitialAt: NOW - DAY }), false)).toEqual({
      show: true,
    });
  });
});

describe('banner (history screen only)', () => {
  it('follows Premium, consent and the first days, not the daily cap', () => {
    expect(canShowBanner(ctx({ lastInterstitialAt: NOW - 60_000 }))).toEqual({ show: true });
    expect(canShowBanner(ctx({ premium: 'premium' }))).toMatchObject({ reason: 'premium' });
    expect(canShowBanner(ctx({ premium: 'unknown' }))).toMatchObject({ reason: 'premium_unknown' });
    expect(canShowBanner(ctx({ firstLaunchAt: NOW - DAY }))).toMatchObject({
      reason: 'first_days',
    });
  });
});

describe('isDoseSoon', () => {
  it('an intake waiting for an answer', () => {
    expect(isDoseSoon([dose('due', -5)], NOW)).toBe(true);
    expect(isDoseSoon([dose('late', -90)], NOW)).toBe(true);
    // Never confirmed in the morning: does not block ads for the rest of the day.
    expect(isDoseSoon([dose('late', -121)], NOW)).toBe(false);
    expect(isDoseSoon([dose('snoozed', -10)], NOW)).toBe(true);
  });

  it('an intake within 30 minutes', () => {
    expect(isDoseSoon([dose('upcoming', 29)], NOW)).toBe(true);
    expect(isDoseSoon([dose('upcoming', 31)], NOW)).toBe(false);
  });

  it('answered intakes do not count', () => {
    expect(isDoseSoon([dose('taken', -5), dose('skipped', 0)], NOW)).toBe(false);
    expect(isDoseSoon([], NOW)).toBe(false);
  });
});
