import type { MedicationInput } from '@/features/medications/types';
import { validateMedicationInput } from '@/features/medications/validation';

const valid: MedicationInput = {
  name: '  Doliprane   1000  ',
  form: 'tablet',
  doseLabel: ' 1 comprimé ',
  startsOn: '2026-10-02',
  endsOn: null,
  notes: '   ',
  schedules: [
    { timeOfDay: '20:00', daysOfWeek: [7, 1, 1] },
    { timeOfDay: '08:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
  ],
};

describe('validateMedicationInput', () => {
  it('cleans a valid input', () => {
    const result = validateMedicationInput(valid);
    if (!result.ok) throw new Error('expected valid');
    expect(result.value.name).toBe('Doliprane 1000');
    expect(result.value.doseLabel).toBe('1 comprimé');
    expect(result.value.notes).toBeNull();
    expect(result.value.schedules.map((s) => s.timeOfDay)).toEqual(['08:00', '20:00']);
    expect(result.value.schedules[1]?.daysOfWeek).toEqual([1, 7]);
  });

  it.each<[string, Partial<MedicationInput>, string]>([
    ['empty name', { name: ' ' }, 'name'],
    ['long name', { name: 'x'.repeat(101) }, 'name'],
    ['empty dose', { doseLabel: '' }, 'doseLabel'],
    ['impossible date', { startsOn: '2026-02-30' }, 'startsOn'],
    ['end before start', { endsOn: '2026-10-01' }, 'endsOn'],
    ['long notes', { notes: 'x'.repeat(501) }, 'notes'],
    ['no schedule', { schedules: [] }, 'schedules'],
    ['bad time', { schedules: [{ timeOfDay: '24:00', daysOfWeek: [1] }] }, 'schedules'],
    [
      'duplicate time',
      {
        schedules: [
          { timeOfDay: '08:00', daysOfWeek: [1] },
          { timeOfDay: '08:00', daysOfWeek: [2] },
        ],
      },
      'schedules',
    ],
    ['no day', { schedules: [{ timeOfDay: '08:00', daysOfWeek: [] }] }, 'schedules'],
  ])('rejects %s', (_, patch, field) => {
    const result = validateMedicationInput({ ...valid, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual([field]);
  });

  it('accepts an end date equal to the start date', () => {
    expect(validateMedicationInput({ ...valid, endsOn: '2026-10-02' }).ok).toBe(true);
  });
});
