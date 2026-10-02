import type { ConfigContext, ExpoConfig } from 'expo/config';

// One codebase, two variants installable side by side on the same phone:
// "development" for testing, "production" for the stores.
const IS_DEV = process.env.APP_VARIANT === 'development';

const BUNDLE_ID = IS_DEV ? 'com.lecercle.app.dev' : 'com.lecercle.app';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'Le Cercle (Dev)' : 'Le Cercle',
  slug: 'le-cercle',
  scheme: IS_DEV ? 'lecercle-dev' : 'lecercle',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // Dark mode comes with the design pass (step 8); until then colors are light-only.
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
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
    ],
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
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
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        backgroundColor: '#FFFFFF',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#0F172A' },
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
