import { router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { MedicationForm } from '@/features/medications/MedicationForm';
import { useMedicationActions } from '@/features/medications/useMedications';
import { useAds } from '@/features/monetization/AdsProvider';
import { AppError } from '@/lib/errors';
import { reportError } from '@/lib/monitoring';

export default function NewMedicationScreen() {
  const { create } = useMedicationActions();
  const { onMoment } = useAds();
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
          // A finished task: a full-screen ad MAY follow (never in the first days, at most
          // once a day, never close to an intake: see adPolicy).
          onMoment('medication_saved');
        }}
      />
    </Screen>
  );
}
