import { Pressable, Text, View } from 'react-native';

import { formatLocalDate } from '@/features/medications/dates';
import { describeSchedules, FORM_LABELS, treatmentStatus } from '@/features/medications/format';
import type { Medication } from '@/features/medications/types';
import { fontSize, makeStyles, spacing } from '@/theme';
import { t } from '@/i18n';

type Props = { readonly medication: Medication; readonly onPress: () => void };

export function MedicationCard({ medication, onPress }: Props) {
  const styles = useStyles();
  const status = treatmentStatus(medication);
  const lines = describeSchedules(medication.schedules);
  const badge =
    status === 'ended'
      ? t('medicationCard.ended', { date: formatLocalDate(medication.endsOn ?? '') })
      : status === 'upcoming'
        ? t('medicationCard.starts', { date: formatLocalDate(medication.startsOn) })
        : medication.endsOn
          ? t('medicationCard.until', { date: formatLocalDate(medication.endsOn) })
          : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${medication.name}, ${medication.doseLabel}, ${lines.join('. ')}. ${badge ?? ''}. ${t('common.tapToEdit')}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        status === 'ended' && styles.ended,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.name}>{medication.name}</Text>
      <Text style={styles.detail}>
        {medication.doseLabel} · {FORM_LABELS[medication.form]}
      </Text>
      <View style={styles.lines}>
        {lines.map((line) => (
          <Text key={line} style={styles.schedule}>
            ⏰ {line}
          </Text>
        ))}
      </View>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  ended: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
  name: { fontSize: 22, fontWeight: '700', color: colors.text },
  detail: { fontSize: fontSize.body, color: colors.textMuted },
  lines: { gap: 2, marginTop: spacing.xs },
  schedule: { fontSize: fontSize.body, color: colors.text },
  badge: { fontSize: 16, color: colors.primary, fontWeight: '600', marginTop: spacing.xs },
}));
