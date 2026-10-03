import { Text } from 'react-native';

import { Screen } from '@/components/Screen';
import { fontSize, makeStyles } from '@/theme';
import { t } from '@/i18n';

/** Development only: production builds refuse to start without this configuration. */
export function ConfigMissing() {
  const styles = useStyles();
  return (
    <Screen>
      <Text style={styles.title}>{t('configMissing.title')}</Text>
      <Text style={styles.body}>{t('configMissing.body')}</Text>
      <Text style={styles.body}>{t('configMissing.guide')}</Text>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
}));
