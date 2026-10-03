import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Share, Text, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { APP_NAME } from '@/config/brand';
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

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

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
            <Text style={styles.muted}>
              DoseCircle a besoin d’internet pour prévenir vos proches. Vos rappels, eux, continuent
              de fonctionner sans connexion.
            </Text>
            <PrimaryButton label="Réessayer" onPress={load} />
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Chargement" />
        )}
      </Screen>
    );
  }

  const nameShown = firstName.trim() || 'Votre prénom';
  const confirmLeave = (link: CircleLink, title: string, detail: string, done: string) =>
    Alert.alert(title, detail, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer',
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
      <Text style={styles.body}>
        Si vous ne confirmez pas une prise après le délai choisi, vos proches reçoivent une
        notification sur leur téléphone. Elle ne contient <Text style={styles.strong}>jamais</Text>{' '}
        le nom de vos médicaments. C’est gratuit, pour vous comme pour eux.
      </Text>
      <View style={styles.example}>
        <Text style={styles.muted}>Exemple de notification reçue :</Text>
        <Text style={styles.strong}>{nameShown} n’a pas confirmé sa prise</Text>
        <Text style={styles.body}>
          Prise prévue à 08:00. Il peut s’agir d’un oubli ou d’un souci de téléphone : pensez à
          prendre de ses nouvelles.
        </Text>
      </View>

      <Text style={styles.heading} accessibilityRole="header">
        Mes réglages
      </Text>
      <TextField
        label="Mon prénom (vu par mes proches)"
        value={firstName}
        onChangeText={setFirstName}
        placeholder="ex. Marie"
        maxLength={50}
        autoCapitalize="words"
      />
      <Text style={styles.label}>Prévenir mes proches si je n’ai pas confirmé après</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {DELAY_CHOICES.map((minutes) => (
          <Chip
            key={minutes}
            label={minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}
            selected={delay === minutes}
            onPress={() => setDelay(minutes)}
          />
        ))}
      </View>
      <PrimaryButton
        label="Enregistrer mes réglages"
        variant="secondary"
        loading={busy === 'settings'}
        onPress={() =>
          void run('settings', async () => {
            await saveSettings(requireSupabase(), userId, { firstName, delayMinutes: delay });
            return 'Réglages enregistrés.';
          })
        }
      />

      <Text style={styles.heading} accessibilityRole="header">
        Les proches qui veillent sur moi ({data.watchers.length}/{MAX_WATCHERS})
      </Text>
      {data.watchers.length === 0 && (
        <Text style={styles.muted}>
          Personne pour l’instant. Invitez un enfant, un voisin, une aide à domicile : il installe{' '}
          {APP_NAME} (gratuit) et saisit votre code.
        </Text>
      )}
      {data.watchers.map((link) => (
        <View key={link.linkId} style={styles.card}>
          <Text style={styles.name}>{link.firstName}</Text>
          <Text style={[styles.status, { color: colors.success }]}>
            ✓ Sera prévenu(e) si je ne confirme pas une prise
          </Text>
          <PrimaryButton
            label="Retirer"
            variant="danger"
            loading={busy === `leave-${link.linkId}`}
            onPress={() =>
              confirmLeave(
                link,
                `Retirer ${link.firstName} ?`,
                'Cette personne ne sera plus prévenue.',
                `${link.firstName} ne fait plus partie de votre Cercle.`,
              )
            }
          />
        </View>
      ))}
      {data.watchers.length < MAX_WATCHERS && (
        <View style={styles.card}>
          {data.invite ? (
            <>
              <Text style={styles.muted}>Code à donner à votre proche :</Text>
              <Text
                style={styles.code}
                selectable
                accessibilityLabel={`Code : ${data.invite.code.split('').join(' ')}`}
              >
                {formatCode(data.invite.code)}
              </Text>
              <Text style={styles.muted}>
                Valable jusqu’au {DATE_TIME.format(new Date(data.invite.expiresAt))}, une seule
                fois.
              </Text>
              <PrimaryButton
                label="Partager l’invitation"
                onPress={() => {
                  const invite = data.invite;
                  if (!invite) return;
                  void Share.share({ message: inviteMessage(nameShown, invite.code) }).catch(
                    (error: unknown) => reportError(error, 'circle.share', { expected: true }),
                  );
                }}
              />
              <PrimaryButton
                label="Créer un nouveau code"
                variant="secondary"
                loading={busy === 'invite'}
                onPress={() =>
                  void run('invite', async () => {
                    await ensureFirstName();
                    await createInvite(requireSupabase());
                    return 'Nouveau code créé : l’ancien ne fonctionne plus.';
                  })
                }
              />
            </>
          ) : (
            <PrimaryButton
              label="Inviter un proche"
              loading={busy === 'invite'}
              disabled={!firstName.trim()}
              onPress={() =>
                void run('invite', async () => {
                  await ensureFirstName();
                  await createInvite(requireSupabase());
                  return 'Code créé : partagez-le avec votre proche.';
                })
              }
            />
          )}
          {!firstName.trim() && (
            <Text style={styles.muted}>Indiquez d’abord votre prénom dans « Mes réglages ».</Text>
          )}
        </View>
      )}

      <Text style={styles.heading} accessibilityRole="header">
        Je veille sur un proche
      </Text>
      {!notificationsOn && (
        <View style={styles.warning}>
          <Text style={styles.body}>
            ⚠️ Les notifications sont désactivées : vous ne serez pas prévenu(e).
          </Text>
          <PrimaryButton
            label="Ouvrir les réglages"
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
              ? `Dernière alerte : ${DATE_TIME.format(new Date(link.lastAlertAt))}`
              : 'Aucune alerte pour l’instant.'}
          </Text>
          <PrimaryButton
            label="Ne plus veiller"
            variant="secondary"
            loading={busy === `leave-${link.linkId}`}
            onPress={() =>
              confirmLeave(
                link,
                `Ne plus veiller sur ${link.firstName} ?`,
                'Vous ne serez plus prévenu(e) de ses prises non confirmées.',
                `Vous ne veillez plus sur ${link.firstName}.`,
              )
            }
          />
        </View>
      ))}
      <View style={styles.card}>
        <TextField
          label="Code reçu de votre proche"
          value={code}
          onChangeText={setCode}
          placeholder="ABCD-EFGH"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
        />
        <PrimaryButton
          label="Valider le code"
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
                ? `Vous veillez sur ${patient}. Autorisez les notifications pour être prévenu(e).`
                : `Vous veillez maintenant sur ${patient} : vous serez prévenu(e) si une prise n’est pas confirmée.`;
            })
          }
        />
        {!firstName.trim() && (
          <Text style={styles.muted}>
            Indiquez d’abord votre prénom dans « Mes réglages » : votre proche le verra.
          </Text>
        )}
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
            Dernières alertes envoyées à mes proches
          </Text>
          {data.alerts.map((alert) => (
            <Text key={alert.id} style={styles.body}>
              🔔
              {alert.plannedAt ? ` Prise de ${TIME.format(new Date(alert.plannedAt))}` : ''}
              {alert.sentAt ? `, prévenus le ${DATE_TIME.format(new Date(alert.sentAt))}` : ''}
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
