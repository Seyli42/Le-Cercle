/**
 * End-to-end tests of the real app (every screen of src/app, real navigation, real
 * SQLite database). Only what lives outside the phone is simulated: Supabase, the
 * notification system, the secure storage.
 */
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { LocalDb } from '@/lib/db/types';

import { createTestDb } from './helpers/nodeDb';

// --- Supabase (auth only: the sync remote is mocked separately) ---------------
type Listener = (event: string, session: unknown) => void;
const mockAuthListeners: Listener[] = [];
const mockSession = { user: { id: 'user-1', email: 'marie@exemple.fr' } };
let mockStoredSession: unknown = null;
const mockInvoke = jest.fn();

jest.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['update', 'eq', 'select']) chain[m] = () => chain;
  chain.is = async () => ({ error: null });
  const client = {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: {
      getSession: async () => ({ data: { session: mockStoredSession }, error: null }),
      onAuthStateChange: (listener: Listener) => {
        mockAuthListeners.push(listener);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signInWithOtp: async () => ({ data: {}, error: null }),
      verifyOtp: async () => {
        mockStoredSession = mockSession;
        mockAuthListeners.forEach((l) => l('SIGNED_IN', mockSession));
        return { data: { user: mockSession.user, session: mockSession }, error: null };
      },
      signOut: async () => {
        mockStoredSession = null;
        mockAuthListeners.forEach((l) => l('SIGNED_OUT', null));
        return { error: null };
      },
      startAutoRefresh: () => undefined,
      stopAutoRefresh: () => undefined,
    },
    from: () => chain,
  };
  return { supabase: client, requireSupabase: () => client };
});
jest.mock('@/features/sync/supabaseRemote', () => ({
  createSupabaseRemote: () => ({
    push: async () => undefined,
    pull: async () => ({ medications: [], schedules: [], dose_events: [], limit: 500 }),
    heartbeat: async () => undefined,
  }),
}));

// --- Phone services -----------------------------------------------------------
let mockDb: Promise<LocalDb>;
jest.mock('@/lib/db/expoDb', () => ({ getLocalDb: () => mockDb }));

const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockSecure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockSecure.set(k, v),
  deleteItemAsync: async (k: string) => void mockSecure.delete(k),
}));

