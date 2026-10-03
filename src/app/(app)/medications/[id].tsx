import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text } from 'react-native';

import { ErrorFallback } from '@/components/ErrorFallback';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { MedicationForm } from '@/features/medications/MedicationForm';
import { useMedication, useMedicationActions } from '@/features/medications/useMedications';
import { AppError } from '@/lib/errors';
import { reportError } from '@/lib/monitoring';
import { fontSize, makeStyles, useColors } from '@/theme';

export default function EditMedicationScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, reload } = useMedication(id);
  const { update, remove } = useMedicationActions();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (state.status === 'error') return <ErrorFallback onRetry={reload} />;
  if (state.status === 'loading') {
    return (
      <Screen>
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Chargement" />
      </Screen>
    );
  }
  const medication = state.data;
  if (!medication) {
    return (
      <Screen>
        <Text style={styles.body}>Ce médicament a été supprimé.</Text>
        <PrimaryButton label="Retour à la liste" onPress={() => router.back()} />
      </Screen>
    );
  }

  const confirmDelete = () => {
    Alert.alert(
      `Supprimer ${medication.name} ?`,
      'Ses rappels seront arrêtés. Cette action est définitive.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            setDeleteError(null);
            remove(medication.id)
              .then(() => router.back())
              .catch((error: unknown) => {
                setDeleteError(reportError(error, 'medications.delete').userMessage);
                setDeleting(false);
              });
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <MedicationForm
        initial={medication}
        submitLabel="Enregistrer les modifications"
        onSubmit={async (input) => {
          try {
            await update(medication.id, input);
          } catch (error) {
            throw reportError(error, 'medications.update', {
              expected: error instanceof AppError && error.kind === 'validation',
            });
          }
          router.back();
        }}
      />
      {deleteError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {deleteError}
        </Text>
      ) : null}
      <PrimaryButton
        label="Supprimer ce médicament"
        variant="danger"
        loading={deleting}
        onPress={confirmDelete}
      />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  body: { fontSize: fontSize.body, color: colors.text },
  error: { fontSize: fontSize.body, color: colors.danger },
}));
