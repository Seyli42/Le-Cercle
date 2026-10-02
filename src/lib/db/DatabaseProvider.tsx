import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ErrorFallback } from '@/components/ErrorFallback';
import { getLocalDb } from '@/lib/db/expoDb';
import type { LocalDb } from '@/lib/db/types';
import { reportError } from '@/lib/monitoring';
import { colors } from '@/theme';

const DatabaseContext = createContext<LocalDb | null>(null);

type State =
  | { readonly status: 'opening' }
  | { readonly status: 'ready'; readonly db: LocalDb }
  | { readonly status: 'failed' };

/** Opens the encrypted local database once, then makes it available to every screen. */
export function DatabaseProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'opening' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    getLocalDb()
      .then((db) => active && setState({ status: 'ready', db }))
      .catch((error: unknown) => {
        reportError(error, 'db.open');
        if (active) setState({ status: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = () => {
    setState({ status: 'opening' });
    setAttempt((n) => n + 1);
  };

  if (state.status === 'failed') return <ErrorFallback onRetry={retry} />;
  if (state.status === 'opening') {
    return (
      <View style={styles.center} accessibilityLabel="Chargement">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return <DatabaseContext.Provider value={state.db}>{children}</DatabaseContext.Provider>;
}

export function useDb(): LocalDb {
  const db = useContext(DatabaseContext);
  if (!db) throw new Error('useDb must be used inside <DatabaseProvider>.');
  return db;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
