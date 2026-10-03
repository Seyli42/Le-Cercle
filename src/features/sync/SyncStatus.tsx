import { Text } from 'react-native';

import type { SyncState } from '@/features/sync/scheduler';
import { useSyncState } from '@/features/sync/SyncProvider';
import { makeStyles } from '@/theme';

const TIME = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export function describeSync(state: SyncState): string {
  const waiting =
    state.pending > 0
      ? `${state.pending} modification${state.pending > 1 ? 's' : ''} en attente d’envoi. `
      : '';
  switch (state.status) {
    case 'syncing':
      return 'Sauvegarde en ligne en cours…';
    case 'offline':
      return `Hors ligne. ${waiting}Tout reste enregistré sur ce téléphone et sera envoyé dès le retour du réseau.`;
    case 'error':
      return `Sauvegarde en ligne momentanément impossible. ${waiting}Nouvel essai automatique.`;
    case 'idle':
      if (state.pending > 0) return `${waiting}Envoi dans quelques secondes.`;
      return state.lastSuccessAt
        ? `✓ Sauvegardé en ligne le ${TIME.format(new Date(state.lastSuccessAt))}.`
        : 'Pas encore sauvegardé en ligne.';
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
