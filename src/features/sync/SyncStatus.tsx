import { Text } from 'react-native';

import type { SyncState } from '@/features/sync/scheduler';
import { useSyncState } from '@/features/sync/SyncProvider';
import { makeStyles } from '@/theme';
import { formatDateTime, t } from '@/i18n';

export function describeSync(state: SyncState): string {
  const waiting = state.pending > 0 ? t('sync.pending', { count: state.pending }) : '';
  switch (state.status) {
    case 'syncing':
      return t('sync.syncing');
    case 'offline':
      return t('sync.offline', { pending: waiting });
    case 'error':
      return t('sync.error', { pending: waiting });
    case 'idle':
      if (state.pending > 0) return t('sync.soon', { pending: waiting });
      return state.lastSuccessAt
        ? t('sync.saved', { date: formatDateTime(new Date(state.lastSuccessAt)) })
        : t('sync.never');
  }
}

/** One line telling where the data is: on the phone only, or safe on the server too. */
export function SyncStatus() {
  const styles = useStyles();
  const state = useSyncState();
  return (
    <Text style={styles.text} accessibilityLiveRegion="polite">
      {describeSync(state)}
    </Text>
  );
}

const useStyles = makeStyles((colors) => ({
  text: { fontSize: 16, color: colors.textMuted, lineHeight: 22 },
}));
