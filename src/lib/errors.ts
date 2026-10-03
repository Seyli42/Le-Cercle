import { t } from '@/i18n';

/**
 * Single error vocabulary for the whole app: every failure is turned into an AppError
 * so that screens can show a clear message (in the person's language) and Sentry gets a consistent tag.
 */

export type ErrorKind =
  | 'network' // no connection, timeout, server unreachable
  | 'permission' // notifications, camera… refused by the user
  | 'ai' // AI extraction failed or returned unusable data
  | 'auth' // session expired, invalid code
  | 'validation' // user input rejected
  | 'unknown';

export class AppError extends Error {
  readonly kind: ErrorKind;
  /** Message safe to show to the user, in their language. */
  readonly userMessage: string;
  override readonly cause: unknown;

  constructor(kind: ErrorKind, userMessage: string, cause?: unknown) {
    super(cause instanceof Error ? cause.message : userMessage);
    this.name = 'AppError';
    this.kind = kind;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

/** Read at the moment of the error: always in the current language. */
export const DEFAULT_MESSAGES: Readonly<Record<ErrorKind, string>> = {
  get network() {
    return t('errors.network');
  },
  get permission() {
    return t('errors.permission');
  },
  get ai() {
    return t('errors.ai');
  },
  get auth() {
    return t('errors.auth');
  },
  get validation() {
    return t('errors.validation');
  },
  get unknown() {
    return t('errors.unknown');
  },
};

const NETWORK_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /timeout/i,
  /timed out/i,
  /ENOTFOUND|ECONNREFUSED|ECONNRESET/,
];

function looksLikeNetworkError(error: Error): boolean {
  return error.name === 'AbortError' || NETWORK_PATTERNS.some((p) => p.test(error.message));
}

/** Turns anything thrown (Error, string, API payload…) into an AppError. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && looksLikeNetworkError(error)) {
    return new AppError('network', DEFAULT_MESSAGES.network, error);
  }
  return new AppError('unknown', DEFAULT_MESSAGES.unknown, error);
}
