import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { env } from '@/config/env';
import { deleteAccount, exportAccountData } from '@/features/account/accountActions';
import { useAuth } from '@/features/auth/useAuth';
import { unregisterPushToken } from '@/features/circle/push';
import { useAds } from '@/features/monetization/AdsProvider';
import { usePremium } from '@/features/monetization/PremiumProvider';
import { cancelAllReminders } from '@/features/reminders/engine';
import { getSyncState, syncNow } from '@/features/sync/scheduler';
import { SyncStatus } from '@/features/sync/SyncStatus';
import { useDb } from '@/lib/db/DatabaseProvider';
import { formatAppVersion, getAppVersion } from '@/lib/appVersion';
import { AppError } from '@/lib/errors';
import { reportError } from '@/lib/monitoring';
import { requireSupabase } from '@/lib/supabase';
import { fontSize, makeStyles, spacing } from '@/theme';
import { t } from '@/i18n';

export default function AccountScreen() {
  const styles = useStyles();
  const { state, signOut } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [shouldCrash, setShouldCrash] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const db = useDb();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [dataMessage, setDataMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const premium = usePremium();
  const deleteWord = t('account.deleteWord');
  const ads = useAds();

  if (shouldCrash) {
    throw new Error('Test volontaire de l’écran d’erreur');
  }

  const email = state.status === 'signedIn' ? state.session.user.email : undefined;
  const userId = state.status === 'signedIn' ? state.session.user.id : null;

  const fail = (error: unknown, context: string) =>
    setDataMessage({
      text: reportError(error, context, {
        expected: error instanceof AppError && error.kind !== 'unknown',
      }).userMessage,
      error: true,
    });

  const exportData = async () => {
    if (!userId) return;
    setBusy('export');
    setDataMessage(null);
    try {
      await exportAccountData(requireSupabase(), db, { id: userId, email: email ?? null });
    } catch (error) {
      fail(error, 'account.export');
    } finally {
      setBusy(null);
    }
  };

  const removeAccount = async () => {
    if (!userId) return;
    setBusy('delete');
    setDataMessage(null);
    try {
      // On success the session ends: the app goes back to the sign-in screen.
      await deleteAccount(requireSupabase(), db, userId);
    } catch (error) {
      fail(error, 'account.delete');
      setBusy(null);
    }
  };

  return (
    <Screen>
      {email ? <Text style={styles.body}>{t('account.signedInAs', { email })}</Text> : null}
      <Text style={styles.body}>{t('account.localData')}</Text>
      <SyncStatus />
      <PrimaryButton
        label={t('account.syncNow')}
        variant="secondary"
        onPress={() => void syncNow('manual')}
      />
      <PrimaryButton
        label={t('account.signOut')}
        variant="secondary"
        loading={signingOut}
        onPress={() =>
          Alert.alert(
            t('account.signOutTitle'),
            t('account.signOutBody') +
              (getSyncState().pending > 0 ? t('account.signOutPending') : ''),
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('account.signOut'),
                style: 'destructive',
                onPress: () => {
                  setSigningOut(true);
                  // Last chance to send unsaved changes (fails silently when offline).
                  syncNow('sign-out')
                    // This phone must stop receiving the circle alerts of this account.
                    .then(() => unregisterPushToken(requireSupabase()))
                    .catch((error: unknown) => reportError(error, 'auth.signOut.unregisterPush'))
                    .then(() => cancelAllReminders())
                    .catch((error: unknown) => reportError(error, 'auth.signOut.cancelReminders'))
                    .then(() => signOut())
                    .finally(() => setSigningOut(false));
                },
              },
            ],
          )
        }
      />
      <PrimaryButton
        label={t('account.checkReminders')}
        onPress={() => router.push('/reminders')}
      />
      <PrimaryButton
        label={premium.state === 'premium' ? t('account.premiumActive') : t('account.premium')}
        variant="secondary"
        onPress={() => router.push('/premium')}
      />

      <Text style={styles.section} accessibilityRole="header">
        {t('account.myData')}
      </Text>
      <PrimaryButton
        label={t('account.export')}
        variant="secondary"
        loading={busy === 'export'}
        onPress={() => void exportData()}
      />
      {!confirmingDelete ? (
        <PrimaryButton
          label={t('account.delete')}
          variant="danger"
          onPress={() => {
            setConfirmation('');
            setConfirmingDelete(true);
          }}
        />
      ) : (
        <View style={styles.danger}>
          <Text style={styles.strong}>{t('account.deleteTitle')}</Text>
          <Text style={styles.body}>{t('account.deleteBody')}</Text>
          {premium.source === 'store' ? (
            <Text style={styles.strong}>{t('account.deleteSubscription')}</Text>
          ) : null}
          <TextField
            label={t('account.typeToConfirm', { word: deleteWord })}
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <PrimaryButton
            label={t('account.deleteForever')}
            variant="danger"
            loading={busy === 'delete'}
            disabled={confirmation.trim().toUpperCase() !== deleteWord.toUpperCase()}
            onPress={() => void removeAccount()}
          />
          <PrimaryButton
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setConfirmingDelete(false)}
          />
        </View>
      )}
      {dataMessage ? (
        <Text
          style={[styles.body, dataMessage.error && styles.error]}
          accessibilityRole={dataMessage.error ? 'alert' : undefined}
        >
          {dataMessage.text}
        </Text>
      ) : null}
      <PrimaryButton
        label={t('account.privacy')}
        variant="secondary"
        onPress={() => router.push('/privacy')}
      />
      {ads.privacyOptionsRequired && premium.state === 'free' ? (
        <PrimaryButton
          label={t('account.adChoices')}
          variant="secondary"
          onPress={() => void ads.openPrivacyOptions()}
        />
      ) : null}
      <MedicalDisclaimer />
      <Text style={styles.version} selectable>
        {formatAppVersion(getAppVersion())}
      </Text>

      {env.environment !== 'production' && (
        <>
          <Text style={styles.section}>{t('account.devTools')}</Text>
          <PrimaryButton
            label={t('account.testError')}
            onPress={() => {
              const error = reportError(new Error('Network request failed'), 'dev.test');
              setMessage(error.userMessage);
            }}
          />
          <PrimaryButton
            label={t('account.testCrash')}
            variant="danger"
            onPress={() => setShouldCrash(true)}
          />
          {message && (
            <Text style={styles.body} accessibilityLiveRegion="polite">
              {message}
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
  strong: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  error: { color: colors.danger },
  danger: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSurface,
    gap: spacing.sm,
  },
  version: { fontSize: 16, color: colors.textMuted, textAlign: 'center' },
  section: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
}));
