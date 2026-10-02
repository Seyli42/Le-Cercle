import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { isExpectedAuthError, toAuthAppError } from '@/features/auth/authErrors';
import { DEFAULT_MESSAGES } from '@/lib/errors';

describe('toAuthAppError', () => {
  it('explains an expired or wrong code', () => {
    const error = toAuthAppError(new AuthApiError('Token has expired', 403, 'otp_expired'));
    expect(error.kind).toBe('auth');
    expect(error.userMessage).toMatch(/incorrect ou a expiré/);
    expect(isExpectedAuthError(error)).toBe(true);
  });

  it('explains rate limiting', () => {
    const error = toAuthAppError(new AuthApiError('Too many', 429, 'over_email_send_rate_limit'));
    expect(error.userMessage).toMatch(/Patientez/);
  });

  it('handles an unknown 429 without code', () => {
    const error = toAuthAppError(new AuthApiError('Too many', 429, undefined));
    expect(error.userMessage).toMatch(/Patientez/);
  });

  it('treats fetch failures as network errors', () => {
    const error = toAuthAppError(new AuthRetryableFetchError('Failed to fetch', 0));
    expect(error.kind).toBe('network');
    expect(error.userMessage).toBe(DEFAULT_MESSAGES.network);
  });

  it('reports unexpected server errors to Sentry', () => {
    const error = toAuthAppError(new AuthApiError('boom', 500, 'unexpected_failure'));
    expect(error.kind).toBe('unknown');
    expect(isExpectedAuthError(error)).toBe(false);
  });
});
