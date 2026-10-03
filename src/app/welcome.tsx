import { router, Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { fontSize, makeStyles, spacing } from '@/theme';

const POINTS: readonly { readonly icon: string; readonly title: string; readonly body: string }[] =
  [
    {
      icon: '⏰',
      title: 'Des rappels qui sonnent, toujours',
      body: 'Même sans internet, téléphone verrouillé ou après un redémarrage. Un bouton suffit pour dire « Pris ».',
    },
    {
      icon: '👪',
      title: 'Vos proches veillent, si vous le souhaitez',
      body: 'Si une prise n’est pas confirmée, les proches que vous choisissez sont prévenus par une notification sur leur téléphone. Sans jamais le nom de vos médicaments.',
    },
    {
      icon: '🔒',
      title: 'Vos données restent les vôtres',
      body: 'Chiffrées sur votre téléphone, sauvegardées en Europe, jamais revendues. Vous pouvez tout exporter ou tout supprimer.',
    },
  ];

export default function WelcomeScreen() {
  const styles = useStyles();
  const { markSeen } = useOnboarding();
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={styles.brand} accessibilityRole="header">
        DoseCircle
      </Text>
      <Text style={styles.lead}>Vos médicaments, à l’heure. Vos proches, rassurés.</Text>
      {POINTS.map((point) => (
        <View key={point.title} style={styles.point} accessible>
          <Text style={styles.icon} importantForAccessibility="no" accessibilityElementsHidden>
            {point.icon}
          </Text>
          <View style={styles.texts}>
            <Text style={styles.title}>{point.title}</Text>
            <Text style={styles.body}>{point.body}</Text>
          </View>
        </View>
      ))}
      <PrimaryButton label="Commencer" onPress={markSeen} />
      <PrimaryButton
        label="Confidentialité"
        variant="secondary"
        onPress={() => router.push('/privacy')}
      />
      <MedicalDisclaimer />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  brand: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.primary,
    marginTop: spacing.xl,
  },
  lead: { fontSize: 22, color: colors.text, lineHeight: 30 },
  point: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  icon: { fontSize: 32 },
  texts: { flex: 1, gap: spacing.xs },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
}));
