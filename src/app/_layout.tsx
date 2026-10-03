import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConfigMissing } from '@/components/ConfigMissing';
import { ErrorFallback } from '@/components/ErrorFallback';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { useAuth } from '@/features/auth/useAuth';
import { OnboardingProvider, useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { Sentry } from '@/lib/monitoring';
import { useColors } from '@/theme';
import { navigationTheme } from '@/theme/navigationTheme';

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
    <Stack screenOptions={{ headerTitleStyle: { fontSize: 20 }, headerBackTitle: 'Retour' }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* First launch only: shown before the sign-in, then never again on this phone. */}
      <Stack.Protected guard={!signedIn && !seen}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ title: 'Connexion' }} />
        <Stack.Screen name="verify" options={{ title: 'Code de connexion' }} />
      </Stack.Protected>
      {/* Always reachable, signed in or not. */}
      <Stack.Screen name="privacy" options={{ title: 'Confidentialité' }} />
    </Stack>
  );
}

function RootLayout() {
  const colors = useColors();
  const dark = useColorScheme() === 'dark';
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme(colors, dark)}>
        <Sentry.ErrorBoundary fallback={({ resetError }) => <ErrorFallback onRetry={resetError} />}>
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
