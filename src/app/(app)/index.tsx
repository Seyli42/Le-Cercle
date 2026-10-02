import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { env } from '@/config/env';
import { useAuth } from '@/features/auth/useAuth';
import { reportError } from '@/lib/monitoring';
import { colors, fontSize, spacing } from '@/theme';

export default function HomeScreen() {
  const { state, signOut } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [shouldCrash, setShouldCrash] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (shouldCrash) {
    throw new Error('Test volontaire de l’écran d’erreur');
  }

  const email = state.status === 'signedIn' ? state.session.user.email : undefined;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Le Cercle' }} />
      <Text style={styles.title}>Bienvenue</Text>
      {email ? <Text style={styles.body}>Connecté avec {email}</Text> : null}
      <Text style={styles.body}>
        Le Cercle vous rappelle de prendre les médicaments que vous avez saisis, et prévient vos
        proches si un rappel reste sans réponse.
      </Text>
      <MedicalDisclaimer />

      <PrimaryButton
        label="Se déconnecter"
        variant="secondary"
        loading={signingOut}
        onPress={() => {
          setSigningOut(true);
          void signOut().finally(() => setSigningOut(false));
        }}
      />

      {env.environment !== 'production' && (
        <>
          <Text style={styles.section}>Outils de test (masqués en production)</Text>
          <PrimaryButton
            label="Tester une erreur gérée"
            onPress={() => {
              const error = reportError(new Error('Network request failed'), 'dev.test');
              setMessage(error.userMessage);
            }}
          />
          <PrimaryButton
            label="Tester un plantage d’écran"
            variant="danger"
            onPress={() => setShouldCrash(true)}
          />
          {message && (
            <Text style={styles.body} accessibilityLiveRegion="polite">
              {message}
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
  section: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
});
