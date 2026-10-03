import { resolvePremium } from '@/features/monetization/premiumState';
import { toPurchaseError } from '@/features/monetization/purchases';

const NOW = new Date('2026-10-10T12:00:00Z');
const grant = (endsAt: string | null) => ({ endsAt, reason: 'Pharmacie du Centre' });

describe('resolvePremium', () => {
  it('store subscription', () => {
    expect(resolvePremium('active', null, NOW)).toMatchObject({
      state: 'premium',
      source: 'store',
    });
  });

  it('B2B grant, with or without end date', () => {
    expect(resolvePremium('inactive', grant(null), NOW)).toMatchObject({
      state: 'premium',
      source: 'grant',
    });
    expect(resolvePremium('unavailable', grant('2027-01-01T00:00:00Z'), NOW).state).toBe('premium');
    expect(resolvePremium('inactive', grant('2026-01-01T00:00:00Z'), NOW).state).toBe('free');
  });

  it('a grant is enough even when the store cannot be reached', () => {
    expect(resolvePremium('error', grant(null), NOW).state).toBe('premium');
  });

  it('not confirmed = unknown (never ads for someone who may have paid)', () => {
    expect(resolvePremium('loading', null, NOW).state).toBe('unknown');
    expect(resolvePremium('error', null, NOW).state).toBe('unknown');
    expect(resolvePremium('inactive', 'loading', NOW).state).toBe('unknown');
    expect(resolvePremium('inactive', 'error', NOW).state).toBe('unknown');
  });

  it('free only when both sources say so', () => {
    expect(resolvePremium('inactive', null, NOW)).toEqual({
      state: 'free',
      source: null,
      grant: null,
    });
    expect(resolvePremium('unavailable', null, NOW).state).toBe('free');
  });
});

describe('toPurchaseError', () => {
  const rc = (code: string) => ({ code, message: 'x', userCancelled: false });

  it('clear French messages', () => {
    expect(toPurchaseError(rc('10'))).toMatchObject({ kind: 'network' });
    expect(toPurchaseError(rc('3')).userMessage).toMatch(/désactivés/);
    expect(toPurchaseError(rc('20')).userMessage).toMatch(/en attente/);
    expect(toPurchaseError(new Error('boom')).userMessage).toMatch(/pas été débité/);
  });
});
