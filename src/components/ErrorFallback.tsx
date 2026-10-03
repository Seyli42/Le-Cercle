import { Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { DEFAULT_MESSAGES } from '@/lib/errors';
import { fontSize, makeStyles, spacing } from '@/theme';

type Props = {
  readonly onRetry: () => void;
};

/** Shown instead of a white screen when a screen crashes. The error is already sent to Sentry. */
export function ErrorFallback({ onRetry }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.title}>Oups, un problème est survenu</Text>
      <Text style={styles.body}>{DEFAULT_MESSAGES.unknown}</Text>
      <Text style={styles.body}>
        Vos rappels déjà programmés ne sont pas affectés et sonneront normalement.
      </Text>
      <PrimaryButton label="Réessayer" onPress={onRetry} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.textMuted },
}));
