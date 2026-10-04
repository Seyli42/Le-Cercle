import { Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { env } from '@/config/env';
import { DEFAULT_MESSAGES } from '@/lib/errors';
import { fontSize, makeStyles, spacing } from '@/theme';
import { t } from '@/i18n';

type Props = {
  readonly onRetry: () => void;
  /** Shown to testers only (never in production builds): what failed and where. */
  readonly error?: unknown;
  readonly where?: string;
};

function describe(error: unknown): string {
  const root = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  if (root instanceof Error) return `${root.name}: ${root.message}`.slice(0, 600);
  return String(root).slice(0, 600);
}

/** Shown instead of a white screen when a screen crashes. The error is already sent to Sentry. */
export function ErrorFallback({ onRetry, error, where }: Props) {
  const styles = useStyles();
  const showDetails = env.environment !== 'production' && (error !== undefined || where);
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.title}>{t('errorFallback.title')}</Text>
      <Text style={styles.body}>{DEFAULT_MESSAGES.unknown}</Text>
      <Text style={styles.body}>{t('errorFallback.remindersSafe')}</Text>
      <PrimaryButton label={t('common.retry')} onPress={onRetry} />
      {showDetails ? (
        <Text style={styles.details} selectable>
          {`[${where ?? 'screen'}] ${error === undefined ? '' : describe(error)}`}
        </Text>
      ) : null}
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
  details: { fontSize: 13, fontFamily: 'monospace', color: colors.textMuted },
}));
