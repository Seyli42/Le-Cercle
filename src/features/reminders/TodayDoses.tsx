import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { useUserId } from '@/features/auth/useUserId';
import { listMedications } from '@/features/medications/repository';
import { listDoseEvents } from '@/features/reminders/doseEvents';
import { answerDose } from '@/features/reminders/engine';
import { useReminders } from '@/features/reminders/ReminderProvider';
import {
  buildTodayDoses,
  endOfLocalDay,
  startOfLocalDay,
  type TodayDose,
  type TodayStatus,
} from '@/features/reminders/today';
import { useDb } from '@/lib/db/DatabaseProvider';
import { reportError } from '@/lib/monitoring';
import { fontSize, makeStyles, spacing, useColors, type Colors } from '@/theme';
import { formatTime, formatTimeOfDay, t } from '@/i18n';

const statusColor = (colors: Colors): Readonly<Record<TodayStatus, string>> => ({
  taken: colors.success,
  skipped: colors.textMuted,
  snoozed: colors.warningBorder,
  due: colors.primary,
  late: colors.danger,
  upcoming: colors.textMuted,
});

/** Today's intakes, with "Pris" / "Passer" buttons (also works offline). */
export function TodayDoses() {
  const styles = useStyles();
  const colors = useColors();
  const db = useDb();
  const userId = useUserId();
  const { version } = useReminders();
  const [doses, setDoses] = useState<TodayDose[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    const now = new Date();
    Promise.all([
      listMedications(db, userId),
      listDoseEvents(db, userId, startOfLocalDay(now), endOfLocalDay(now)),
    ])
      .then(([medications, events]) => {
        if (active) setDoses(buildTodayDoses(medications, events, new Date()));
      })
      .catch((e: unknown) => {
        if (active) setError(reportError(e, 'today.load').userMessage);
      });
    return () => {
      active = false;
    };
    // `version` changes whenever an answer or a reminder changed (e.g. in background).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, userId, version]);

  useFocusEffect(load);

  const answer = async (dose: TodayDose, status: 'taken' | 'skipped' | 'pending') => {
    const key = `${dose.occurrence.scheduleId}@${dose.occurrence.at.toISOString()}`;
    setBusy(key);
    setError(null);
    try {
      await answerDose(db, userId, {
        scheduleId: dose.occurrence.scheduleId,
        medicationId: dose.occurrence.medicationId,
        scheduledAt: dose.occurrence.at.toISOString(),
        status,
      });
    } catch (e) {
      setError(reportError(e, 'today.answer').userMessage);
    } finally {
      setBusy(null);
      load();
    }
  };

  if (!doses || doses.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">
        {t('today.title')}
      </Text>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {doses.map((dose) => {
        const key = `${dose.occurrence.scheduleId}@${dose.occurrence.at.toISOString()}`;
        const answered = dose.status === 'taken' || dose.status === 'skipped';
        const a11y = {
          name: dose.occurrence.medicationName,
          time: formatTimeOfDay(dose.occurrence.timeOfDay),
        };
        return (
          <View
            key={key}
            style={[styles.row, dose.status === 'late' && styles.rowLate]}
            accessible={false}
          >
            <View style={styles.info}>
              <Text style={styles.time}>{formatTimeOfDay(dose.occurrence.timeOfDay)}</Text>
              <View style={styles.texts}>
                <Text style={styles.name}>{dose.occurrence.medicationName}</Text>
                <Text style={styles.dose}>{dose.occurrence.doseLabel}</Text>
                <Text style={[styles.status, { color: statusColor(colors)[dose.status] }]}>
                  {t(`today.status.${dose.status}`)}
                  {answered && dose.respondedAt
                    ? t('today.at', { time: formatTime(new Date(dose.respondedAt)) })
                    : ''}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              {dose.canAnswer && (
                <>
                  <Chip
                    label={t('today.taken')}
                    accessibilityLabel={t('today.takenA11y', a11y)}
                    selected
                    role="checkbox"
                    onPress={() => busy === null && void answer(dose, 'taken')}
                  />
                  <Chip
                    label={t('today.skip')}
                    accessibilityLabel={t('today.skipA11y', a11y)}
                    selected={false}
                    role="checkbox"
                    onPress={() => busy === null && void answer(dose, 'skipped')}
                  />
                </>
              )}
              {answered && (
                <Chip
                  label={t('today.undo')}
                  accessibilityLabel={t('today.undoA11y', a11y)}
                  selected={false}
                  role="checkbox"
                  onPress={() => busy === null && void answer(dose, 'pending')}
                />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: spacing.sm },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text },
  row: {
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  rowLate: { borderWidth: 2, borderColor: colors.danger },
  info: { flexDirection: 'row', gap: spacing.md },
  time: { fontSize: 22, fontWeight: '700', color: colors.text, minWidth: 64 },
  texts: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  dose: { fontSize: fontSize.body, color: colors.textMuted },
  status: { fontSize: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { fontSize: fontSize.body, color: colors.danger },
}));
