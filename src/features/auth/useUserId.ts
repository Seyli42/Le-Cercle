import { useAuth } from '@/features/auth/useAuth';

/** Id of the signed-in user. Only call it from screens under src/app/(app). */
export function useUserId(): string {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('useUserId requires a signed-in user.');
  return state.session.user.id;
}