const mockScheduled = new Map<string, { identifier: string; content: unknown }>();
jest.mock('expo-notifications', () => ({
  setNotificationHandler: () => undefined,
  setNotificationChannelAsync: async () => null,
  setNotificationCategoryAsync: async () => null,
  getPermissionsAsync: async () => ({ granted: true, status: 'granted', canAskAgain: true }),
  requestPermissionsAsync: async () => ({ granted: true }),
  scheduleNotificationAsync: async (r: { identifier: string; content: unknown }) => {
    mockScheduled.set(r.identifier, r);
    return r.identifier;
  },
  getAllScheduledNotificationsAsync: async () => [...mockScheduled.values()],
  cancelScheduledNotificationAsync: async (id: string) => void mockScheduled.delete(id),
  getPresentedNotificationsAsync: async () => [],
  dismissNotificationAsync: async () => undefined,
  getLastNotificationResponse: () => null,
  clearLastNotificationResponse: () => undefined,
  addNotificationResponseReceivedListener: () => ({ remove: () => undefined }),
  registerTaskAsync: async () => undefined,
  AndroidImportance: { MAX: 5 },
  AndroidNotificationPriority: { MAX: 'max' },
  IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
  PermissionStatus: { DENIED: 'denied' },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
}));
jest.mock('expo-task-manager', () => ({ defineTask: () => undefined }));
jest.mock('expo-background-task', () => ({
  getStatusAsync: async () => 2,
  registerTaskAsync: async () => undefined,
  BackgroundTaskStatus: { Available: 2 },
  BackgroundTaskResult: { Success: 1, Failed: 2 },
}));
jest.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: () => undefined }) }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: async () => undefined,
  setOptions: () => undefined,
  hide: () => undefined,
}));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}`,
}));
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('@/lib/monitoring', () => ({
  reportError: (e: unknown) => e,
  setMonitoringUser: () => undefined,
  Sentry: {
    wrap: (component: unknown) => component,
    ErrorBoundary: ({ children }: { children: unknown }) => children,
  },
}));

beforeEach(() => {
  mockDb = createTestDb();
  mockAuthListeners.length = 0;
  mockSecure.clear();
  mockScheduled.clear();
  mockStoredSession = null;
  mockInvoke.mockReset();
});

it('first launch: welcome, sign-in by e-mail code, then the home screen', async () => {
  await renderRouter('./src/app');

  expect(
    await screen.findByText('Vos médicaments, à l’heure. Vos proches, rassurés.'),
  ).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Commencer'));

  await fireEvent.changeText(await screen.findByLabelText('Adresse e-mail'), 'marie@exemple.fr');
  await fireEvent.press(
    screen.getByLabelText(
      'J’accepte que Le Cercle conserve mes traitements et horaires de prise pour m’envoyer des rappels.',
    ),
  );
  await fireEvent.press(screen.getByLabelText('Recevoir mon code'));

  await fireEvent.changeText(await screen.findByLabelText('Code à 6 chiffres'), '123456');

  expect(await screen.findByText('Pour bien démarrer')).toBeTruthy();
  expect(screen.getByText('Aucun médicament pour l’instant')).toBeTruthy();
  // The welcome is never shown again on this phone.
  expect(mockSecure.get('onboarding_seen_v1')).toBe('yes');
});

it('adds a medication: saved on the phone, listed, and its reminders scheduled', async () => {
  mockStoredSession = mockSession;
  mockSecure.set('onboarding_seen_v1', 'yes');
  await renderRouter('./src/app');

  await fireEvent.press(await screen.findByLabelText('+ Ajouter un médicament'));
  await fireEvent.changeText(await screen.findByLabelText('Nom du médicament'), 'Levothyrox 75');
  await fireEvent.changeText(screen.getByLabelText('Quantité par prise'), '1 comprimé');
  await fireEvent.press(screen.getByLabelText('Enregistrer'));

  // Shown in today's doses and in the medication list.
  expect(await screen.findAllByText('Levothyrox 75')).toHaveLength(2);

  const db = await mockDb;
  const rows = await db.getAllAsync<{ name: string; sync_status: string }>(
    'SELECT name, sync_status FROM medications',
  );
  expect(rows).toEqual([{ name: 'Levothyrox 75', sync_status: 'pending' }]);
  await waitFor(() =>
    expect([...mockScheduled.keys()].filter((k) => k.startsWith('dose_')).length).toBeGreaterThan(
      20,
    ),
  );
});

it('deletes the account: server first, then everything on the phone, then signed out', async () => {
  mockStoredSession = mockSession;
  mockSecure.set('onboarding_seen_v1', 'yes');
  mockInvoke.mockResolvedValue({ data: { deleted: true }, error: null });
  await renderRouter('./src/app');

  await fireEvent.press(await screen.findByLabelText('+ Ajouter un médicament'));
  await fireEvent.changeText(await screen.findByLabelText('Nom du médicament'), 'Doliprane');
  await fireEvent.changeText(screen.getByLabelText('Quantité par prise'), '1 comprimé');
  await fireEvent.press(screen.getByLabelText('Enregistrer'));
  await screen.findAllByText('Doliprane');
  await waitFor(() => expect(mockScheduled.size).toBeGreaterThan(0));

  // The header link (“Compte”) is not drawn in tests: same navigation, by code.
  await act(async () => router.push('/account'));
  await fireEvent.press(await screen.findByLabelText('Supprimer mon compte'));
  const confirm = await screen.findByLabelText('Supprimer définitivement');
  // Disabled until the confirmation word is typed.
  await fireEvent.press(confirm);
  expect(mockInvoke).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Pour confirmer, tapez SUPPRIMER'), 'supprimer');
  await fireEvent.press(screen.getByLabelText('Supprimer définitivement'));

  expect(await screen.findByLabelText('Adresse e-mail')).toBeTruthy();
  expect(mockInvoke).toHaveBeenCalledWith('delete-account', { method: 'POST' });
  const db = await mockDb;
  expect(await db.getAllAsync('SELECT id FROM medications')).toEqual([]);
  expect(await db.getAllAsync('SELECT id FROM schedules')).toEqual([]);
  expect(mockScheduled.size).toBe(0);
});

it('refuses to delete offline and keeps everything', async () => {
  mockStoredSession = mockSession;
  mockSecure.set('onboarding_seen_v1', 'yes');
  mockInvoke.mockResolvedValue({ data: null, error: new TypeError('Network request failed') });
  await renderRouter('./src/app', { initialUrl: '/account' });

  await fireEvent.press(await screen.findByLabelText('Supprimer mon compte'));
  await fireEvent.changeText(screen.getByLabelText('Pour confirmer, tapez SUPPRIMER'), 'SUPPRIMER');
  await fireEvent.press(screen.getByLabelText('Supprimer définitivement'));

  expect(
    await screen.findByText('Une connexion internet est nécessaire pour supprimer le compte.'),
  ).toBeTruthy();
  expect(screen.getByText('Connecté avec marie@exemple.fr')).toBeTruthy();
});
