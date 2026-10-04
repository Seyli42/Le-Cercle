import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConfigMissing } from '@/components/ConfigMissing';
import { ErrorFallback } from '@/components/ErrorFallback';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { useAuth } from '@/features/auth/useAuth';
import { OnboardingProvider, useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { Sentry } from '@/lib/monitoring';
import { useColors } from '@/theme';
import { navigationTheme } from '@/theme/navigationTheme';
import { getLanguage, refreshLanguage, subscribeLanguage, t } from '@/i18n';

// Keep the splash screen until we know whether the user is signed in,
// so the sign-in page never flashes for someone already connected.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 300 });

function RootNavigator() {
  const { state } = useAuth();
  const { seen } = useOnboarding();
  const ready = state.status !== 'loading' && seen !== null;

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;
  if (state.status === 'misconfigured') return <ConfigMissing />;

  const signedIn = state.status === 'signedIn';
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontSize: 20 }, headerBackTitle: t('nav.back') }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* First launch only: shown before the sign-in, then never again on this phone. */}
      <Stack.Protected guard={!signedIn && !seen}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ title: t('nav.signIn') }} />
        <Stack.Screen name="verify" options={{ title: t('nav.verify') }} />
      </Stack.Protected>
      {/* Always reachable, signed in or not. */}
      <Stack.Screen name="privacy" options={{ title: t('nav.privacy') }} />
    </Stack>
  );
}

/** Re-renders the whole app in the new language when the phone's language changes. */
function useLanguage() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  useEffect(() => {
    // Android can change the language while the app runs (iOS restarts the app).
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshLanguage();
    });
    return () => subscription.remove();
  }, []);
  return language;
}

function RootLayout() {
  const colors = useColors();
  const dark = useColorScheme() === 'dark';
  const language = useLanguage();
  return (
    <SafeAreaProvider key={language}>
      <ThemeProvider value={navigationTheme(colors, dark)}>
        <Sentry.ErrorBoundary
          fallback={({ error, resetError }) => (
            <ErrorFallback onRetry={resetError} error={error} where="render" />
          )}
        >
          <AuthProvider>
            <OnboardingProvider>
              <RootNavigator />
            </OnboardingProvider>
          </AuthProvider>
          <StatusBar style="auto" />
        </Sentry.ErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// Sentry.wrap captures native crashes and touch breadcrumbs for the whole app.
export default Sentry.wrap(RootLayout);
