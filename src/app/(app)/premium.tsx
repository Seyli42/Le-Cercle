import * as Application from 'expo-application';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { usePremium } from '@/features/monetization/PremiumProvider';
import {
  buyPremium,
  loadPremiumOffers,
  openSubscriptionSettings,
  restorePremium,
  type PremiumOffer,
} from '@/features/monetization/purchases';
import { AppError } from '@/lib/errors';
import { reportError } from '@/lib/monitoring';
import { fontSize, makeStyles, spacing, useColors } from '@/theme';

// Apple's standard licence agreement (used unless a custom one is set in App Store Connect).
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

const PERIOD_LABEL: Readonly<Record<PremiumOffer['period'], string>> = {
  month: 'par mois',
  year: 'par an',
  lifetime: 'une seule fois, à vie',
  other: '',
};

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function PremiumScreen() {
  const styles = useStyles();
  const colors = useColors();
  const premium = usePremium();
  const [offers, setOffers] = useState<PremiumOffer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!premium.canPurchase || premium.state === 'premium') return;
    loadPremiumOffers()
      .then(setOffers)
      .catch((error: unknown) => {
        setOffers([]);
        setMessage({
          text: reportError(error, 'premium.offers', { expected: true }).userMessage,
          error: true,
        });
      });
  }, [premium.canPurchase, premium.state]);

  const run = async (id: string, action: () => Promise<boolean>, success: string) => {
    setBusy(id);
    setMessage(null);
    try {
      const active = await action();
      premium.setStoreActive(active);
      if (active) setMessage({ text: success, error: false });
      else if (id === 'restore') {
        setMessage({ text: 'Aucun abonnement trouvé sur ce compte store.', error: false });
      }
    } catch (error) {
      setMessage({
        text: reportError(error, `premium.${id === 'restore' ? 'restore' : 'buy'}`, {
          expected: error instanceof AppError && error.kind !== 'unknown',
        }).userMessage,
        error: true,
      });
    } finally {
      setBusy(null);
    }
  };

  const packageName = Application.applicationId ?? 'com.lecercle.app';

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        Le Cercle Premium
      </Text>
      <View style={styles.card}>
        <Text style={styles.body}>✓ Aucune publicité, nulle part dans l’application</Text>
        <Text style={styles.body}>✓ Vous soutenez une application indépendante</Text>
        <Text style={styles.muted}>
          Les rappels, l’historique, le Cercle et le scan restent gratuits pour tout le monde.
        </Text>
      </View>

      {premium.state === 'premium' ? (
        <View style={styles.card} accessibilityLiveRegion="polite">
          <Text style={styles.strong}>✓ Vous êtes Premium</Text>
          {premium.source === 'grant' && premium.grant ? (
            <Text style={styles.body}>
              Offert par : {premium.grant.reason}
              {premium.grant.endsAt
                ? `, jusqu’au ${DATE.format(new Date(premium.grant.endsAt))}`
                : ''}
              .
            </Text>
          ) : (
            <PrimaryButton
              label="Gérer mon abonnement"
              variant="secondary"
              onPress={() => void openSubscriptionSettings(packageName)}
            />
          )}
        </View>
      ) : !premium.canPurchase ? (
        <Text style={styles.body}>
          L’abonnement n’est pas disponible pour le moment. Réessayez plus tard.
        </Text>
      ) : offers === null ? (
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Chargement" />
      ) : (
        offers.map((offer) => (
          <PrimaryButton
            key={offer.id}
            label={`${offer.priceString} ${PERIOD_LABEL[offer.period]}`.trim()}
            loading={busy === offer.id}
            disabled={busy !== null}
            onPress={() =>
              void run(offer.id, () => buyPremium(offer.id), 'Merci ! Premium est activé.')
            }
          />
        ))
      )}

      {message ? (
        <Text
          style={[styles.body, message.error && styles.error]}
          accessibilityRole={message.error ? 'alert' : undefined}
        >
          {message.text}
        </Text>
      ) : null}

      {premium.state !== 'premium' && premium.canPurchase ? (
        <PrimaryButton
          label="Restaurer mes achats"
          variant="secondary"
          loading={busy === 'restore'}
          disabled={busy !== null}
          onPress={() => void run('restore', restorePremium, 'Premium est restauré.')}
        />
      ) : null}

      <Text style={styles.legal}>
        Abonnement renouvelé automatiquement à la fin de chaque période, au même prix, sauf
        résiliation au moins 24 heures avant son terme. Le paiement est débité sur votre compte App
        Store ou Google Play, où vous pouvez gérer ou résilier l’abonnement à tout moment. Supprimer
        l’application ou votre compte Le Cercle ne résilie pas l’abonnement.
      </Text>
      <View style={styles.links}>
        {Platform.OS === 'ios' ? (
          <PrimaryButton
            label="Conditions d’utilisation"
            variant="secondary"
            onPress={() => void Linking.openURL(TERMS_URL)}
          />
        ) : null}
        <PrimaryButton
          label="Confidentialité"
          variant="secondary"
          onPress={() => router.push('/privacy')}
        />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
  strong: { fontSize: fontSize.body, color: colors.success, fontWeight: '700' },
  muted: { fontSize: 16, color: colors.textMuted, lineHeight: 22 },
  error: { color: colors.danger },
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, gap: spacing.sm },
  legal: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  links: { gap: spacing.sm },
}));
