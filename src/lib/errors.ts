/**
 * Single error vocabulary for the whole app: every failure is turned into an AppError
 * so that screens can show a clear French message and Sentry gets a consistent tag.
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
  /** Message safe to show to the user, in French. */
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

export const DEFAULT_MESSAGES: Readonly<Record<ErrorKind, string>> = {
  network:
    'Connexion impossible. Vos rappels continuent de fonctionner ; la synchronisation reprendra automatiquement.',
  permission:
    "Une autorisation est nécessaire. Vous pouvez l'activer dans les réglages de votre téléphone.",
  ai: "La lecture automatique n'a pas fonctionné. Vous pouvez saisir les informations à la main.",
  auth: 'Votre session a expiré. Merci de vous reconnecter.',
  validation: 'Certaines informations sont incomplètes ou incorrectes.',
  unknown: "Une erreur inattendue s'est produite. Réessayez dans quelques instants.",
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
