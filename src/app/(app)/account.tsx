import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { env } from '@/config/env';
import {
  DELETE_CONFIRMATION_WORD,
  deleteAccount,
  exportAccountData,
} from '@/features/account/accountActions';
import { useAuth } from '@/features/auth/useAuth';
import { cancelAllReminders } from '@/features/reminders/engine';
import { getSyncState, syncNow } from '@/features/sync/scheduler';
import { SyncStatus } from '@/features/sync/SyncStatus';
import { useDb } from '@/lib/db/DatabaseProvider';
import { AppError } from '@/lib/errors';
import { reportError } from '@/lib/monitoring';
import { requireSupabase } from '@/lib/supabase';
import { fontSize, makeStyles, spacing } from '@/theme';

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
      {email ? <Text style={styles.body}>Connecté avec {email}</Text> : null}
      <Text style={styles.body}>
        Vos médicaments sont enregistrés sur ce téléphone, chiffrés, et sauvegardés en ligne dès
        qu’il y a du réseau. Ils restent disponibles sans connexion.
      </Text>
      <SyncStatus />
      <PrimaryButton
        label="Sauvegarder maintenant"
        variant="secondary"
        onPress={() => void syncNow('manual')}
      />
      <PrimaryButton
        label="Se déconnecter"
        variant="secondary"
        loading={signingOut}
        onPress={() =>
          Alert.alert(
            'Se déconnecter ?',
            'Vous ne recevrez plus aucun rappel de médicament sur ce téléphone tant que vous ne serez pas reconnecté.' +
              (getSyncState().pending > 0
                ? ' Certaines modifications ne sont pas encore sauvegardées en ligne : elles restent sur ce téléphone et seront envoyées à votre prochaine connexion.'
                : ''),
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Se déconnecter',
                style: 'destructive',
                onPress: () => {
                  setSigningOut(true);
                  // Last chance to send unsaved changes (fails silently when offline).
                  syncNow('sign-out')
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
      <PrimaryButton label="Vérifier mes rappels" onPress={() => router.push('/reminders')} />

      <Text style={styles.section} accessibilityRole="header">
        Mes données
      </Text>
      <PrimaryButton
        label="Exporter mes données"
        variant="secondary"
        loading={busy === 'export'}
        onPress={() => void exportData()}
      />
      {!confirmingDelete ? (
        <PrimaryButton
          label="Supprimer mon compte"
          variant="danger"
          onPress={() => {
            setConfirmation('');
            setConfirmingDelete(true);
          }}
        />
      ) : (
        <View style={styles.danger}>
          <Text style={styles.strong}>Supprimer définitivement votre compte ?</Text>
          <Text style={styles.body}>
            Vos médicaments, votre historique, votre Cercle et vos réglages seront effacés de ce
            téléphone et de nos serveurs. Vos rappels s’arrêteront et vos proches ne seront plus
            prévenus. Cette action est irréversible : exportez vos données avant si besoin.
          </Text>
          <TextField
            label={`Pour confirmer, tapez ${DELETE_CONFIRMATION_WORD}`}
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <PrimaryButton
            label="Supprimer définitivement"
            variant="danger"
            loading={busy === 'delete'}
            disabled={confirmation.trim().toUpperCase() !== DELETE_CONFIRMATION_WORD}
            onPress={() => void removeAccount()}
          />
          <PrimaryButton
            label="Annuler"
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
        label="Confidentialité"
        variant="secondary"
        onPress={() => router.push('/privacy')}
      />
      <MedicalDisclaimer />

      {env.environment !== 'production' && (
        <>
          <Text style={styles.section}>Outils de test (masqués en production)</Text>
          <PrimaryButton
            label="Tester une erreur gérée"
            onPress={() => {
              const error = reportError(new Error('Network request failed'), 'dev.test');
              setMessage(error.userMessage);
            }}
          />
          <PrimaryButton
            label="Tester un plantage d’écran"
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
  section: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
}));
