import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import type { Issue } from '@/features/reminders/health';
import { CHANNEL_ID } from '@/features/reminders/notifications';
import { useReminders } from '@/features/reminders/ReminderProvider';
import { openSystemSettings } from '@/features/reminders/settingsLinks';
import { reportError } from '@/lib/monitoring';
import { fontSize, makeStyles, spacing } from '@/theme';
import { formatDate, t } from '@/i18n';

const formatLong = (date: Date) =>
  formatDate(date, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

function Check({ ok, label }: { readonly ok: boolean | null; readonly label: string }) {
  const styles = useStyles();
  const icon = ok === null ? '•' : ok ? '✅' : '❌';
  return (
    <Text style={styles.check}>
      {icon} {label}
      {ok === null ? t('remindersCheck.unverifiable') : ''}
    </Text>
  );
}

export default function RemindersCheckScreen() {
  const styles = useStyles();
  const { health, issues, sync, refresh, syncNow, askPermission } = useReminders();
  const [testSent, setTestSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const act = async (issue: Issue) => {
    setBusy(true);
    try {
      if (issue.action.kind === 'request-permission') await askPermission();
      else if (issue.action.kind === 'retry-sync') await syncNow();
      else await openSystemSettings(issue.action.kind);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `test_${Date.now()}`,
        content: {
          title: t('remindersCheck.testTitle'),
          body: t('remindersCheck.testBody'),
          sound: 'default',
          interruptionLevel: 'timeSensitive',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 10,
          channelId: CHANNEL_ID,
        },
      });
      setTestSent(t('remindersCheck.testSent'));
    } catch (error) {
      setTestSent(reportError(error, 'reminders.test').userMessage);
    }
  };

  return (
    <Screen>
      <Text style={styles.title}>
        {issues.length === 0 ? t('remindersCheck.allGood') : t('remindersCheck.toFix')}
      </Text>
      <Text style={styles.body}>{t('remindersCheck.intro')}</Text>

      {issues.map((issue) => (
        <View
          key={issue.id}
          style={[styles.card, issue.level === 'critical' ? styles.critical : styles.warning]}
        >
          <Text style={styles.cardTitle}>{issue.title}</Text>
          <Text style={styles.body}>{issue.description}</Text>
          <PrimaryButton
            label={issue.action.label}
            loading={busy}
            onPress={() => void act(issue)}
          />
        </View>
      ))}

      {health && (
        <View style={styles.card}>
          <Check ok={health.permission === 'granted'} label={t('remindersCheck.notifications')} />
          {Platform.OS === 'android' && (
            <>
              <Check ok={health.exactAlarms} label={t('remindersCheck.exact')} />
              <Check ok={health.ignoringBatteryOptimizations} label={t('remindersCheck.battery')} />
            </>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.body}>
          {t('remindersCheck.scheduled')}
          <Text style={styles.strong}>{sync?.pending ?? '…'}</Text>
        </Text>
        <Text style={styles.body}>
          {t('remindersCheck.next')}
          <Text style={styles.strong}>
            {sync?.nextAt ? formatLong(sync.nextAt) : t('remindersCheck.none')}
          </Text>
        </Text>
        {sync?.coveredUntil && (
          <Text style={styles.body}>
            {t('remindersCheck.coveredUntil', { date: formatLong(sync.coveredUntil) })}
            {sync.truncated ? t('remindersCheck.truncated') : ''}
          </Text>
        )}
      </View>

      <PrimaryButton
        label={t('remindersCheck.sendTest')}
        variant="secondary"
        onPress={() => void sendTest()}
      />
      {testSent ? (
        <Text style={styles.body} accessibilityLiveRegion="polite">
          {testSent}
        </Text>
      ) : null}

      {Platform.OS === 'android' && (
        <PrimaryButton
          label={t('remindersCheck.phoneTips')}
          variant="secondary"
          onPress={() => void Linking.openURL('https://dontkillmyapp.com/')}
        />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
  strong: { fontWeight: '700' },
  card: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, gap: spacing.sm },
  critical: { backgroundColor: colors.dangerSurface },
  warning: { backgroundColor: colors.warningSurface },
  cardTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  check: { fontSize: fontSize.body, color: colors.text },
}));
