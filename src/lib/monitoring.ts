import * as Sentry from '@sentry/react-native';

import { env } from '@/config/env';
import { AppError, toAppError } from '@/lib/errors';

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

type ReportOptions = {
  /**
   * Expected failures (wrong code, offline…) are kept as a breadcrumb attached to the
   * next real Sentry event instead of creating an alert of their own.
   */
  readonly expected?: boolean;
};

/**
 * Reports an error to Sentry and returns its AppError form, ready to display.
 * `context` must describe WHERE it failed (e.g. "reminders.schedule"), never user data.
 */
export function reportError(
  error: unknown,
  context: string,
  options: ReportOptions = {},
): AppError {
  const appError = error instanceof AppError ? error : toAppError(error);
  if (options.expected) {
    Sentry.addBreadcrumb({
      category: context,
      level: 'warning',
      message: `${appError.kind}: ${appError.message}`,
    });
  } else {
    Sentry.captureException(appError.cause ?? appError, {
      tags: { kind: appError.kind, context },
    });
  }
  if (env.environment === 'development') {
    console.warn(`[${context}]`, error);
  }
  return appError;
}

/** Links Sentry events to an account by its opaque id only (no e-mail, no name). */
export function setMonitoringUser(userId: string | null): void {
  Sentry.setUser(userId ? { id: userId } : null);
}

export { Sentry };
