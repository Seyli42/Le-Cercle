import type { ConfigContext, ExpoConfig } from 'expo/config';

// One codebase, two variants installable side by side on the same phone:
// "development" for testing, "production" for the stores.
const IS_DEV = process.env.APP_VARIANT === 'development';

const BUNDLE_ID = IS_DEV ? 'com.lecercle.app.dev' : 'com.lecercle.app';

// AdMob APPLICATION ids (ca-app-pub-…~…). Defaults: Google's sample apps (test ads only).
const ADMOB_IOS_APP_ID = process.env.ADMOB_IOS_APP_ID || 'ca-app-pub-3940256099942544~1458002511';
const ADMOB_ANDROID_APP_ID =
  process.env.ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713';

// Filled once with the id printed by `npx eas-cli@latest init` (not a secret).
// Empty = over-the-air updates disabled (local development).
const EAS_PROJECT_ID = '';

/** Apple privacy manifest: what the app collects (must match the App Store "App Privacy"
 * answers in docs/STORES.md) and why it uses APIs Apple considers sensitive. */
const collected = (type: string, linked: boolean) => ({
  NSPrivacyCollectedDataType: `NSPrivacyCollectedDataType${type}`,
  NSPrivacyCollectedDataTypeLinked: linked,
  NSPrivacyCollectedDataTypeTracking: false,
  NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
});
const advertising = (type: string) => ({
  NSPrivacyCollectedDataType: `NSPrivacyCollectedDataType${type}`,
  NSPrivacyCollectedDataTypeLinked: false,
  NSPrivacyCollectedDataTypeTracking: false,
  NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising'],
});
const privacyManifests = {
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
  NSPrivacyCollectedDataTypes: [
    collected('Health', true), // medications, schedules, intake history
    collected('EmailAddress', true), // sign-in
    collected('UserID', true), // account id (also on crash reports)
    collected('Contacts', true), // the circle: first names + phone numbers of relatives
    collected('PhotosorVideos', false), // prescription photo, read then forgotten
    collected('CrashData', true),
    collected('PerformanceData', true),
    // Free version (non-personalised ads, docs/MONETISATION.md): what the ad SDK sends.
    advertising('DeviceID'),
    advertising('ProductInteraction'),
    advertising('AdvertisingData'),
    advertising('CoarseLocation'),
    // Premium: purchases (RevenueCat), linked to the account.
    collected('PurchaseHistory', true),
  ],
  // Union of the reasons declared by the libraries (Apple does not always read theirs).
  NSPrivacyAccessedAPITypes: [
    { type: 'UserDefaults', reasons: ['CA92.1'] },
    { type: 'FileTimestamp', reasons: ['C617.1', '0A2A.1', '3B52.1'] },
    { type: 'SystemBootTime', reasons: ['35F9.1'] },
    { type: 'DiskSpace', reasons: ['E174.1', '85F4.1'] },
  ].map(({ type, reasons }) => ({
    NSPrivacyAccessedAPIType: `NSPrivacyAccessedAPICategory${type}`,
    NSPrivacyAccessedAPITypeReasons: reasons,
  })),
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'Le Cercle (Dev)' : 'Le Cercle',
  slug: 'le-cercle',
  scheme: IS_DEV ? 'lecercle-dev' : 'lecercle',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // Follows the phone's light / dark setting (see src/theme).
  userInterfaceStyle: 'automatic',
  // An update is only delivered to store builds whose native code is identical
  // (fingerprint): a JS update can never crash a binary it was not built for.
  runtimeVersion: { policy: 'fingerprint' },
  updates: EAS_PROJECT_ID
    ? {
        url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
        // Never delay startup (reminders first): a new update applies at the next launch.
        checkAutomatically: 'ON_LOAD',
        fallbackToCacheTimeout: 0,
      }
    : { enabled: false },
  extra: EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {},
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    // Standard encryption only (HTTPS, SQLCipher/AES for data stored on the phone): exempt
    // from US export declarations. See docs/PUBLICATION.md for the French ANSSI question.
    config: { usesNonExemptEncryption: false },
    privacyManifests,
    entitlements: {
      // Lets medication reminders break through Focus / Do Not Disturb modes.
      'com.apple.developer.usernotifications.time-sensitive': true,
    },
  },
  android: {
    package: BUNDLE_ID,
    // Health data must not leave the phone through Google's automatic backups.
    allowBackup: false,
    // Exact alarms: reminders on time even in battery-saving mode (user-granted).
    permissions: ['android.permission.SCHEDULE_EXACT_ALARM'],
    // Added by default by React Native / Expo but useless here: fewer permissions,
    // more trust (and an easier Play Store review).
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      // Biometrics (secure storage without fingerprint lock) and launcher badges: unused.
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      'com.sec.android.provider.badge.permission.READ',
      'com.sec.android.provider.badge.permission.WRITE',
      'com.htc.launcher.permission.READ_SETTINGS',
      'com.htc.launcher.permission.UPDATE_SHORTCUT',
      'com.sonyericsson.home.permission.BROADCAST_BADGE',
      'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
      'com.anddoes.launcher.permission.UPDATE_COUNT',
      'com.majeur.launcher.permission.UPDATE_BADGE',
      'com.huawei.android.launcher.permission.CHANGE_BADGE',
      'com.huawei.android.launcher.permission.READ_SETTINGS',
      'com.huawei.android.launcher.permission.WRITE_SETTINGS',
      'android.permission.READ_APP_BADGE',
      'com.oppo.launcher.permission.READ_SETTINGS',
      'com.oppo.launcher.permission.WRITE_SETTINGS',
      'me.everything.badger.permission.BADGE_COUNT_READ',
      'me.everything.badger.permission.BADGE_COUNT_WRITE',
    ],
    adaptiveIcon: {
      backgroundColor: '#1D4ED8',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    // Excludes the encrypted session from Android backups (it could not be decrypted after restore).
    ['expo-secure-store', { configureAndroidBackup: true }],
    // Encrypts the local database (medications, schedules) with SQLCipher.
    ['expo-sqlite', { useSQLCipher: true }],
    '@react-native-community/datetimepicker',
    [
      'expo-notifications',
      {
        icon: './assets/android-icon-monochrome.png',
        color: '#1D4ED8',
      },
    ],
    // Periodic refresh of the reminders while the app is closed.
    'expo-background-task',
    [
      'expo-image-picker',
      {
        cameraPermission:
          'Le Cercle utilise l’appareil photo pour lire votre ordonnance ou la boîte de votre médicament, si vous le demandez.',
        photosPermission:
          'Le Cercle accède à la photo de votre ordonnance que vous choisissez, pour la lire.',
        microphonePermission: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        backgroundColor: '#FFFFFF',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#0F172A' },
      },
    ],
    // Ads of the free version. No tracking prompt: non-personalised ads only.
    [
      'react-native-google-mobile-ads',
      {
        iosAppId: ADMOB_IOS_APP_ID,
        androidAppId: ADMOB_ANDROID_APP_ID,
        // Nothing is sent to Google before the consent form has been answered.
        delayAppMeasurementInit: true,
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        // Non-secret identifiers; the upload token stays in SENTRY_AUTH_TOKEN (EAS secret).
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
