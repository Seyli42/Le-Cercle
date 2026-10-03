import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { useReminders } from '@/features/reminders/ReminderProvider';
import { fontSize, makeStyles, spacing } from '@/theme';

type Props = { readonly medicationCount: number };

/** First steps, shown on the home screen until the essentials are done. */
export function GettingStarted({ medicationCount }: Props) {
  const styles = useStyles();
  const { health, askPermission } = useReminders();
  const notificationsOk = health?.permission === 'granted';
  if (!health || (notificationsOk && medicationCount > 0)) return null;

  const steps = [
    { done: medicationCount > 0, label: 'Ajouter votre premier médicament' },
    { done: notificationsOk, label: 'Autoriser les notifications (indispensable aux rappels)' },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        Pour bien démarrer
      </Text>
      {steps.map((step) => (
        <Text
          key={step.label}
          style={[styles.step, step.done && styles.done]}
          accessibilityLabel={`${step.label} : ${step.done ? 'fait' : 'à faire'}`}
        >
          {step.done ? '✅' : '⬜️'} {step.label}
        </Text>
      ))}
      {medicationCount === 0 && (
        <PrimaryButton
          label="Ajouter un médicament"
          onPress={() => router.push('/medications/new')}
        />
      )}
      {!notificationsOk && medicationCount > 0 && (
        <PrimaryButton label="Autoriser les notifications" onPress={() => void askPermission()} />
      )}
      <Text style={styles.hint}>
        Ensuite, si vous le souhaitez, ajoutez un proche dans « Mon Cercle ».
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary,
    gap: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  step: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
  done: { color: colors.textMuted, textDecorationLine: 'line-through' },
  hint: { fontSize: 16, color: colors.textMuted },
}));
