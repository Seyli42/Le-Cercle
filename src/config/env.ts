/**
 * Public configuration embedded in the app at build time.
 *
 * Only EXPO_PUBLIC_* variables end up in the app, and they are readable by anyone
 * who downloads it. NEVER put a secret here (Twilio, RevenueCat secret key, Supabase service_role
 * or secret key): those live only in Supabase Edge Functions.
 */

export type SupabaseConfig = {
  readonly url: string;
  /** Publishable (anon) key: public by design, data is protected by RLS. */
  readonly publishableKey: string;
};

export type PlatformPair = { readonly ios: string | null; readonly android: string | null };

export type MonetizationConfig = {
  /** RevenueCat PUBLIC SDK keys (appl_… / goog_…): Premium subscription. */
  readonly revenueCat: PlatformPair;
  /** AdMob ad unit ids (ca-app-pub-…/…). Missing = Google test ads outside production. */
  readonly bannerUnit: PlatformPair;
  readonly interstitialUnit: PlatformPair;
};

export type AppEnv = {
  readonly sentryDsn: string | null;
  readonly environment: 'development' | 'preview' | 'production';
  /** null only in development, when .env is not filled yet. */
  readonly supabase: SupabaseConfig | null;
  /**
   * Demo account given to the App Store / Google Play reviewers, who cannot receive our
   * e-mail codes: only this address may sign in with a password (enforced server-side
   * by the custom_access_token_hook allowlist). null = no demo account.
   */
  readonly reviewEmail: string | null;
  readonly monetization: MonetizationConfig;
};

type RawEnv = {
  readonly EXPO_PUBLIC_SENTRY_DSN?: string | undefined;
  readonly EXPO_PUBLIC_APP_ENV?: string | undefined;
  readonly EXPO_PUBLIC_SUPABASE_URL?: string | undefined;
  readonly EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string | undefined;
  readonly EXPO_PUBLIC_REVIEW_EMAIL?: string | undefined;
  readonly EXPO_PUBLIC_REVENUECAT_IOS_KEY?: string | undefined;
  readonly EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?: string | undefined;
  readonly EXPO_PUBLIC_ADMOB_BANNER_IOS?: string | undefined;
  readonly EXPO_PUBLIC_ADMOB_BANNER_ANDROID?: string | undefined;
  readonly EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS?: string | undefined;
  readonly EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID?: string | undefined;
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

const optional = (value: string | undefined) => value?.trim() || null;

function revenueCatKey(name: string, value: string | undefined): string | null {
  const key = optional(value);
  // A secret key (sk_…) would let anyone grant themselves subscriptions or read customers.
  if (key && /^sk_/.test(key)) {
    throw new Error(
      `${name} : clé secrète RevenueCat détectée, utilisez la clé publique (appl_… / goog_…).`,
    );
  }
  return key;
}

function adUnit(name: string, value: string | undefined): string | null {
  const unit = optional(value);
  if (unit && !/^ca-app-pub-\d+\/\d+$/.test(unit)) {
    throw new Error(`${name} invalide : "${unit}" (format ca-app-pub-123…/456…).`);
  }
  return unit;
}

function parseMonetization(raw: RawEnv): MonetizationConfig {
  return {
    revenueCat: {
      ios: revenueCatKey('EXPO_PUBLIC_REVENUECAT_IOS_KEY', raw.EXPO_PUBLIC_REVENUECAT_IOS_KEY),
      android: revenueCatKey(
        'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
        raw.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
      ),
    },
    bannerUnit: {
      ios: adUnit('EXPO_PUBLIC_ADMOB_BANNER_IOS', raw.EXPO_PUBLIC_ADMOB_BANNER_IOS),
      android: adUnit('EXPO_PUBLIC_ADMOB_BANNER_ANDROID', raw.EXPO_PUBLIC_ADMOB_BANNER_ANDROID),
    },
    interstitialUnit: {
      ios: adUnit('EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS', raw.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS),
      android: adUnit(
        'EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID',
        raw.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID,
      ),
    },
  };
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

  const reviewEmail = raw.EXPO_PUBLIC_REVIEW_EMAIL?.trim().toLowerCase() || null;
  if (reviewEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reviewEmail)) {
    throw new Error(`EXPO_PUBLIC_REVIEW_EMAIL invalide : "${reviewEmail}".`);
  }

  return {
    sentryDsn: dsn ? dsn : null,
    environment,
    supabase,
    reviewEmail,
    monetization: parseMonetization(raw),
  };
}

// Each variable must be read with its full literal name: Expo inlines them at build time.
export const env: AppEnv = parseEnv({
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_REVIEW_EMAIL: process.env.EXPO_PUBLIC_REVIEW_EMAIL,
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  EXPO_PUBLIC_ADMOB_BANNER_IOS: process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS,
  EXPO_PUBLIC_ADMOB_BANNER_ANDROID: process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID,
  EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS,
  EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID,
});
