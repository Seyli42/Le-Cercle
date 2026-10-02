import { router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { MedicationForm } from '@/features/medications/MedicationForm';
import { useMedicationActions } from '@/features/medications/useMedications';
import { AppError } from '@/lib/errors';
import { reportError } from '@/lib/monitoring';

export default function NewMedicationScreen() {
  const { create } = useMedicationActions();
  return (
    <Screen>
      <MedicationForm
        submitLabel="Enregistrer"
        onSubmit={async (input) => {
          try {
            await create(input);
          } catch (error) {
            throw reportError(error, 'medications.create', {
              expected: error instanceof AppError && error.kind === 'validation',
            });
          }
          router.back();
        }}
      />
    </Screen>
  );
}
