import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Share, Text, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useUserId } from '@/features/auth/useUserId';
import {
  acceptInvite,
  createInvite,
  DELAY_CHOICES,
  formatCode,
  inviteMessage,
  leaveLink,
  loadCircle,
  MAX_WATCHERS,
  saveSettings,
  type CircleData,
  type CircleLink,
} from '@/features/circle/api';
import { registerPushToken } from '@/features/circle/push';
import { AppError } from '@/lib/errors';
import { reportError } from '@/lib/monitoring';
import { requireSupabase } from '@/lib/supabase';
import { fontSize, makeStyles, spacing, useColors } from '@/theme';
import { formatDateTime, formatTime, formatTimeOfDay, t } from '@/i18n';

function errorMessage(error: unknown, context: string): string {
  return reportError(error, context, {
    expected: error instanceof AppError && error.kind !== 'unknown',
  }).userMessage;
}

export default function CircleScreen() {
  const styles = useStyles();
  const colors = useColors();
  const userId = useUserId();
  const [data, setData] = useState<CircleData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [delay, setDelay] = useState(30);
  const [code, setCode] = useState('');
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(() => {
    let active = true;
    loadCircle(requireSupabase(), userId)
      .then((result) => {
        if (!active) return;
        setData(result);
        setFirstName((current) => current || (result.firstName ?? ''));
        setDelay(result.delayMinutes);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(errorMessage(error, 'circle.load'));
      });
    Notifications.getPermissionsAsync()
      .then((p) => active && setNotificationsOn(p.granted))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  useFocusEffect(load);

  const run = async (key: string, task: () => Promise<string>) => {
    setBusy(key);
    setMessage(null);
    try {
      setMessage({ text: await task(), error: false });
      load();
    } catch (error) {
      setMessage({ text: errorMessage(error, `circle.${key}`), error: true });
    } finally {
      setBusy(null);
    }
  };

  /** The first name is what the other side sees: saved before inviting or joining. */
  const ensureFirstName = async () => {
    if (!data || data.firstName === firstName.trim()) return;
    await saveSettings(requireSupabase(), userId, { firstName, delayMinutes: delay });
  };

  if (!data) {
    return (
      <Screen>
        {loadError ? (
          <>
            <Text style={styles.body}>{loadError}</Text>
            <Text style={styles.muted}>{t('circle.needsInternet')}</Text>
            <PrimaryButton label={t('common.retry')} onPress={load} />
          </>
        ) : (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            accessibilityLabel={t('common.loading')}
          />
        )}
      </Screen>
    );
  }

  const nameShown = firstName.trim() || t('circle.yourFirstName');
  const confirmLeave = (link: CircleLink, title: string, detail: string, done: string) =>
    Alert.alert(title, detail, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: () =>
          void run(`leave-${link.linkId}`, async () => {
            await leaveLink(requireSupabase(), link.linkId);
            return done;
          }),
      },
    ]);

  return (
    <Screen>
      <Text style={styles.body}>{t('circle.intro')}</Text>
      <View style={styles.example}>
        <Text style={styles.muted}>{t('circle.exampleLabel')}</Text>
        <Text style={styles.strong}>{t('circle.exampleTitle', { name: nameShown })}</Text>
        <Text style={styles.body}>
          {t('circle.exampleBody', { time: formatTimeOfDay('08:00') })}
        </Text>
      </View>

      <Text style={styles.heading} accessibilityRole="header">
        {t('circle.settings')}
      </Text>
      <TextField
        label={t('circle.firstName')}
        value={firstName}
        onChangeText={setFirstName}
        placeholder={t('circle.firstNamePlaceholder')}
        maxLength={50}
        autoCapitalize="words"
      />
      <Text style={styles.label}>{t('circle.delay')}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {DELAY_CHOICES.map((minutes) => (
          <Chip
            key={minutes}
            label={
              minutes < 60
                ? t('circle.minutes', { count: minutes })
                : t('circle.hours', { count: minutes / 60 })
            }
            selected={delay === minutes}
            onPress={() => setDelay(minutes)}
          />
        ))}
      </View>
      <PrimaryButton
        label={t('circle.saveSettings')}
        variant="secondary"
        loading={busy === 'settings'}
        onPress={() =>
          void run('settings', async () => {
            await saveSettings(requireSupabase(), userId, { firstName, delayMinutes: delay });
            return t('circle.settingsSaved');
          })
        }
      />

      <Text style={styles.heading} accessibilityRole="header">
        {t('circle.watchersTitle', { count: data.watchers.length, max: MAX_WATCHERS })}
      </Text>
      {data.watchers.length === 0 && <Text style={styles.muted}>{t('circle.noWatchers')}</Text>}
      {data.watchers.map((link) => (
        <View key={link.linkId} style={styles.card}>
          <Text style={styles.name}>{link.firstName}</Text>
          <Text style={[styles.status, { color: colors.success }]}>
            {t('circle.willBeAlerted')}
          </Text>
          <PrimaryButton
            label={t('circle.remove')}
            variant="danger"
            loading={busy === `leave-${link.linkId}`}
            onPress={() =>
              confirmLeave(
                link,
                t('circle.removeTitle', { name: link.firstName }),
                t('circle.removeBody'),
                t('circle.removed', { name: link.firstName }),
              )
            }
          />
        </View>
      ))}
      {data.watchers.length < MAX_WATCHERS && (
        <View style={styles.card}>
          {data.invite ? (
            <>
              <Text style={styles.muted}>{t('circle.codeLabel')}</Text>
              <Text
                style={styles.code}
                selectable
                accessibilityLabel={t('circle.codeA11y', {
                  code: data.invite.code.split('').join(' '),
                })}
              >
                {formatCode(data.invite.code)}
              </Text>
              <Text style={styles.muted}>
                {t('circle.validUntil', { date: formatDateTime(new Date(data.invite.expiresAt)) })}
              </Text>
              <PrimaryButton
                label={t('circle.share')}
                onPress={() => {
                  const invite = data.invite;
                  if (!invite) return;
                  void Share.share({ message: inviteMessage(nameShown, invite.code) }).catch(
                    (error: unknown) => reportError(error, 'circle.share', { expected: true }),
                  );
                }}
              />
              <PrimaryButton
                label={t('circle.newCode')}
                variant="secondary"
                loading={busy === 'invite'}
                onPress={() =>
                  void run('invite', async () => {
                    await ensureFirstName();
                    await createInvite(requireSupabase());
                    return t('circle.newCodeCreated');
                  })
                }
              />
            </>
          ) : (
            <PrimaryButton
              label={t('circle.invite')}
              loading={busy === 'invite'}
              disabled={!firstName.trim()}
              onPress={() =>
                void run('invite', async () => {
                  await ensureFirstName();
                  await createInvite(requireSupabase());
                  return t('circle.codeCreated');
                })
              }
            />
          )}
          {!firstName.trim() && <Text style={styles.muted}>{t('circle.firstNameFirst')}</Text>}
        </View>
      )}

      <Text style={styles.heading} accessibilityRole="header">
        {t('circle.watchingTitle')}
      </Text>
      {!notificationsOn && (
        <View style={styles.warning}>
          <Text style={styles.body}>{t('circle.notificationsOff')}</Text>
          <PrimaryButton
            label={t('circle.openSettings')}
            variant="secondary"
            onPress={() => void Linking.openSettings()}
          />
        </View>
      )}
      {data.watching.map((link) => (
        <View key={link.linkId} style={styles.card}>
          <Text style={styles.name}>{link.firstName}</Text>
          <Text style={styles.muted}>
            {link.lastAlertAt
              ? t('circle.lastAlert', { date: formatDateTime(new Date(link.lastAlertAt)) })
              : t('circle.noAlert')}
          </Text>
          <PrimaryButton
            label={t('circle.stopWatching')}
            variant="secondary"
            loading={busy === `leave-${link.linkId}`}
            onPress={() =>
              confirmLeave(
                link,
                t('circle.stopTitle', { name: link.firstName }),
                t('circle.stopBody'),
                t('circle.stopped', { name: link.firstName }),
              )
            }
          />
        </View>
      ))}
      <View style={styles.card}>
        <TextField
          label={t('circle.codeReceived')}
          value={code}
          onChangeText={setCode}
          placeholder="ABCD-EFGH"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
        />
        <PrimaryButton
          label={t('circle.validateCode')}
          loading={busy === 'accept'}
          disabled={code.replace(/[^A-Za-z0-9]/g, '').length !== 8 || !firstName.trim()}
          onPress={() =>
            void run('accept', async () => {
              const client = requireSupabase();
              await ensureFirstName();
              const patient = await acceptInvite(client, code);
              setCode('');
              // Asked in context: the reason is obvious right now.
              const { status } = await Notifications.getPermissionsAsync();
              if (status === 'undetermined') await Notifications.requestPermissionsAsync();
              const push = await registerPushToken(client).catch((error: unknown) => {
                reportError(error, 'circle.registerPush');
                return 'unavailable' as const;
              });
              return push === 'no_permission'
                ? t('circle.watchingNoNotifications', { name: patient })
                : t('circle.watchingNow', { name: patient });
            })
          }
        />
        {!firstName.trim() && <Text style={styles.muted}>{t('circle.firstNameFirstWatcher')}</Text>}
      </View>

      {message ? (
        <Text
          style={[styles.body, message.error && styles.error]}
          accessibilityRole={message.error ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
        >
          {message.text}
        </Text>
      ) : null}

      {data.alerts.length > 0 && (
        <>
          <Text style={styles.heading} accessibilityRole="header">
            {t('circle.alertsTitle')}
          </Text>
          {data.alerts.map((alert) => (
            <Text key={alert.id} style={styles.body}>
              🔔
              {alert.plannedAt
                ? t('circle.alertIntake', { time: formatTime(new Date(alert.plannedAt)) })
                : ''}
              {alert.sentAt
                ? t('circle.alertSent', { date: formatDateTime(new Date(alert.sentAt)) })
                : ''}
            </Text>
          ))}
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
  muted: { fontSize: 16, color: colors.textMuted, lineHeight: 22 },
  strong: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  label: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  example: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, gap: spacing.sm },
  warning: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSurface,
    gap: spacing.sm,
  },
  name: { fontSize: 20, fontWeight: '700', color: colors.text },
  status: { fontSize: 16, fontWeight: '600' },
  code: {
    fontSize: fontSize.code,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.text,
    textAlign: 'center',
  },
  error: { color: colors.danger },
}));
