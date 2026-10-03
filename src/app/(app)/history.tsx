import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ErrorFallback } from '@/components/ErrorFallback';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { Screen } from '@/components/Screen';
import { useUserId } from '@/features/auth/useUserId';
import {
  buildHistory,
  countHistory,
  type HistoryCounts,
  type HistoryDay,
  type HistoryStatus,
} from '@/features/history/history';
import { formatLocalDate } from '@/features/medications/dates';
import { listMedications, medicationLabels } from '@/features/medications/repository';
import { AdBanner } from '@/features/monetization/AdBanner';
import { useAds } from '@/features/monetization/AdsProvider';
import { listDoseEvents } from '@/features/reminders/doseEvents';
import { useReminders } from '@/features/reminders/ReminderProvider';
import { startOfLocalDay } from '@/features/reminders/today';
import { SyncStatus } from '@/features/sync/SyncStatus';
import { useDb } from '@/lib/db/DatabaseProvider';
import { reportError } from '@/lib/monitoring';
import { fontSize, makeStyles, spacing, useColors, type Colors } from '@/theme';

const DAYS = 30;

const statusInfo = (
  colors: Colors,
): Readonly<Record<HistoryStatus, { label: string; color: string }>> => ({
  taken: { label: '✓ Pris', color: colors.success },
  skipped: { label: 'Passé', color: colors.textMuted },
  unconfirmed: { label: 'Non confirmé', color: colors.danger },
});

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

type Data = { days: HistoryDay[]; week: HistoryCounts; month: HistoryCounts };

function Counts({ title, counts }: { readonly title: string; readonly counts: HistoryCounts }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.big}>
        {counts.taken} prise{counts.taken > 1 ? 's' : ''} confirmée{counts.taken > 1 ? 's' : ''} sur{' '}
        {counts.planned}
      </Text>
      {counts.skipped + counts.unconfirmed > 0 && (
        <Text style={styles.body}>
          {counts.skipped > 0 ? `${counts.skipped} passée${counts.skipped > 1 ? 's' : ''}` : ''}
          {counts.skipped > 0 && counts.unconfirmed > 0 ? ' · ' : ''}
          {counts.unconfirmed > 0
            ? `${counts.unconfirmed} non confirmée${counts.unconfirmed > 1 ? 's' : ''}`
            : ''}
        </Text>
      )}
    </View>
  );
}

export default function HistoryScreen() {
  const styles = useStyles();
  const colors = useColors();
  const db = useDb();
  const userId = useUserId();
  const { version } = useReminders();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const { onMoment } = useAds();
  const onMomentRef = useRef(onMoment);
  useEffect(() => {
    onMomentRef.current = onMoment;
  }, [onMoment]);
  // Leaving the history is one of the two moments a full-screen ad may follow.
  useEffect(() => () => onMomentRef.current('history_closed'), []);

  const load = useCallback(() => {
    let active = true;
    const now = new Date();
    const from = startOfLocalDay(new Date(now.getTime() - (DAYS - 1) * 86_400_000));
    Promise.all([
      listMedications(db, userId),
      medicationLabels(db, userId),
      listDoseEvents(db, userId, from, now),
    ])
      .then(([medications, labels, events]) => {
        if (!active) return;
        const days = buildHistory({ medications, labels, events, from, now });
        const weekStart = startOfLocalDay(new Date(now.getTime() - 6 * 86_400_000));
        setData({ days, week: countHistory(days, weekStart), month: countHistory(days) });
        setFailed(false);
      })
      .catch((error: unknown) => {
        reportError(error, 'history.load');
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
    // `version` changes when answers arrive (notification, other phone).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, userId, version]);

  useFocusEffect(load);

  if (failed) return <ErrorFallback onRetry={load} />;
  if (!data) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Chargement" />
      </Screen>
    );
  }

  return (
    <Screen footer={<AdBanner />}>
      <SyncStatus />
      <Counts title="7 derniers jours" counts={data.week} />
      <Counts title={`${DAYS} derniers jours`} counts={data.month} />
      {data.days.length === 0 && (
        <Text style={styles.body}>Aucune prise passée pour l’instant.</Text>
      )}
      {data.days.map((day) => (
        <View key={day.date} style={styles.day}>
          <Text style={styles.dayTitle} accessibilityRole="header">
            {formatLocalDate(day.date)}
          </Text>
          {day.items.map((item) => (
            <View
              key={item.key}
              style={styles.row}
              accessible
              accessibilityLabel={`${item.timeOfDay}, ${item.medicationName}, ${statusInfo(colors)[item.status].label}`}
            >
              <Text style={styles.time}>{item.timeOfDay}</Text>
              <View style={styles.texts}>
                <Text style={styles.name}>{item.medicationName}</Text>
                {item.doseLabel ? <Text style={styles.body}>{item.doseLabel}</Text> : null}
              </View>
              <Text style={[styles.status, { color: statusInfo(colors)[item.status].color }]}>
                {statusInfo(colors)[item.status].label}
                {item.status === 'taken' && item.respondedAt
                  ? `\nà ${TIME.format(new Date(item.respondedAt))}`
                  : ''}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <MedicalDisclaimer />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
  big: { fontSize: 22, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.textMuted },
  day: { gap: spacing.xs, marginTop: spacing.sm },
  dayTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  time: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, minWidth: 56 },
  texts: { flex: 1 },
  name: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  status: { fontSize: 16, fontWeight: '600', textAlign: 'right' },
}));
