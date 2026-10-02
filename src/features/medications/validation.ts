import { isValidTimeOfDay, parseLocalDate } from '@/features/medications/dates';
import type { MedicationForm, MedicationInput, Weekday } from '@/features/medications/types';

export const MEDICATION_FORMS: readonly MedicationForm[] = [
  'tablet',
  'capsule',
  'liquid',
  'drops',
  'injection',
  'inhaler',
  'patch',
  'cream',
  'other',
];

export const LIMITS = {
  name: 100,
  doseLabel: 50,
  notes: 500,
  schedulesPerMedication: 12,
} as const;

export type MedicationField =
  'name' | 'form' | 'doseLabel' | 'startsOn' | 'endsOn' | 'notes' | 'schedules';
export type FieldErrors = Partial<Record<MedicationField, string>>;

export type ValidationResult =
  | { readonly ok: true; readonly value: MedicationInput }
  | { readonly ok: false; readonly errors: FieldErrors };

const isWeekday = (day: number): day is Weekday => Number.isInteger(day) && day >= 1 && day <= 7;

/**
 * Checks what the user typed and returns a cleaned copy. Mirrors the database CHECK
 * constraints so that a saved medication can always be synced to the server.
 * It never judges the medical content (dose, frequency): that is the user's prescription.
 */
export function validateMedicationInput(input: MedicationInput): ValidationResult {
  const errors: FieldErrors = {};
  const name = input.name.trim().replace(/\s+/g, ' ');
  const doseLabel = input.doseLabel.trim().replace(/\s+/g, ' ');
  const notes = input.notes?.trim() ? input.notes.trim() : null;

  if (!name) errors.name = 'Indiquez le nom du médicament.';
  else if (name.length > LIMITS.name) errors.name = `${LIMITS.name} caractères maximum.`;

  if (!MEDICATION_FORMS.includes(input.form)) errors.form = 'Choisissez une forme.';

  if (!doseLabel) errors.doseLabel = 'Indiquez la quantité par prise, par exemple « 1 comprimé ».';
  else if (doseLabel.length > LIMITS.doseLabel)
    errors.doseLabel = `${LIMITS.doseLabel} caractères maximum.`;

  const startsOn = parseLocalDate(input.startsOn);
  if (!startsOn) errors.startsOn = 'Date de début invalide.';
  if (input.endsOn !== null) {
    const endsOn = parseLocalDate(input.endsOn);
    if (!endsOn) errors.endsOn = 'Date de fin invalide.';
    else if (startsOn && endsOn < startsOn)
      errors.endsOn = 'La date de fin doit être après la date de début.';
  }

  if (notes && notes.length > LIMITS.notes) errors.notes = `${LIMITS.notes} caractères maximum.`;

  const times = input.schedules.map((s) => s.timeOfDay);
  if (input.schedules.length === 0) {
    errors.schedules = 'Ajoutez au moins un horaire de prise.';
  } else if (input.schedules.length > LIMITS.schedulesPerMedication) {
    errors.schedules = `${LIMITS.schedulesPerMedication} horaires maximum.`;
  } else if (!times.every(isValidTimeOfDay)) {
    errors.schedules = 'Un horaire est invalide.';
  } else if (new Set(times).size !== times.length) {
    errors.schedules = 'Le même horaire apparaît deux fois.';
  } else if (
    !input.schedules.every((s) => s.daysOfWeek.length > 0 && s.daysOfWeek.every(isWeekday))
  ) {
    errors.schedules = 'Choisissez au moins un jour de prise.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      form: input.form,
      doseLabel,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      notes,
      schedules: [...input.schedules]
        .map((s) => ({ timeOfDay: s.timeOfDay, daysOfWeek: [...new Set(s.daysOfWeek)].sort() }))
        .sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay)),
    },
  };
}
