/**
 * Premium subscription through the App Store / Google Play, via RevenueCat (receipt
 * validation, renewals, refunds and restores handled by their servers). The RevenueCat
 * customer id is the Supabase user id: Premium follows the account on every phone.
 */
import { Linking, Platform } from 'react-native';
import Purchases, {
  PACKAGE_TYPE,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesPackage,
} from 'react-native-purchases';

import { env } from '@/config/env';
import { AppError } from '@/lib/errors';

/** Entitlement identifier configured in the RevenueCat dashboard. */
export const PREMIUM_ENTITLEMENT = 'premium';

export type PremiumOffer = {
  readonly id: string;
  readonly priceString: string;
  readonly period: 'month' | 'year' | 'lifetime' | 'other';
};

let configured = false;
let currentUser: string | null = null;

export function revenueCatKey(): string | null {
  const keys = env.monetization.revenueCat;
  return Platform.OS === 'ios' ? keys.ios : Platform.OS === 'android' ? keys.android : null;
}

export const hasPremium = (info: CustomerInfo): boolean =>
  info.entitlements.active[PREMIUM_ENTITLEMENT]?.isActive === true;

/** Configures RevenueCat once per app launch, then only switches account. */
export async function connectPurchases(apiKey: string, userId: string): Promise<CustomerInfo> {
  if (!configured) {
    Purchases.configure({ apiKey, appUserID: userId });
    configured = true;
    currentUser = userId;
    return Purchases.getCustomerInfo();
  }
  if (currentUser !== userId) {
    const { customerInfo } = await Purchases.logIn(userId);
    currentUser = userId;
    return customerInfo;
  }
  return Purchases.getCustomerInfo();
}

/** Sign-out: purchases are no longer attached to this account on this phone. */
export async function disconnectPurchases(): Promise<void> {
  if (currentUser === null) return;
  currentUser = null;
  await Purchases.logOut();
}

const PERIODS: Partial<Record<PACKAGE_TYPE, PremiumOffer['period']>> = {
  [PACKAGE_TYPE.MONTHLY]: 'month',
  [PACKAGE_TYPE.ANNUAL]: 'year',
  [PACKAGE_TYPE.LIFETIME]: 'lifetime',
};

const ORDER: Readonly<Record<PremiumOffer['period'], number>> = {
  year: 0,
  month: 1,
  lifetime: 2,
  other: 3,
};

let packages = new Map<string, PurchasesPackage>();

/** Offers of the "current" offering, with prices in the person's currency. */
export async function loadPremiumOffers(): Promise<PremiumOffer[]> {
  try {
    const offerings = await Purchases.getOfferings();
    const available = offerings.current?.availablePackages ?? [];
    packages = new Map(available.map((p) => [p.identifier, p]));
    return available
      .map((p) => ({
        id: p.identifier,
        priceString: p.product.priceString,
        period: PERIODS[p.packageType] ?? 'other',
      }))
      .sort((a, b) => ORDER[a.period] - ORDER[b.period]);
  } catch (error) {
    throw toPurchaseError(error);
  }
}

const isPurchasesError = (error: unknown): error is PurchasesError =>
  typeof error === 'object' && error !== null && 'code' in error && 'userCancelled' in error;

export function toPurchaseError(error: unknown): AppError {
  if (isPurchasesError(error)) {
    switch (error.code) {
      case PURCHASES_ERROR_CODE.NETWORK_ERROR:
        return new AppError('network', 'Pas de connexion : réessayez une fois connecté.', error);
      case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
        return new AppError(
          'permission',
          'Les achats sont désactivés sur ce téléphone (contrôle parental ou réglages).',
          error,
        );
      case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
        return new AppError(
          'validation',
          'Paiement en attente de validation : Premium s’activera dès qu’il sera confirmé.',
          error,
        );
      case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
        return new AppError(
          'network',
          'Le store ne répond pas pour le moment. Réessayez dans quelques minutes.',
          error,
        );
      default:
        break;
    }
  }
  return new AppError('unknown', 'L’achat n’a pas abouti. Vous n’avez pas été débité.', error);
}

/** Returns true once Premium is active, false if the person cancelled. */
export async function buyPremium(offerId: string): Promise<boolean> {
  const pkg = packages.get(offerId);
  if (!pkg) throw new AppError('unknown', 'Offre indisponible : rouvrez cette page.');
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return hasPremium(customerInfo);
  } catch (error) {
    if (isPurchasesError(error) && error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return false;
    }
    throw toPurchaseError(error);
  }
}

export async function restorePremium(): Promise<boolean> {
  try {
    return hasPremium(await Purchases.restorePurchases());
  } catch (error) {
    throw toPurchaseError(error);
  }
}

/** Cancelling or changing a subscription happens in the store, not in the app. */
export function openSubscriptionSettings(packageName: string): Promise<void> {
  return Linking.openURL(
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : `https://play.google.com/store/account/subscriptions?package=${packageName}`,
  );
}

export function addPremiumListener(listener: (premium: boolean) => void): () => void {
  const onUpdate = (info: CustomerInfo) => listener(hasPremium(info));
  Purchases.addCustomerInfoUpdateListener(onUpdate);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(onUpdate);
  };
}
