import { Text } from 'react-native';

import { fontSize, makeStyles, spacing } from '@/theme';

export function MedicalDisclaimer() {
  const styles = useStyles();
  return (
    <Text style={styles.text}>
      DoseCircle ne donne aucun conseil médical. Pour toute question sur un traitement,
      adressez-vous à votre médecin ou pharmacien.
    </Text>
  );
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
