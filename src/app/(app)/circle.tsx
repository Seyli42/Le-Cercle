import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { Checkbox } from '@/components/Checkbox';
import { Chip } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useUserId } from '@/features/auth/useUserId';
import {
  addMember,
  DELAY_CHOICES,
  loadCircle,
  MAX_MEMBERS,
  removeMember,
  saveSettings,
  sendInvite,
  type CircleData,
  type CircleMember,
} from '@/features/circle/api';
import { formatPhone, isMobileFr, normalizePhone } from '@/features/circle/phone';
import { AppError } from '@/lib/errors';
import { reportError } from '@/lib/monitoring';
import { requireSupabase } from '@/lib/supabase';
import { fontSize, makeStyles, spacing, useColors, type Colors } from '@/theme';

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

const consentInfo = (
  colors: Colors,
): Readonly<Record<CircleMember['consent'], { label: string; color: string }>> => ({
  confirmed: { label: '✓ A accepté : sera prévenu(e)', color: colors.success },
  pending: { label: 'En attente de sa réponse « OUI » par SMS', color: colors.warningBorder },
  revoked: { label: 'A refusé ou répondu STOP', color: colors.danger },
});

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
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
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
    return () => {
      active = false;
    };
  }, [userId]);

  useFocusEffect(load);

  const run = async (key: string, task: () => Promise<void>, success: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await task();
      setMessage({ text: success, error: false });
      load();
    } catch (error) {
      setMessage({ text: errorMessage(error, `circle.${key}`), error: true });
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <Screen>
        {loadError ? (
          <>
            <Text style={styles.body}>{loadError}</Text>
            <Text style={styles.muted}>
              Le Cercle a besoin d’internet pour prévenir vos proches. Vos rappels, eux, continuent
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

  const phone = normalizePhone(memberPhone);
  const activeCount = data.members.length;
  const nameForSms = firstName.trim() || 'Votre prénom';

  return (
    <Screen>
      <Text style={styles.body}>
        Si vous ne confirmez pas une prise après le délai choisi, Le Cercle envoie un SMS à vos
        proches qui ont accepté. Le SMS ne contient <Text style={styles.strong}>jamais</Text> le nom
        de vos médicaments.
      </Text>
      <View style={styles.example}>
        <Text style={styles.muted}>Exemple du SMS envoyé :</Text>
        <Text style={styles.body}>
          « Le Cercle : {nameForSms} n’a pas confirmé sa prise de 08:00. Il peut s’agir d’un oubli
          ou d’un souci de téléphone : pensez à prendre de ses nouvelles. »
        </Text>
      </View>

      <Text style={styles.heading} accessibilityRole="header">
        Mes réglages
      </Text>
      <TextField
        label="Mon prénom (affiché dans les SMS)"
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
          void run(
            'settings',
            () => saveSettings(requireSupabase(), userId, { firstName, delayMinutes: delay }),
            'Réglages enregistrés.',
          )
        }
      />

      <Text style={styles.heading} accessibilityRole="header">
        Mes proches ({activeCount}/{MAX_MEMBERS})
      </Text>
      {data.members.length === 0 && (
        <Text style={styles.muted}>Personne pour l’instant. Ajoutez un proche ci-dessous.</Text>
      )}
      {data.members.map((member) => (
        <View key={member.id} style={styles.card}>
          <Text style={styles.name}>{member.firstName}</Text>
          <Text style={styles.body}>{formatPhone(member.phone)}</Text>
          <Text style={[styles.status, { color: consentInfo(colors)[member.consent].color }]}>
            {consentInfo(colors)[member.consent].label}
          </Text>
          {member.consent === 'pending' && member.inviteSentAt && (
            <Text style={styles.muted}>
              Invitation envoyée le {DATE_TIME.format(new Date(member.inviteSentAt))}
            </Text>
          )}
          <View style={styles.chips}>
            {member.consent !== 'confirmed' && (
              <PrimaryButton
                label="Renvoyer l’invitation"
                variant="secondary"
                loading={busy === `invite-${member.id}`}
                onPress={() =>
                  void run(
                    `invite-${member.id}`,
                    () => sendInvite(requireSupabase(), member.id),
                    `Invitation renvoyée à ${member.firstName}.`,
                  )
                }
              />
            )}
            <PrimaryButton
              label="Retirer"
              variant="danger"
              loading={busy === `remove-${member.id}`}
              onPress={() =>
                Alert.alert(
                  `Retirer ${member.firstName} ?`,
                  'Cette personne ne sera plus prévenue.',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Retirer',
                      style: 'destructive',
                      onPress: () =>
                        void run(
                          `remove-${member.id}`,
                          () => removeMember(requireSupabase(), member.id),
                          `${member.firstName} a été retiré(e) du Cercle.`,
                        ),
                    },
                  ],
                )
              }
            />
          </View>
        </View>
      ))}

      {activeCount < MAX_MEMBERS && (
        <View style={styles.card}>
          <Text style={styles.name}>Ajouter un proche</Text>
          <TextField
            label="Son prénom"
            value={memberName}
            onChangeText={setMemberName}
            placeholder="ex. Léa"
            maxLength={50}
            autoCapitalize="words"
          />
          <TextField
            label="Son numéro de portable"
            value={memberPhone}
            onChangeText={setMemberPhone}
            placeholder="06 12 34 56 78"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            error={
              memberPhone.length >= 10 && !phone
                ? 'Numéro invalide. Exemple : 06 12 34 56 78'
                : phone && phone.startsWith('+33') && !isMobileFr(phone)
                  ? 'Ce numéro semble être un fixe : il ne pourra pas recevoir de SMS.'
                  : null
            }
          />
          <Checkbox
            checked={agreed}
            onChange={setAgreed}
            label="Cette personne est d’accord pour recevoir un SMS si je ne confirme pas une prise. Elle devra aussi accepter en répondant OUI."
          />
          <PrimaryButton
            label="Envoyer l’invitation par SMS"
            loading={busy === 'add'}
            disabled={!memberName.trim() || !phone || !agreed || !firstName.trim()}
            onPress={() => {
              if (!phone) return;
              void run(
                'add',
                async () => {
                  const client = requireSupabase();
                  if (!data.firstName || data.firstName !== firstName.trim()) {
                    await saveSettings(client, userId, { firstName, delayMinutes: delay });
                  }
                  await addMember(client, { firstName: memberName, phone });
                  setMemberName('');
                  setMemberPhone('');
                  setAgreed(false);
                },
                'Invitation envoyée. Votre proche doit répondre OUI au SMS reçu.',
              );
            }}
          />
          {!firstName.trim() && (
            <Text style={styles.muted}>Indiquez d’abord votre prénom dans « Mes réglages ».</Text>
          )}
        </View>
      )}

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
            Dernières alertes envoyées
          </Text>
          {data.alerts.map((alert) => (
            <Text key={alert.id} style={styles.body}>
              {alert.status === 'failed' ? '⚠️ Échec de l’envoi à ' : '📩 '}
              {alert.memberFirstName}
              {alert.plannedAt ? ` — prise de ${TIME.format(new Date(alert.plannedAt))}` : ''}
              {alert.sentAt ? `, le ${DATE_TIME.format(new Date(alert.sentAt))}` : ''}
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
  strong: { fontWeight: '700' },
  label: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  example: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, gap: spacing.sm },
  name: { fontSize: 20, fontWeight: '700', color: colors.text },
  status: { fontSize: 16, fontWeight: '600' },
  error: { color: colors.danger },
}));
