/**
 * End-to-end tests of the real app (every screen of src/app, real navigation, real
 * SQLite database). Only what lives outside the phone is simulated: Supabase, the
 * notification system, the secure storage.
 */
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { resetAdsForTests } from '@/features/monetization/ads';
import type { LocalDb } from '@/lib/db/types';

import { createTestDb } from './helpers/nodeDb';

// --- Supabase (auth only: the sync remote is mocked separately) ---------------
type Listener = (event: string, session: unknown) => void;
const mockAuthListeners: Listener[] = [];
const mockSession = { user: { id: 'user-1', email: 'marie@exemple.fr' } };
let mockStoredSession: unknown = null;
const mockInvoke = jest.fn();
const mockRpc = jest.fn(async (_name: string, _args?: unknown) => ({
  data: [] as unknown[],
  error: null as unknown,
}));
const mockSignInWithPassword = jest.fn();

jest.mock('@/config/env', () => ({
  env: {
    ...jest.requireActual<typeof import('@/config/env')>('@/config/env').env,
    reviewEmail: 'demo@dosecircle.fr',
    monetization: {
      revenueCat: { ios: 'appl_test', android: 'goog_test' },
      bannerUnit: { ios: null, android: null },
      interstitialUnit: { ios: null, android: null },
    },
  },
}));

jest.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['update', 'eq', 'select', 'in', 'order', 'limit']) chain[m] = () => chain;
  chain.is = async () => ({ error: null });
  chain.single = async () => ({
    data: { first_name: 'Marie', missed_dose_delay_minutes: 30 },
    error: null,
  });
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
  const client = {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: {
      getSession: async () => ({ data: { session: mockStoredSession }, error: null }),
      onAuthStateChange: (listener: Listener) => {
        mockAuthListeners.push(listener);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      updateUser: async () => ({ data: {}, error: null }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      signInWithPassword: async (credentials: unknown) => {
        mockSignInWithPassword(credentials);
        const session = { user: { id: 'demo', email: 'demo@dosecircle.fr' } };
        mockStoredSession = session;
        mockAuthListeners.forEach((l) => l('SIGNED_IN', session));
        return { data: { user: session.user, session }, error: null };
      },
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
    rpc: (name: string, args?: unknown) => mockRpc(name, args),
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
  mockRpc.mockClear();
  mockSignInWithPassword.mockReset();
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
      'J’accepte que DoseCircle conserve mes traitements et horaires de prise pour m’envoyer des rappels.',
    ),
  );
  await fireEvent.press(screen.getByLabelText('Recevoir mon code'));

  await fireEvent.changeText(await screen.findByLabelText('Code à 6 chiffres'), '123456');

  expect(await screen.findByText('Pour bien démarrer')).toBeTruthy();
  expect(screen.getByText('Aucun médicament pour l’instant')).toBeTruthy();
  // The welcome is never shown again on this phone.
  expect(mockSecure.get('onboarding_seen_v1')).toBe('yes');
});

