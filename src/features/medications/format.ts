import { toLocalDateString } from '@/features/medications/dates';
import type { Medication, MedicationForm, Schedule, Weekday } from '@/features/medications/types';
import { formatTimeOfDay, t } from '@/i18n';

/** A read-only map whose values are read in the current language at each access. */
function translated<K extends string | number>(
  keys: readonly K[],
  text: (key: K) => string,
): Readonly<Record<K, string>> {
  const map = {} as Record<K, string>;
  for (const key of keys) {
    Object.defineProperty(map, key, { get: () => text(key), enumerable: true });
  }
  return map;
}

const FORMS: readonly MedicationForm[] = [
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
const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export const FORM_LABELS = translated(FORMS, (form) => t(`forms.${form}`));
export const WEEKDAY_SHORT = translated(WEEKDAYS, (day) => t(`days.short.${day}`));
export const WEEKDAY_LONG = translated(WEEKDAYS, (day) => t(`days.long.${day}`));

export function describeDays(days: readonly Weekday[]): string {
  if (days.length === 7) return t('days.everyDay');
  const sorted = [...days].sort();
  if (sorted.join() === '1,2,3,4,5') return t('days.weekdays');
  if (sorted.join() === '6,7') return t('days.weekend');
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

/** "08:00, 20:00 · tous les jours" — one line per distinct set of days. */
export function describeSchedules(schedules: readonly Schedule[]): string[] {
  const byDays = new Map<string, { days: readonly Weekday[]; times: string[] }>();
  for (const s of [...schedules].sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay))) {
    const key = [...s.daysOfWeek].sort().join();
    const group = byDays.get(key) ?? { days: s.daysOfWeek, times: [] };
    group.times.push(formatTimeOfDay(s.timeOfDay));
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
