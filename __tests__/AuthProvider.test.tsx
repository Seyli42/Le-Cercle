import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { useAuth } from '@/features/auth/useAuth';

type Listener = (event: string, session: unknown) => void;

const listeners: Listener[] = [];
const fakeSession = { user: { id: 'user-1', email: 'marie@exemple.fr' } };

const mockAuth = {
  getSession: jest.fn(),
  onAuthStateChange: jest.fn((listener: Listener) => {
    listeners.push(listener);
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  }),
  signInWithOtp: jest.fn(),
  verifyOtp: jest.fn(),
  signOut: jest.fn(async () => {
    listeners.forEach((l) => l('SIGNED_OUT', null));
    return { error: null };
  }),
};
type UpdateChain = {
  update: jest.Mock<UpdateChain>;
  eq: jest.Mock<UpdateChain>;
  is: jest.Mock<Promise<{ error: null }>>;
};
const mockUpdateChain: UpdateChain = {
  update: jest.fn((): UpdateChain => mockUpdateChain),
  eq: jest.fn((): UpdateChain => mockUpdateChain),
  is: jest.fn(async () => ({ error: null })),
};

// Getters: jest.mock is hoisted above the constants it refers to.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    get auth() {
      return mockAuth;
    },
    from: () => mockUpdateChain,
  },
}));
jest.mock('@/lib/monitoring', () => ({
  reportError: jest.fn((e: unknown) => e),
  setMonitoringUser: jest.fn(),
}));

function Probe() {
  const { state, signOut, requestCode } = useAuth();
  return (
    <>
      <Text testID="status">{state.status}</Text>
      <Text testID="signout" onPress={() => void signOut()} />
      <Text
        testID="request"
        onPress={() => void requestCode('x@y.fr').catch((e: Error) => (lastError = e))}
      />
    </>
  );
}
let lastError: Error | null = null;

beforeEach(() => {
  listeners.length = 0;
  lastError = null;
  jest.clearAllMocks();
});

it('restores a stored session (works offline) and records consent', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: fakeSession }, error: null });
  await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signedIn'));
  expect(mockUpdateChain.is).toHaveBeenCalledWith('health_data_consent_at', null);
});

it('shows the sign-in when there is no session, even if reading it fails', async () => {
  mockAuth.getSession.mockRejectedValue(new Error('keystore unavailable'));
  await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signedOut'));
});

it('signs out', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: fakeSession }, error: null });
  await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signedIn'));
  await act(async () => {
    screen.getByTestId('signout').props.onPress();
  });
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(screen.getByTestId('status').props.children).toBe('signedOut');
});

it('turns a Supabase error into a French message', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  const { AuthApiError } =
    jest.requireActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');
  mockAuth.signInWithOtp.mockResolvedValue({
    data: {},
    error: new AuthApiError('rate', 429, 'over_email_send_rate_limit'),
  });
  await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('signedOut'));
  await act(async () => {
    screen.getByTestId('request').props.onPress();
  });
  expect(lastError).toMatchObject({ userMessage: expect.stringMatching(/Patientez/) });
});
