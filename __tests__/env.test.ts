import { parseEnv } from '@/config/env';

describe('parseEnv', () => {
  const SUPABASE = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co/',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123',
  };

  it('defaults to development without Sentry nor Supabase', () => {
    expect(parseEnv({})).toEqual({
      sentryDsn: null,
      environment: 'development',
      supabase: null,
      reviewEmail: null,
      monetization: {
        revenueCat: { ios: null, android: null },
        bannerUnit: { ios: null, android: null },
        interstitialUnit: { ios: null, android: null },
      },
    });
  });

  it('reads the Supabase config and trims the trailing slash', () => {
    expect(parseEnv(SUPABASE).supabase).toEqual({
      url: 'https://abcd.supabase.co',
      publishableKey: 'sb_publishable_123',
    });
  });

  it('refuses a half-filled Supabase config', () => {
    expect(() => parseEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co' })).toThrow(
      /ensemble/,
    );
  });

  it('refuses a secret key in the app', () => {
    expect(() =>
      parseEnv({ ...SUPABASE, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' }),
    ).toThrow(/secrète/);
  });

  it('refuses a non-https URL outside local development', () => {
    expect(() =>
      parseEnv({ ...SUPABASE, EXPO_PUBLIC_SUPABASE_URL: 'http://abcd.supabase.co' }),
    ).toThrow(/https/);
  });

  it('rejects an unknown environment', () => {
    expect(() => parseEnv({ EXPO_PUBLIC_APP_ENV: 'prod' })).toThrow(/invalide/);
  });

  it('requires a Sentry DSN in production', () => {
    expect(() => parseEnv({ ...SUPABASE, EXPO_PUBLIC_APP_ENV: 'production' })).toThrow(
      /SENTRY_DSN est obligatoire/,
    );
  });

  it('requires Supabase in production', () => {
    expect(() =>
      parseEnv({
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0',
      }),
    ).toThrow(/Supabase est obligatoire/);
  });

  it('accepts a complete production config', () => {
    const result = parseEnv({
      ...SUPABASE,
      EXPO_PUBLIC_APP_ENV: 'production',
      EXPO_PUBLIC_SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0',
    });
    expect(result.environment).toBe('production');
  });

  it('reads the reviewers demo address, lower-cased', () => {
    expect(parseEnv({ EXPO_PUBLIC_REVIEW_EMAIL: ' Demo@DoseCircle.fr ' }).reviewEmail).toBe(
      'demo@dosecircle.fr',
    );
    expect(() => parseEnv({ EXPO_PUBLIC_REVIEW_EMAIL: 'demo' })).toThrow(/REVIEW_EMAIL/);
  });

  it('reads the monetization ids and refuses secrets or malformed ids', () => {
    const m = parseEnv({
      EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_abc',
      EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID: 'ca-app-pub-1234567890/987654',
    }).monetization;
    expect(m.revenueCat).toEqual({ ios: 'appl_abc', android: null });
    expect(m.interstitialUnit.android).toBe('ca-app-pub-1234567890/987654');
    expect(() => parseEnv({ EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: 'sk_live_123' })).toThrow(
      /secrète/,
    );
    // The app id (with "~") is not an ad unit id: a classic mix-up.
    expect(() => parseEnv({ EXPO_PUBLIC_ADMOB_BANNER_IOS: 'ca-app-pub-123~456' })).toThrow(
      /invalide/,
    );
  });
});
