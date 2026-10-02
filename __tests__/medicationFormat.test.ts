import {
  isValidTimeOfDay,
  parseLocalDate,
  timeOfDayToDate,
  toLocalDateString,
  toTimeOfDay,
} from '@/features/medications/dates';
import { describeDays, describeSchedules, treatmentStatus } from '@/features/medications/format';
import type { Medication } from '@/features/medications/types';

describe('dates', () => {
  it('uses the local calendar day', () => {
    expect(toLocalDateString(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('rejects impossible dates', () => {
    expect(parseLocalDate('2026-02-30')).toBeNull();
    expect(parseLocalDate('2028-02-29')).not.toBeNull();
    expect(parseLocalDate('02/10/2026')).toBeNull();
  });

  it('validates and converts times', () => {
    expect(isValidTimeOfDay('00:00')).toBe(true);
    expect(isValidTimeOfDay('23:59')).toBe(true);
    expect(isValidTimeOfDay('8:00')).toBe(false);
    expect(toTimeOfDay(timeOfDayToDate('07:05'))).toBe('07:05');
  });
});

describe('format', () => {
  it('describes days in French', () => {
    expect(describeDays([1, 2, 3, 4, 5, 6, 7])).toBe('tous les jours');
    expect(describeDays([5, 4, 3, 2, 1])).toBe('du lundi au vendredi');
    expect(describeDays([7, 6])).toBe('le week-end');
    expect(describeDays([1, 3, 5])).toBe('Lun, Mer, Ven');
  });

  it('groups times sharing the same days', () => {
    expect(
      describeSchedules([
        { id: 'b', timeOfDay: '20:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
        { id: 'a', timeOfDay: '08:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
        { id: 'c', timeOfDay: '12:00', daysOfWeek: [1] },
      ]),
    ).toEqual(['08:00, 20:00 · tous les jours', '12:00 · Lun']);
  });

  it('computes the treatment status', () => {
    const med = { startsOn: '2026-10-01', endsOn: '2026-10-10' } as Medication;
    expect(treatmentStatus(med, new Date(2026, 8, 30))).toBe('upcoming');
    expect(treatmentStatus(med, new Date(2026, 9, 10, 22))).toBe('active');
    expect(treatmentStatus(med, new Date(2026, 9, 11))).toBe('ended');
    expect(treatmentStatus({ ...med, endsOn: null }, new Date(2030, 0, 1))).toBe('active');
  });
});
