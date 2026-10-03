import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';

import { AppError, DEFAULT_MESSAGES, toAppError } from '@/lib/errors';

import { t, type MessageKey } from '@/i18n';

const MESSAGES_BY_CODE: Readonly<Record<string, { kind: AppError['kind']; message: MessageKey }>> =
  {
    otp_expired: { kind: 'auth', message: 'authErrors.badCode' },
    invalid_credentials: { kind: 'auth', message: 'authErrors.badCode' },
    over_email_send_rate_limit: { kind: 'validation', message: 'authErrors.emailRateLimit' },
    over_request_rate_limit: { kind: 'validation', message: 'authErrors.rateLimit' },
    email_address_invalid: { kind: 'validation', message: 'authErrors.emailInvalid' },
    email_address_not_authorized: { kind: 'validation', message: 'authErrors.emailNotAuthorized' },
    signup_disabled: { kind: 'auth', message: 'authErrors.signupDisabled' },
    user_banned: { kind: 'auth', message: 'authErrors.banned' },
    session_expired: { kind: 'auth', message: 'errors.auth' },
    session_not_found: { kind: 'auth', message: 'errors.auth' },
    refresh_token_not_found: { kind: 'auth', message: 'errors.auth' },
    request_timeout: { kind: 'network', message: 'errors.network' },
  };

/** Translates a Supabase Auth error into a clear message. */
export function toAuthAppError(error: unknown): AppError {
  if (isAuthRetryableFetchError(error)) {
    return new AppError('network', DEFAULT_MESSAGES.network, error);
  }
  if (isAuthApiError(error) && error.code) {
    const known = MESSAGES_BY_CODE[error.code];
    if (known) return new AppError(known.kind, t(known.message), error);
  }
  if (isAuthApiError(error) && error.status === 429) {
    return new AppError('validation', t('authErrors.rateLimit'), error);
  }
  return toAppError(error);
}

/** Expected, user-caused errors that are not worth a Sentry event. */
export function isExpectedAuthError(error: AppError): boolean {
  return error.kind === 'auth' || error.kind === 'validation' || error.kind === 'network';
}
