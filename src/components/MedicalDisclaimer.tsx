import { Text } from 'react-native';

import { fontSize, makeStyles, spacing } from '@/theme';
import { t } from '@/i18n';

export function MedicalDisclaimer() {
  const styles = useStyles();
  return <Text style={styles.text}>{t('disclaimer')}</Text>;
}

const useStyles = makeStyles((colors) => ({
  text: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    lineHeight: 24,
  },
}));
