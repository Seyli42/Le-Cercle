import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useReminders } from '@/features/reminders/ReminderProvider';
import { fontSize, makeStyles, spacing } from '@/theme';
import { t } from '@/i18n';

/** Red banner on the home screen as long as reminders might not ring. */
export function ReminderBanner() {
  const styles = useStyles();
  const { issues } = useReminders();
  const first = issues[0];
  if (!first) return null;
  const critical = first.level === 'critical';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('reminderBanner.a11y', { title: first.title })}
      onPress={() => router.push('/reminders')}
      style={[styles.banner, critical ? styles.critical : styles.warning]}
    >
      <Text style={styles.title}>⚠️ {first.title}</Text>
      <Text style={styles.body}>
        {issues.length > 1 ? t('reminderBanner.count', { count: issues.length }) : ''}
        {t('reminderBanner.tap')}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  banner: { padding: spacing.md, borderRadius: 12, gap: spacing.xs, borderWidth: 2 },
  critical: { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
  warning: { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder },
  title: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text },
}));
