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
import { t } from '@/i18n';

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
        <ActivityIndicator
          size="large"
          color={colors.primary}
          accessibilityLabel={t('common.loading')}
        />
      </Screen>
    );
  }
  const medication = state.data;
  if (!medication) {
    return (
      <Screen>
        <Text style={styles.body}>{t('editMedication.deleted')}</Text>
        <PrimaryButton label={t('editMedication.backToList')} onPress={() => router.back()} />
      </Screen>
    );
  }

  const confirmDelete = () => {
    Alert.alert(
      t('editMedication.deleteTitle', { name: medication.name }),
      t('editMedication.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('editMedication.delete'),
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
        submitLabel={t('medicationForm.saveChanges')}
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
        label={t('editMedication.deleteButton')}
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
