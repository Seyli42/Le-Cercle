import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConfigMissing } from '@/components/ConfigMissing';
import { ErrorFallback } from '@/components/ErrorFallback';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { useAuth } from '@/features/auth/useAuth';
import { Sentry } from '@/lib/monitoring';

// Keep the splash screen until we know whether the user is signed in,
// so the sign-in page never flashes for someone already connected.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 300 });

function RootNavigator() {
  const { state } = useAuth();

  useEffect(() => {
    if (state.status !== 'loading') SplashScreen.hide();
  }, [state.status]);

  if (state.status === 'loading') return null;
  if (state.status === 'misconfigured') return <ConfigMissing />;

  const signedIn = state.status === 'signedIn';
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontSize: 20 }, headerBackTitle: 'Retour' }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ title: 'Connexion' }} />
        <Stack.Screen name="verify" options={{ title: 'Code de connexion' }} />
      </Stack.Protected>
    </Stack>
  );
}

function RootLayout() {
  return (
    <SafeAreaProvider>
      <Sentry.ErrorBoundary fallback={({ resetError }) => <ErrorFallback onRetry={resetError} />}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
        <StatusBar style="auto" />
      </Sentry.ErrorBoundary>
    </SafeAreaProvider>
  );
}

// Sentry.wrap captures native crashes and touch breadcrumbs for the whole app.
export default Sentry.wrap(RootLayout);
