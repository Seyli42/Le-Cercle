import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useUserId } from '@/features/auth/useUserId';
import { listMedications } from '@/features/medications/repository';
import {
  canShowBanner,
  canShowInterstitial,
  isDoseSoon,
  type AdContext,
  type InterstitialMoment,
} from '@/features/monetization/adPolicy';
import {
  createInterstitial,
  prepareAds,
  showAdPrivacyOptions,
  type AdsStart,
} from '@/features/monetization/ads';
import { isOpenedFromReminder, resetAdSession } from '@/features/monetization/adSession';
import { usePremium } from '@/features/monetization/PremiumProvider';
import { listDoseEvents } from '@/features/reminders/doseEvents';
import { buildTodayDoses, endOfLocalDay, startOfLocalDay } from '@/features/reminders/today';
import { useDb } from '@/lib/db/DatabaseProvider';
import { reportError } from '@/lib/monitoring';

const FIRST_LAUNCH_KEY = 'ads_first_launch_v1';
const LAST_INTERSTITIAL_KEY = 'ads_last_interstitial_v1';

type Value = {
  readonly bannerAllowed: boolean;
  /** The history banner is on screen: an allowed moment to ask for ad consent. */
  readonly onBannerVisible: () => void;
  /** "Choix publicitaires" button needed (EU consent can be changed at any time). */
  readonly privacyOptionsRequired: boolean;
  readonly openPrivacyOptions: () => Promise<void>;
  /** A finished task: a full-screen ad MAY follow, if every rule allows it. */
  readonly onMoment: (moment: InterstitialMoment) => void;
};

const AdsContext = createContext<Value | null>(null);

const readTime = async (key: string): Promise<number | null> => {
  const raw = await SecureStore.getItemAsync(key).catch(() => null);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : null;
};
const writeTime = (key: string, value: number) =>
  SecureStore.setItemAsync(key, String(value)).catch(() => undefined);

/**
 * Applies adPolicy. Two steps, so that nothing ever covers a reminder:
 * - at launch, if consent was already given, ads are prepared silently (no screen);
 * - the consent form itself only appears at an allowed moment (after saving a medication,
 *   or on the history), never in the first days nor in a session opened from a reminder.
 * Premium people never reach the ad SDK at all.
 */
export function AdsProvider({ children }: { readonly children: ReactNode }) {
  const db = useDb();
  const userId = useUserId();
  const { state: premium } = usePremium();
  const [ready, setReady] = useState(false);
  const [privacyOptionsRequired, setPrivacyOptionsRequired] = useState(false);
  const [times, setTimes] = useState<{ first: number | null; last: number | null } | null>(null);
  const interstitial = useRef<ReturnType<typeof createInterstitial>>(null);
  const preparing = useRef(false);

  useEffect(() => {
    void (async () => {
      let first = await readTime(FIRST_LAUNCH_KEY);
      if (first === null) {
        first = Date.now();
        await writeTime(FIRST_LAUNCH_KEY, first);
      }
      setTimes({ first, last: await readTime(LAST_INTERSTITIAL_KEY) });
    })();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') resetAdSession();
    });
    return () => {
      subscription.remove();
      interstitial.current?.destroy();
      interstitial.current = null;
    };
  }, []);

  const context = useCallback(
    (adsReady: boolean): AdContext => ({
      premium,
      adsReady,
      firstLaunchAt: times?.first ?? null,
      lastInterstitialAt: times?.last ?? null,
      openedFromReminder: isOpenedFromReminder(),
      now: Date.now(),
    }),
    [premium, times],
  );

  /** Starts ads if the base rules (Premium, first days) allow them. */
  const prepare = useCallback(
    (showConsentForm: boolean) => {
      const base = canShowBanner(context(true));
      if (!base.show || preparing.current) return;
      if (showConsentForm && isOpenedFromReminder()) return;
      preparing.current = true;
      prepareAds(showConsentForm)
        .then((start: AdsStart) => {
          setReady(start.canRequestAds);
          setPrivacyOptionsRequired(start.privacyOptionsRequired);
          if (start.canRequestAds && !interstitial.current) {
            interstitial.current = createInterstitial();
          }
        })
        .catch((error: unknown) => reportError(error, 'ads.prepare', { expected: true }))
        .finally(() => {
          preparing.current = false;
        });
    },
    [context],
  );

  // Launch: silent only.
  useEffect(() => {
    if (premium === 'free' && times) prepare(false);
  }, [premium, times, prepare]);

  const onMoment = useCallback(
    (moment: InterstitialMoment) => {
      if (!ready) {
        // First allowed moment without consent yet: ask now, no ad this time.
        prepare(true);
        return;
      }
      const ad = interstitial.current;
      if (!ad || !ad.isReady()) return;
      const now = new Date();
      void Promise.all([
        listMedications(db, userId),
        listDoseEvents(db, userId, startOfLocalDay(now), endOfLocalDay(now)),
      ])
        .then(async ([medications, events]) => {
          const doseSoon = isDoseSoon(buildTodayDoses(medications, events, now), now.getTime());
          if (!canShowInterstitial(context(ready), doseSoon).show) return;
          await ad.show();
          const shownAt = Date.now();
          setTimes((t) => ({ first: t?.first ?? null, last: shownAt }));
          await writeTime(LAST_INTERSTITIAL_KEY, shownAt);
        })
        .catch((error: unknown) =>
          reportError(error, `ads.interstitial.${moment}`, { expected: true }),
        );
    },
    [db, userId, ready, context, prepare],
  );

  const value = useMemo<Value>(
    () => ({
      bannerAllowed: canShowBanner(context(ready)).show,
      onBannerVisible: () => {
        if (!ready) prepare(true);
      },
      privacyOptionsRequired,
      openPrivacyOptions: async () => {
        try {
          setReady(await showAdPrivacyOptions());
        } catch (error) {
          reportError(error, 'ads.privacyOptions');
        }
      },
      onMoment,
    }),
    [context, ready, prepare, privacyOptionsRequired, onMoment],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds(): Value {
  const context = useContext(AdsContext);
  if (!context) throw new Error('useAds must be used inside <AdsProvider>.');
  return context;
}
