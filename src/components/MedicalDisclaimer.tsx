import { StyleSheet, Text } from 'react-native';

import { colors, fontSize, spacing } from '@/theme';

export function MedicalDisclaimer() {
  return (
    <Text style={styles.text}>
      Le Cercle ne donne aucun conseil médical. Pour toute question sur un traitement, adressez-vous
      à votre médecin ou pharmacien.
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    lineHeight: 24,
  },
});
