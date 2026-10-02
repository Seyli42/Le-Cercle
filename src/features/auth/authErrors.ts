import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';

import { AppError, DEFAULT_MESSAGES, toAppError } from '@/lib/errors';

const RATE_LIMIT_MESSAGE = 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';

const MESSAGES_BY_CODE: Readonly<Record<string, { kind: AppError['kind']; message: string }>> = {
  otp_expired: {
    kind: 'auth',
    message: 'Ce code est incorrect ou a expiré. Vérifiez-le ou demandez un nouveau code.',
  },
  invalid_credentials: {
    kind: 'auth',
    message: 'Ce code est incorrect ou a expiré. Vérifiez-le ou demandez un nouveau code.',
  },
  over_email_send_rate_limit: {
    kind: 'validation',
    message: "Trop d'envois de code. Patientez quelques minutes avant de réessayer.",
  },
  over_request_rate_limit: {
    kind: 'validation',
    message: RATE_LIMIT_MESSAGE,
  },
  email_address_invalid: {
    kind: 'validation',
    message: "Cette adresse e-mail n'est pas valide.",
  },
  email_address_not_authorized: {
    kind: 'validation',
    message: "Cette adresse e-mail n'est pas autorisée.",
  },
  signup_disabled: {
    kind: 'auth',
    message: 'Les inscriptions sont momentanément fermées.',
  },
  user_banned: {
    kind: 'auth',
    message: 'Ce compte est suspendu. Contactez le support.',
  },
  session_expired: { kind: 'auth', message: DEFAULT_MESSAGES.auth },
  session_not_found: { kind: 'auth', message: DEFAULT_MESSAGES.auth },
  refresh_token_not_found: { kind: 'auth', message: DEFAULT_MESSAGES.auth },
  request_timeout: { kind: 'network', message: DEFAULT_MESSAGES.network },
};

/** Translates a Supabase Auth error into a clear French message. */
export function toAuthAppError(error: unknown): AppError {
  if (isAuthRetryableFetchError(error)) {
    return new AppError('network', DEFAULT_MESSAGES.network, error);
  }
  if (isAuthApiError(error) && error.code) {
    const known = MESSAGES_BY_CODE[error.code];
    if (known) return new AppError(known.kind, known.message, error);
  }
  if (isAuthApiError(error) && error.status === 429) {
    return new AppError('validation', RATE_LIMIT_MESSAGE, error);
  }
  return toAppError(error);
}

/** Expected, user-caused errors that are not worth a Sentry event. */
export function isExpectedAuthError(error: AppError): boolean {
  return error.kind === 'auth' || error.kind === 'validation' || error.kind === 'network';
}
