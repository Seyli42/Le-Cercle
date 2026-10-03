import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { AD_REQUEST, bannerUnitId } from '@/features/monetization/ads';
import { useAds } from '@/features/monetization/AdsProvider';
import { MIN_TOUCH, makeStyles, spacing } from '@/theme';
import { t } from '@/i18n';

/** The only banner of the app (history screen), clearly labelled as an ad. */
export function AdBanner() {
  const styles = useStyles();
  const { bannerAllowed, onBannerVisible } = useAds();
  const [failed, setFailed] = useState(false);
  // The history is an allowed moment to ask for ad consent (if not given yet).
  useEffect(() => onBannerVisible(), [onBannerVisible]);
  const unitId = bannerUnitId();
  if (!bannerAllowed || !unitId || failed) return null;
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{t('ads.label')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('ads.removeA11y')}
          onPress={() => router.push('/premium')}
          style={styles.link}
        >
          <Text style={styles.linkText}>{t('ads.remove')}</Text>
        </Pressable>
      </View>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={AD_REQUEST}
        // No ad available: the space disappears instead of staying empty.
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  header: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  label: { fontSize: 14, color: colors.textMuted },
  link: { minHeight: MIN_TOUCH * 0.8, justifyContent: 'center' },
  linkText: { fontSize: 16, color: colors.primary, fontWeight: '600' },
}));