it('store reviewers: only the demo address gets a password field', async () => {
  mockSecure.set('onboarding_seen_v1', 'yes');
  await renderRouter('./src/app');

  const email = await screen.findByLabelText('Adresse e-mail');
  await fireEvent.changeText(email, 'marie@exemple.fr');
  expect(screen.queryByLabelText('Mot de passe du compte de démonstration')).toBeNull();

  await fireEvent.changeText(email, 'Demo@DoseCircle.fr');
  await fireEvent.changeText(
    screen.getByLabelText('Mot de passe du compte de démonstration'),
    'Revue-2026!',
  );
  await fireEvent.press(
    screen.getByLabelText(
      'J’accepte que DoseCircle conserve mes traitements et horaires de prise pour m’envoyer des rappels.',
    ),
  );
  await fireEvent.press(screen.getByLabelText('Se connecter'));

  expect(await screen.findByText('Pour bien démarrer')).toBeTruthy();
  expect(mockSignInWithPassword).toHaveBeenCalledWith({
    email: 'demo@dosecircle.fr',
    password: 'Revue-2026!',
  });
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

// --- Free version with ads / Premium -----------------------------------------
type AdsMock = {
  interstitial: { show: jest.Mock };
  AdsConsent: { gatherConsent: jest.Mock; requestInfoUpdate: jest.Mock; getConsentInfo: jest.Mock };
};
type PurchasesMock = { default: { getCustomerInfo: jest.Mock; logIn: jest.Mock } };
const ads = () => jest.requireMock<AdsMock>('react-native-google-mobile-ads');
const purchases = () => jest.requireMock<PurchasesMock>('react-native-purchases');
const PREMIUM = { entitlements: { active: { premium: { isActive: true } } } };
const FREE = { entitlements: { active: {} } };
/** What the store says about this account (first sign-in or account switch alike). */
const storeSays = (info: typeof PREMIUM | typeof FREE) => {
  purchases().default.getCustomerInfo.mockResolvedValue(info);
  purchases().default.logIn.mockResolvedValue({ customerInfo: info, created: false });
};

async function addMedicationAt7am(name: string) {
  // 07:00: the 08:00 intake is an hour away, so nothing forbids an ad.
  jest.setSystemTime(new Date(2026, 9, 10, 7, 0));
  await fireEvent.press(await screen.findByLabelText('+ Ajouter un médicament'));
  await fireEvent.changeText(await screen.findByLabelText('Nom du médicament'), name);
  await fireEvent.changeText(screen.getByLabelText('Quantité par prise'), '1 comprimé');
  await fireEvent.press(screen.getByLabelText('Enregistrer'));
  await screen.findAllByText(name);
}

describe('free version', () => {
  beforeEach(() => {
    mockStoredSession = mockSession;
    mockSecure.set('onboarding_seen_v1', 'yes');
    resetAdsForTests();
    ads().interstitial.show.mockClear();
    ads().AdsConsent.gatherConsent.mockClear();
    ads().AdsConsent.requestInfoUpdate.mockClear();
  });

  it('a full-screen ad may follow a saved medication, once a day at most', async () => {
    storeSays(FREE);
    mockSecure.set('ads_first_launch_v1', String(new Date(2026, 8, 1).getTime()));
    await renderRouter('./src/app');

    await addMedicationAt7am('Levothyrox 75');
    await waitFor(() => expect(ads().interstitial.show).toHaveBeenCalledTimes(1));
    // Consent already given: prepared silently at launch, no form shown.
    expect(ads().AdsConsent.requestInfoUpdate).toHaveBeenCalled();
    expect(ads().AdsConsent.gatherConsent).not.toHaveBeenCalled();

    await addMedicationAt7am('Doliprane');
    await act(async () => {
      await jest.runOnlyPendingTimersAsync();
    });
    expect(ads().interstitial.show).toHaveBeenCalledTimes(1);
  });

  it('no ad, and not even the consent form, during the first days', async () => {
    storeSays(FREE);
    await renderRouter('./src/app');
    await addMedicationAt7am('Levothyrox 75');
    await act(async () => {
      await jest.runOnlyPendingTimersAsync();
    });
    expect(ads().interstitial.show).not.toHaveBeenCalled();
    expect(ads().AdsConsent.gatherConsent).not.toHaveBeenCalled();
    expect(ads().AdsConsent.requestInfoUpdate).not.toHaveBeenCalled();
  });

  it('consent not given yet: the form appears after a finished task, never at launch', async () => {
    storeSays(FREE);
    mockSecure.set('ads_first_launch_v1', String(new Date(2026, 8, 1).getTime()));
    const consent = (canRequestAds: boolean) => ({
      status: canRequestAds ? 'OBTAINED' : 'REQUIRED',
      canRequestAds,
      privacyOptionsRequirementStatus: 'REQUIRED',
      isConsentFormAvailable: true,
    });
    ads()
      .AdsConsent.getConsentInfo.mockResolvedValueOnce(consent(false))
      .mockResolvedValueOnce(consent(true));
    await renderRouter('./src/app');
    await screen.findByLabelText('+ Ajouter un médicament');
    await act(async () => {
      await jest.runOnlyPendingTimersAsync();
    });
    expect(ads().AdsConsent.gatherConsent).not.toHaveBeenCalled();

    await addMedicationAt7am('Levothyrox 75');
    await waitFor(() => expect(ads().AdsConsent.gatherConsent).toHaveBeenCalledTimes(1));
    // The form was the "interruption" of this moment: no ad on top of it.
    expect(ads().interstitial.show).not.toHaveBeenCalled();
  });

  it('Premium: no ad, no banner, not even the consent form', async () => {
    storeSays(PREMIUM);
    mockSecure.set('ads_first_launch_v1', String(new Date(2026, 8, 1).getTime()));
    await renderRouter('./src/app');

    await addMedicationAt7am('Levothyrox 75');
    await act(async () => {
      await jest.runOnlyPendingTimersAsync();
    });
    expect(ads().interstitial.show).not.toHaveBeenCalled();
    expect(ads().AdsConsent.gatherConsent).not.toHaveBeenCalled();
    expect(ads().AdsConsent.requestInfoUpdate).not.toHaveBeenCalled();

    await act(async () => router.push('/premium'));
    expect(await screen.findByText('✓ Vous êtes Premium')).toBeTruthy();
  });

  it('the history banner is labelled, with a way to remove ads', async () => {
    storeSays(FREE);
    mockSecure.set('ads_first_launch_v1', String(new Date(2026, 8, 1).getTime()));
    await renderRouter('./src/app', { initialUrl: '/history' });

    expect(await screen.findByText('Publicité')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Retirer la publicité avec Premium'));
    expect(await screen.findByText('DoseCircle Premium')).toBeTruthy();
  });
});

// --- The circle: relatives alerted on their own app ---------------------------
describe('circle', () => {
  beforeEach(() => {
    mockStoredSession = mockSession;
    mockSecure.set('onboarding_seen_v1', 'yes');
  });

  it('the person creates a code to share with a relative', async () => {
    let invite: unknown[] = [];
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'create_circle_invite') {
        invite = [{ code: 'ABCDEFGH', expires_at: '2026-10-12T10:00:00Z' }];
        return { data: invite, error: null };
      }
      if (name === 'my_circle_invite') return { data: invite, error: null };
      return { data: [], error: null };
    });
    await renderRouter('./src/app', { initialUrl: '/circle' });

    await fireEvent.press(await screen.findByLabelText('Inviter un proche'));
    expect(await screen.findByText('ABCD-EFGH')).toBeTruthy();
    expect(screen.getByLabelText('Partager l’invitation')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('create_circle_invite', undefined);
  });

  it('the relative types the code and starts watching over the person', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'accept_circle_invite'
        ? { data: [{ link_id: 'l1', patient_first_name: 'Papa' }], error: null }
        : { data: [], error: null },
    );
    await renderRouter('./src/app', { initialUrl: '/circle' });

    await fireEvent.changeText(
      await screen.findByLabelText('Code reçu de votre proche'),
      'abcd-efgh',
    );
    await fireEvent.press(screen.getByLabelText('Valider le code'));
    expect(await screen.findByText(/Vous veillez maintenant sur Papa/)).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('accept_circle_invite', { p_code: 'ABCDEFGH' });
  });
});
