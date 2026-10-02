import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorFallback } from '@/components/ErrorFallback';
import { Sentry } from '@/lib/monitoring';

function RootLayout() {
  return (
    <SafeAreaProvider>
      <Sentry.ErrorBoundary fallback={({ resetError }) => <ErrorFallback onRetry={resetError} />}>
        <Stack screenOptions={{ headerTitleStyle: { fontSize: 20 } }} />
        <StatusBar style="auto" />
      </Sentry.ErrorBoundary>
    </SafeAreaProvider>
  );
}

// Sentry.wrap captures native crashes and touch breadcrumbs for the whole app.
export default Sentry.wrap(RootLayout);
