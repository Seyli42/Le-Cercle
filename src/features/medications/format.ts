import { toLocalDateString } from '@/features/medications/dates';
import type { Medication, MedicationForm, Schedule, Weekday } from '@/features/medications/types';

export const FORM_LABELS: Readonly<Record<MedicationForm, string>> = {
  tablet: 'Comprimé',
  capsule: 'Gélule',
  liquid: 'Sirop / liquide',
  drops: 'Gouttes',
  injection: 'Injection',
  inhaler: 'Inhalateur',
  patch: 'Patch',
  cream: 'Crème / pommade',
  other: 'Autre',
};

export const WEEKDAY_SHORT: Readonly<Record<Weekday, string>> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mer',
  4: 'Jeu',
  5: 'Ven',
  6: 'Sam',
  7: 'Dim',
};

export const WEEKDAY_LONG: Readonly<Record<Weekday, string>> = {
  1: 'lundi',
  2: 'mardi',
  3: 'mercredi',
  4: 'jeudi',
  5: 'vendredi',
  6: 'samedi',
  7: 'dimanche',
};

export function describeDays(days: readonly Weekday[]): string {
  if (days.length === 7) return 'tous les jours';
  const sorted = [...days].sort();
  if (sorted.join() === '1,2,3,4,5') return 'du lundi au vendredi';
  if (sorted.join() === '6,7') return 'le week-end';
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

/** "08:00, 20:00 · tous les jours" — one line per distinct set of days. */
export function describeSchedules(schedules: readonly Schedule[]): string[] {
  const byDays = new Map<string, { days: readonly Weekday[]; times: string[] }>();
  for (const s of [...schedules].sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay))) {
    const key = [...s.daysOfWeek].sort().join();
    const group = byDays.get(key) ?? { days: s.daysOfWeek, times: [] };
    group.times.push(s.timeOfDay);
    byDays.set(key, group);
  }
  return [...byDays.values()].map((g) => `${g.times.join(', ')} · ${describeDays(g.days)}`);
}

export type TreatmentStatus = 'active' | 'upcoming' | 'ended';

export function treatmentStatus(medication: Medication, today: Date = new Date()): TreatmentStatus {
  const day = toLocalDateString(today);
  if (medication.startsOn > day) return 'upcoming';
  if (medication.endsOn !== null && medication.endsOn < day) return 'ended';
  return 'active';
}
