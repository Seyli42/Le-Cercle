import { isAuthApiError, type Session } from '@supabase/supabase-js';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isExpectedAuthError, toAuthAppError } from '@/features/auth/authErrors';
import { normalizeEmail } from '@/features/auth/validation';
import { AppError } from '@/lib/errors';
import { reportError, setMonitoringUser } from '@/lib/monitoring';
import { supabase, type AppSupabaseClient } from '@/lib/supabase';

export type AuthState =
  | { readonly status: 'loading' }
  /** Development only: .env is missing the Supabase keys. */
  | { readonly status: 'misconfigured' }
  | { readonly status: 'signedOut' }
  | { readonly status: 'signedIn'; readonly session: Session };

export type AuthContextValue = {
  readonly state: AuthState;
  /** Sends a 6-digit code by e-mail. Throws an AppError with a user-facing message. */
  readonly requestCode: (email: string) => Promise<void>;
  /** Checks the code and opens the session. Throws an AppError with a user-facing message. */
  readonly verifyCode: (email: string, code: string) => Promise<void>;
  /** Store reviewers' demo account only (see env.reviewEmail). */
  readonly signInWithPassword: (email: string, password: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

function fail(error: unknown, context: string): never {
  const appError = toAuthAppError(error);
  throw reportError(appError, context, { expected: isExpectedAuthError(appError) });
}

/**
 * Signing in required ticking the health-data consent box, so any session implies
 * consent. Recording it is retried at each launch until it reaches the server.
 */
async function recordConsent(client: AppSupabaseClient, userId: string): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({ health_data_consent_at: new Date().toISOString() })
    .eq('id', userId)
    .is('health_data_consent_at', null);
  if (error) reportError(error, 'auth.recordConsent', { expected: true });
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<AuthState>(
    supabase ? { status: 'loading' } : { status: 'misconfigured' },
  );

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let mounted = true;

    const apply = (session: Session | null) => {
      if (!mounted) return;
      setMonitoringUser(session?.user.id ?? null);
      setState(session ? { status: 'signedIn', session } : { status: 'signedOut' });
    };

    // The stored session is read from the phone: this works offline.
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) reportError(toAuthAppError(error), 'auth.restoreSession', { expected: true });
        apply(data.session);
        if (data.session) void recordConsent(client, data.session.user.id);
      })
      .catch((error: unknown) => {
        reportError(error, 'auth.restoreSession');
        apply(null);
      });

    const { data } = client.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION is already handled by getSession above.
      if (event !== 'INITIAL_SESSION') apply(session);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const requestCode = useCallback(async (email: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: { shouldCreateUser: true },
    });
    if (error) fail(error, 'auth.requestCode');
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizeEmail(email),
      token: code,
      type: 'email',
    });
    if (error) fail(error, 'auth.verifyCode');
    if (data.user) void recordConsent(supabase, data.user.id);
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (!error) return;
    if (isAuthApiError(error) && error.code === 'invalid_credentials') {
      throw reportError(
        new AppError('auth', 'Adresse e-mail ou mot de passe incorrect.', error),
        'auth.signInWithPassword',
        { expected: true },
      );
    }
    fail(error, 'auth.signInWithPassword');
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    // 'local' works offline: the session is removed from this phone in every case.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) reportError(toAuthAppError(error), 'auth.signOut', { expected: true });
  }, []);

  const value = useMemo(
    () => ({ state, requestCode, verifyCode, signInWithPassword, signOut }),
    [state, requestCode, verifyCode, signInWithPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
