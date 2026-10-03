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
import { formatDate, t } from '@/i18n';

// Apple's standard licence agreement (used unless a custom one is set in App Store Connect).
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

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
        setMessage({ text: t('premium.nothingToRestore'), error: false });
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

  const packageName = Application.applicationId ?? 'com.dosecircle.app';

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {t('premium.title')}
      </Text>
      <View style={styles.card}>
        <Text style={styles.body}>{t('premium.noAds')}</Text>
        <Text style={styles.body}>{t('premium.support')}</Text>
        <Text style={styles.muted}>{t('premium.freeForAll')}</Text>
      </View>

      {premium.state === 'premium' ? (
        <View style={styles.card} accessibilityLiveRegion="polite">
          <Text style={styles.strong}>{t('premium.active')}</Text>
          {premium.source === 'grant' && premium.grant ? (
            <Text style={styles.body}>
              {t('premium.grantedBy', { reason: premium.grant.reason })}
              {premium.grant.endsAt
                ? t('premium.until', {
                    date: formatDate(new Date(premium.grant.endsAt), {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }),
                  })
                : ''}
              .
            </Text>
          ) : (
            <PrimaryButton
              label={t('premium.manage')}
              variant="secondary"
              onPress={() => void openSubscriptionSettings(packageName)}
            />
          )}
        </View>
      ) : !premium.canPurchase ? (
        <Text style={styles.body}>{t('premium.unavailable')}</Text>
      ) : offers === null ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          accessibilityLabel={t('common.loading')}
        />
      ) : (
        offers.map((offer) => (
          <PrimaryButton
            key={offer.id}
            label={`${offer.priceString} ${t(`premium.period.${offer.period}`)}`.trim()}
            loading={busy === offer.id}
            disabled={busy !== null}
            onPress={() => void run(offer.id, () => buyPremium(offer.id), t('premium.thanks'))}
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
          label={t('premium.restore')}
          variant="secondary"
          loading={busy === 'restore'}
          disabled={busy !== null}
          onPress={() => void run('restore', restorePremium, t('premium.restored'))}
        />
      ) : null}

      <Text style={styles.legal}>{t('premium.legal')}</Text>
      <View style={styles.links}>
        {Platform.OS === 'ios' ? (
          <PrimaryButton
            label={t('premium.terms')}
            variant="secondary"
            onPress={() => void Linking.openURL(TERMS_URL)}
          />
        ) : null}
        <PrimaryButton
          label={t('premium.privacy')}
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
