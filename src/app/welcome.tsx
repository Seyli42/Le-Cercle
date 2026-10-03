import { router, Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { fontSize, makeStyles, spacing } from '@/theme';
import { t } from '@/i18n';
import { APP_NAME } from '@/config/brand';

const points = () =>
  [
    { icon: '⏰', title: t('welcome.remindersTitle'), body: t('welcome.remindersBody') },
    { icon: '👪', title: t('welcome.circleTitle'), body: t('welcome.circleBody') },
    { icon: '🔒', title: t('welcome.privacyTitle'), body: t('welcome.privacyBody') },
  ] as const;

export default function WelcomeScreen() {
  const styles = useStyles();
  const { markSeen } = useOnboarding();
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={styles.brand} accessibilityRole="header">
        {APP_NAME}
      </Text>
      <Text style={styles.lead}>{t('welcome.lead')}</Text>
      {points().map((point) => (
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
      <PrimaryButton label={t('welcome.start')} onPress={markSeen} />
      <PrimaryButton
        label={t('welcome.privacy')}
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
