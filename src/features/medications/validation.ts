import { isValidTimeOfDay, parseLocalDate } from '@/features/medications/dates';
import { t } from '@/i18n';
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

  if (!name) errors.name = t('validation.nameRequired');
  else if (name.length > LIMITS.name) errors.name = t('validation.maxChars', { max: LIMITS.name });

  if (!MEDICATION_FORMS.includes(input.form)) errors.form = t('validation.formRequired');

  if (!doseLabel) errors.doseLabel = t('validation.doseRequired');
  else if (doseLabel.length > LIMITS.doseLabel)
    errors.doseLabel = t('validation.maxChars', { max: LIMITS.doseLabel });

  const startsOn = parseLocalDate(input.startsOn);
  if (!startsOn) errors.startsOn = t('validation.startInvalid');
  if (input.endsOn !== null) {
    const endsOn = parseLocalDate(input.endsOn);
    if (!endsOn) errors.endsOn = t('validation.endInvalid');
    else if (startsOn && endsOn < startsOn) errors.endsOn = t('validation.endBeforeStart');
  }

  if (notes && notes.length > LIMITS.notes)
    errors.notes = t('validation.maxChars', { max: LIMITS.notes });

  const times = input.schedules.map((s) => s.timeOfDay);
  if (input.schedules.length === 0) {
    errors.schedules = t('validation.scheduleRequired');
  } else if (input.schedules.length > LIMITS.schedulesPerMedication) {
    errors.schedules = t('validation.maxSchedules', { max: LIMITS.schedulesPerMedication });
  } else if (!times.every(isValidTimeOfDay)) {
    errors.schedules = t('validation.scheduleInvalid');
  } else if (new Set(times).size !== times.length) {
    errors.schedules = t('validation.scheduleDuplicate');
  } else if (
    !input.schedules.every((s) => s.daysOfWeek.length > 0 && s.daysOfWeek.every(isWeekday))
  ) {
    errors.schedules = t('validation.dayRequired');
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
