import { fireEvent, render, screen } from '@testing-library/react-native';

import { MedicationForm } from '@/features/medications/MedicationForm';
import { AppError } from '@/lib/errors';

jest.mock('@react-native-community/datetimepicker', () => () => null);

async function fillRequired() {
  await fireEvent.changeText(screen.getByLabelText('Nom du médicament'), '  Kardégic 75 ');
  await fireEvent.changeText(screen.getByLabelText('Quantité par prise'), '1 sachet');
}

it('shows field errors and does not save an empty form', async () => {
  const onSubmit = jest.fn(async () => undefined);
  await render(<MedicationForm submitLabel="Enregistrer" onSubmit={onSubmit} />);
  await fireEvent.press(screen.getByLabelText('Enregistrer'));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('Indiquez le nom du médicament.')).toBeTruthy();
  expect(screen.getByText(/Indiquez la quantité par prise/)).toBeTruthy();
});

it('saves a cleaned medication with a default daily 08:00 schedule', async () => {
  const onSubmit = jest.fn(async () => undefined);
  await render(<MedicationForm submitLabel="Enregistrer" onSubmit={onSubmit} />);
  await fillRequired();
  await fireEvent.press(screen.getByLabelText('samedi'));
  await fireEvent.press(screen.getByLabelText('Enregistrer'));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Kardégic 75',
      doseLabel: '1 sachet',
      form: 'tablet',
      endsOn: null,
      schedules: [{ timeOfDay: '08:00', daysOfWeek: [1, 2, 3, 4, 5, 7] }],
    }),
  );
});

it('adds a second schedule and refuses a day-less one', async () => {
  const onSubmit = jest.fn(async () => undefined);
  await render(<MedicationForm submitLabel="Enregistrer" onSubmit={onSubmit} />);
  await fillRequired();
  await fireEvent.press(screen.getByLabelText('+ Ajouter un horaire'));
  expect(screen.getByText('12:00')).toBeTruthy();
  // Untick every day of the first schedule.
  for (const day of ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']) {
    await fireEvent.press(screen.getAllByLabelText(day)[0]!);
  }
  await fireEvent.press(screen.getByLabelText('Enregistrer'));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('Choisissez au moins un jour de prise.')).toBeTruthy();
});

it('shows the error message when saving fails', async () => {
  const onSubmit = jest.fn(async () => {
    throw new AppError('unknown', 'Stockage plein.');
  });
  await render(<MedicationForm submitLabel="Enregistrer" onSubmit={onSubmit} />);
  await fillRequired();
  await fireEvent.press(screen.getByLabelText('Enregistrer'));
  expect(screen.getByText('Stockage plein.')).toBeTruthy();
});

it('refuses to save a medication without any schedule', async () => {
  const onSubmit = jest.fn(async () => undefined);
  await render(
    <MedicationForm
      submitLabel="Enregistrer"
      onSubmit={onSubmit}
      initial={{
        name: 'Amoxicilline',
        form: 'capsule',
        doseLabel: '1 gélule',
        startsOn: '2026-10-03',
        endsOn: null,
        notes: null,
        schedules: [],
      }}
    />,
  );
  await fireEvent.press(screen.getByLabelText('Enregistrer'));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('Ajoutez au moins un horaire de prise.')).toBeTruthy();
});
