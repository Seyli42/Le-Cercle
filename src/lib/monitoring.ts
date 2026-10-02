import * as Sentry from '@sentry/react-native';

import { env } from '@/config/env';
import { toAppError, type AppError } from '@/lib/errors';

// Health data must never leave the phone through crash reports.
const SENSITIVE_KEYS = /name|medic|dose|phone|email|note|token|password/i;

function scrub<T>(value: T): T {
  if (Array.isArray(value)) return value.map(scrub) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEYS.test(k) ? '[filtered]' : scrub(v)]),
    ) as T;
  }
  return value;
}

Sentry.init({
  dsn: env.sentryDsn ?? undefined,
  enabled: env.sentryDsn !== null,
  environment: env.environment,
  sendDefaultPii: false,
  tracesSampleRate: env.environment === 'production' ? 0.2 : 1.0,
  beforeSend(event) {
    if (event.extra) event.extra = scrub(event.extra);
    if (event.contexts) event.contexts = scrub(event.contexts);
    return event;
  },
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.data) breadcrumb.data = scrub(breadcrumb.data);
    return breadcrumb;
  },
});

/**
 * Reports an error to Sentry and returns its AppError form, ready to display.
 * `context` must describe WHERE it failed (e.g. "reminders.schedule"), never user data.
 */
export function reportError(error: unknown, context: string): AppError {
  const appError = toAppError(error);
  Sentry.captureException(appError.cause ?? appError, {
    tags: { kind: appError.kind, context },
  });
  if (env.environment === 'development') {
    console.warn(`[${context}]`, error);
  }
  return appError;
}

export { Sentry };
