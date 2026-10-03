import { formatDate } from '@/i18n';
/** Local calendar date "YYYY-MM-DD" (not UTC: 23:30 in Paris is still "today"). */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(y, m - 1, d);
  // Rejects impossible dates like 2026-02-30 (JS would roll them over to March).
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? date
    : null;
}

export function isValidTimeOfDay(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function toTimeOfDay(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** A Date today at the given "HH:MM", for the time picker. */
export function timeOfDayToDate(value: string, base: Date = new Date()): Date {
  const [h, m] = value.split(':').map(Number);
  const date = new Date(base);
  date.setHours(h ?? 8, m ?? 0, 0, 0);
  return date;
}

/** "2 octobre 2026", "October 2, 2026"… in the person's language. */
export function formatLocalDate(value: string): string {
  const date = parseLocalDate(value);
  return date ? formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' }) : value;
}
