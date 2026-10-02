import { parseEnv } from '@/config/env';

describe('parseEnv', () => {
  const SUPABASE = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co/',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123',
  };

  it('defaults to development without Sentry nor Supabase', () => {
    expect(parseEnv({})).toEqual({ sentryDsn: null, environment: 'development', supabase: null });
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
});
