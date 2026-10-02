/**
 * Public configuration embedded in the app at build time.
 *
 * Only EXPO_PUBLIC_* variables end up in the app, and they are readable by anyone
 * who downloads it. NEVER put a secret here (Anthropic, Twilio, Supabase service_role):
 * those live only in Supabase Edge Functions.
 */

export type AppEnv = {
  readonly sentryDsn: string | null;
  readonly environment: 'development' | 'preview' | 'production';
};

type RawEnv = {
  readonly EXPO_PUBLIC_SENTRY_DSN?: string | undefined;
  readonly EXPO_PUBLIC_APP_ENV?: string | undefined;
};

const ENVIRONMENTS = ['development', 'preview', 'production'] as const;

function isEnvironment(value: string): value is AppEnv['environment'] {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}

export function parseEnv(raw: RawEnv): AppEnv {
  const dsn = raw.EXPO_PUBLIC_SENTRY_DSN?.trim();
  const environment = raw.EXPO_PUBLIC_APP_ENV?.trim() ?? 'development';

  if (!isEnvironment(environment)) {
    throw new Error(
      `EXPO_PUBLIC_APP_ENV invalide : "${environment}". Valeurs possibles : ${ENVIRONMENTS.join(', ')}.`,
    );
  }
  if (environment === 'production' && !dsn) {
    // A production build without crash reporting would fail silently in the field.
    throw new Error('EXPO_PUBLIC_SENTRY_DSN est obligatoire en production.');
  }

  return { sentryDsn: dsn ? dsn : null, environment };
}

// Each variable must be read with its full literal name: Expo inlines them at build time.
export const env: AppEnv = parseEnv({
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
});
