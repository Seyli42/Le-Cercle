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

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
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
      {ok === null ? ' (vérifiable dans la vraie application)' : ''}
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
          title: '🔔 Test DoseCircle',
          body: 'Vos rappels fonctionnent. Vous pouvez fermer cette notification.',
          sound: 'default',
          interruptionLevel: 'timeSensitive',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 10,
          channelId: CHANNEL_ID,
        },
      });
      setTestSent('Rappel test dans 10 secondes : verrouillez votre téléphone pour vérifier.');
    } catch (error) {
      setTestSent(reportError(error, 'reminders.test').userMessage);
    }
  };

  return (
    <Screen>
      <Text style={styles.title}>{issues.length === 0 ? '✅ Tout est prêt' : '⚠️ À corriger'}</Text>
      <Text style={styles.body}>
        Les rappels sont programmés sur ce téléphone : ils sonnent sans connexion internet,
        téléphone verrouillé, et après un redémarrage.
      </Text>

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
          <Check ok={health.permission === 'granted'} label="Notifications autorisées" />
          {Platform.OS === 'android' && (
            <>
              <Check ok={health.exactAlarms} label="Alarmes à l’heure exacte" />
              <Check ok={health.ignoringBatteryOptimizations} label="Batterie sans restriction" />
            </>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.body}>
          Rappels programmés : <Text style={styles.strong}>{sync?.pending ?? '…'}</Text>
        </Text>
        <Text style={styles.body}>
          Prochain rappel :{' '}
          <Text style={styles.strong}>
            {sync?.nextAt ? DATE_TIME.format(sync.nextAt) : 'aucun'}
          </Text>
        </Text>
        {sync?.coveredUntil && (
          <Text style={styles.body}>
            Programmés jusqu’au : {DATE_TIME.format(sync.coveredUntil)}
            {sync.truncated ? ' (la suite sera programmée automatiquement)' : ''}
          </Text>
        )}
      </View>

      <PrimaryButton
        label="Envoyer un rappel test"
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
          label="Conseils pour mon modèle de téléphone"
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
