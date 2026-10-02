import { parseEnv } from '@/config/env';

describe('parseEnv', () => {
  it('defaults to development without Sentry', () => {
    expect(parseEnv({})).toEqual({ sentryDsn: null, environment: 'development' });
  });

  it('rejects an unknown environment', () => {
    expect(() => parseEnv({ EXPO_PUBLIC_APP_ENV: 'prod' })).toThrow(/invalide/);
  });

  it('requires a Sentry DSN in production', () => {
    expect(() => parseEnv({ EXPO_PUBLIC_APP_ENV: 'production' })).toThrow(/obligatoire/);
  });

  it('accepts a complete production config', () => {
    const result = parseEnv({
      EXPO_PUBLIC_APP_ENV: 'production',
      EXPO_PUBLIC_SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0',
    });
    expect(result.environment).toBe('production');
  });
});
