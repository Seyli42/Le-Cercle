import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const KEY = 'onboarding_seen_v1';

type Value = {
  /** null while reading the flag from the phone. */
  readonly seen: boolean | null;
  readonly markSeen: () => void;
};

const OnboardingContext = createContext<Value | null>(null);

/** Remembers whether the welcome screens were shown on this phone. */
export function OnboardingProvider({ children }: { readonly children: ReactNode }) {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((value) => setSeen(value === 'yes'))
      // Unreadable flag: better show the welcome once more than block the app.
      .catch(() => setSeen(false));
  }, []);

  const markSeen = useCallback(() => {
    setSeen(true);
    void SecureStore.setItemAsync(KEY, 'yes').catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ seen, markSeen }), [seen, markSeen]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): Value {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding must be used inside <OnboardingProvider>.');
  return context;
}
