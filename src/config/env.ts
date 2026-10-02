/**
 * Public configuration embedded in the app at build time.
 *
 * Only EXPO_PUBLIC_* variables end up in the app, and they are readable by anyone
 * who downloads it. NEVER put a secret here (Anthropic, Twilio, Supabase service_role
 * or secret key): those live only in Supabase Edge Functions.
 */

export type SupabaseConfig = {
  readonly url: string;
  /** Publishable (anon) key: public by design, data is protected by RLS. */
  readonly publishableKey: string;
};

export type AppEnv = {
  readonly sentryDsn: string | null;
  readonly environment: 'development' | 'preview' | 'production';
  /** null only in development, when .env is not filled yet. */
  readonly supabase: SupabaseConfig | null;
};

type RawEnv = {
  readonly EXPO_PUBLIC_SENTRY_DSN?: string | undefined;
  readonly EXPO_PUBLIC_APP_ENV?: string | undefined;
  readonly EXPO_PUBLIC_SUPABASE_URL?: string | undefined;
  readonly EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string | undefined;
};

const ENVIRONMENTS = ['development', 'preview', 'production'] as const;

function isEnvironment(value: string): value is AppEnv['environment'] {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}

function parseSupabase(raw: RawEnv): SupabaseConfig | null {
  const url = raw.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = raw.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !publishableKey) return null;
  if (!url || !publishableKey) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY doivent être renseignées ensemble.',
    );
  }
  if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.)/.test(url)) {
    throw new Error(`EXPO_PUBLIC_SUPABASE_URL doit commencer par https:// (reçu : "${url}").`);
  }
  if (/^sb_secret_/.test(publishableKey) || publishableKey.includes('service_role')) {
    // A secret key would bypass every security rule of the database.
    throw new Error('Clé secrète Supabase détectée : utilisez la clé publishable/anon.');
  }
  return { url: url.replace(/\/+$/, ''), publishableKey };
}

export function parseEnv(raw: RawEnv): AppEnv {
  const dsn = raw.EXPO_PUBLIC_SENTRY_DSN?.trim();
  const environment = raw.EXPO_PUBLIC_APP_ENV?.trim() || 'development';

  if (!isEnvironment(environment)) {
    throw new Error(
      `EXPO_PUBLIC_APP_ENV invalide : "${environment}". Valeurs possibles : ${ENVIRONMENTS.join(', ')}.`,
    );
  }
  const supabase = parseSupabase(raw);

  if (environment !== 'development') {
    // A store build without crash reporting or backend would fail silently in the field.
    if (!dsn) throw new Error(`EXPO_PUBLIC_SENTRY_DSN est obligatoire en ${environment}.`);
    if (!supabase) throw new Error(`La configuration Supabase est obligatoire en ${environment}.`);
  }

  return { sentryDsn: dsn ? dsn : null, environment, supabase };
}

// Each variable must be read with its full literal name: Expo inlines them at build time.
export const env: AppEnv = parseEnv({
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
