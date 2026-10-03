/**
 * Google AdMob, wrapped. Rules of WHEN are in adPolicy.ts; this file only talks to the SDK.
 *
 * Privacy choices (health app):
 * - consent first (Google UMP form, required in the EU) and nothing loads without it;
 * - NON-personalised ads only: no ad profile, no tracking prompt on iPhone;
 * - nothing about the person's health is ever passed to the ad request (no keywords, no
 *   content URL);
 * - "general audience" ads only (G rating). Sensitive categories (medicines, health,
 *   dating, gambling…) must also be blocked in the AdMob console: see docs/MONETISATION.md.
 */
import { Platform } from 'react-native';
import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  InterstitialAd,
  MaxAdContentRating,
  TestIds,
  type RequestOptions,
} from 'react-native-google-mobile-ads';

import { env, type PlatformPair } from '@/config/env';

export const AD_REQUEST: RequestOptions = { requestNonPersonalizedAdsOnly: true };

/** Real ids in production; Google's test ads otherwise (never click your own real ads). */
function unit(pair: PlatformPair, test: string): string | null {
  const real = Platform.OS === 'ios' ? pair.ios : Platform.OS === 'android' ? pair.android : null;
  if (env.environment !== 'production') return test;
  return real;
}

export const bannerUnitId = (): string | null =>
  unit(env.monetization.bannerUnit, TestIds.ADAPTIVE_BANNER);
const interstitialUnitId = (): string | null =>
  unit(env.monetization.interstitialUnit, TestIds.INTERSTITIAL);

export type AdsStart = {
  readonly canRequestAds: boolean;
  readonly privacyOptionsRequired: boolean;
};

let initialized: Promise<void> | null = null;

function initSdk(): Promise<void> {
  initialized ??= (async () => {
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.G,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();
  })().catch((error: unknown) => {
    initialized = null; // Retried at the next opportunity.
    throw error;
  });
  return initialized;
}

/**
 * Updates the consent status and starts the SDK when ads are allowed.
 * `showConsentForm: false` never displays anything (used at app launch, which may come
 * from a reminder); the Google form (EU) is only shown at an allowed moment.
 */
export async function prepareAds(showConsentForm: boolean): Promise<AdsStart> {
  if (showConsentForm) await AdsConsent.gatherConsent().catch(() => undefined);
  else await AdsConsent.requestInfoUpdate().catch(() => undefined);
  const info = await AdsConsent.getConsentInfo();
  if (info.canRequestAds) await initSdk();
  return {
    canRequestAds: info.canRequestAds,
    privacyOptionsRequired:
      info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
  };
}

/** Tests only: forget that the SDK was started. */
export function resetAdsForTests(): void {
  initialized = null;
}

/** "Choix publicitaires" in the account screen (GDPR: consent can change at any time). */
export async function showAdPrivacyOptions(): Promise<boolean> {
  const info = await AdsConsent.showPrivacyOptionsForm();
  return info.canRequestAds;
}

/** One full-screen ad kept ready, reloaded after each display. */
export function createInterstitial(): {
  readonly isReady: () => boolean;
  readonly show: () => Promise<void>;
  readonly destroy: () => void;
} | null {
  const unitId = interstitialUnitId();
  if (!unitId) return null;
  const ad = InterstitialAd.createForAdRequest(unitId, AD_REQUEST);
  const offClosed = ad.addAdEventListener(AdEventType.CLOSED, () => ad.load());
  // No fill / network error: simply no ad this time, retried at the next opportunity.
  const offError = ad.addAdEventListener(AdEventType.ERROR, () => undefined);
  ad.load();
  return {
    isReady: () => ad.loaded,
    show: async () => {
      if (!ad.loaded) {
        ad.load();
        return;
      }
      await ad.show();
    },
    destroy: () => {
      offClosed();
      offError();
    },
  };
}
