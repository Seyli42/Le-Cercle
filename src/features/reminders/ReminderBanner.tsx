import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useReminders } from '@/features/reminders/ReminderProvider';
import { colors, fontSize, spacing } from '@/theme';

/** Red banner on the home screen as long as reminders might not ring. */
export function ReminderBanner() {
  const { issues } = useReminders();
  const first = issues[0];
  if (!first) return null;
  const critical = first.level === 'critical';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Attention : ${first.title}. Appuyez pour vérifier vos rappels.`}
      onPress={() => router.push('/reminders')}
      style={[styles.banner, critical ? styles.critical : styles.warning]}
    >
      <Text style={styles.title}>⚠️ {first.title}</Text>
      <Text style={styles.body}>
        {issues.length > 1 ? `${issues.length} points à corriger. ` : ''}Appuyez pour corriger.
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { padding: spacing.md, borderRadius: 12, gap: spacing.xs, borderWidth: 2 },
  critical: { backgroundColor: '#FEE2E2', borderColor: colors.danger },
  warning: { backgroundColor: '#FEF3C7', borderColor: '#B45309' },
  title: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text },
});
