import { Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { t } from '@/i18n';
import { fontSize, makeStyles, spacing } from '@/theme';

/**
 * Plain-language summary of the privacy policy, readable before and after sign-in.
 * Full text: docs/PRIVACY.md (to publish on the website before going live).
 */
const SECTIONS = ['collected', 'why', 'ads', 'where', 'howLong', 'rights', 'notMedical'] as const;

export default function PrivacyScreen() {
  const styles = useStyles();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('nav.privacy') }} />
      {SECTIONS.map((section) => (
        <View key={section} style={styles.section}>
          <Text style={styles.title} accessibilityRole="header">
            {t(`privacyScreen.${section}.title`)}
          </Text>
          <Text style={styles.body}>{t(`privacyScreen.${section}.body`)}</Text>
        </View>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: spacing.xs },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
}));
