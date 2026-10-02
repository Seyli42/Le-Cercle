import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { env } from '@/config/env';
import { reportError } from '@/lib/monitoring';
import { colors, fontSize, spacing } from '@/theme';

export default function HomeScreen() {
  const [message, setMessage] = useState<string | null>(null);
  const [shouldCrash, setShouldCrash] = useState(false);

  if (shouldCrash) {
    throw new Error('Test volontaire de l’écran d’erreur');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Le Cercle' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Bienvenue</Text>
        <Text style={styles.body}>
          Le Cercle vous rappelle de prendre les médicaments que vous avez saisis, et prévient vos
          proches si un rappel reste sans réponse.
        </Text>
        <Text style={styles.disclaimer}>
          Le Cercle ne donne aucun conseil médical. Pour toute question sur un traitement,
          adressez-vous à votre médecin ou pharmacien.
        </Text>

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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
  disclaimer: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
  },
  section: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
});
