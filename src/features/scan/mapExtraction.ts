import { parseLocalDate, toLocalDateString } from '@/features/medications/dates';
import { ALL_WEEKDAYS, type MedicationInput } from '@/features/medications/types';
import type { ExtractedMedication } from '@/features/scan/types';

/**
 * Turns a transcription into a PRE-FILLED form. The AI never decides times or dates:
 * the few conversions made here are fixed, transparent rules, and each one is listed in
 * `proposals` so the user sees exactly what was guessed and checks it.
 */

/** Usual times for the French words of a prescription. Shown as proposals only. */
const MOMENTS: readonly {
  readonly pattern: RegExp;
  readonly time: string;
  readonly word: string;
}[] = [
  { pattern: /\bmatin(s|ée)?\b/i, time: '08:00', word: 'matin' },
  { pattern: /\bmidi\b|\bd[ée]jeuner\b/i, time: '12:00', word: 'midi' },
  { pattern: /\b(soir|d[îi]ner)\b/i, time: '19:00', word: 'soir' },
  { pattern: /\bcoucher\b/i, time: '22:00', word: 'coucher' },
];

export type MappedMedication = {
  readonly input: MedicationInput;
  /** Human explanations of every value the app proposed (not read as such). */
  readonly proposals: readonly string[];
  /** Fields the user MUST fill in (missing on the document). */
  readonly missing: readonly ('doseLabel' | 'schedules')[];
};

function durationDays(text: string): number | null {
  const match = /(\d{1,3})\s*(jours?|j)\b/i.exec(text);
  if (match) return Number(match[1]);
  const weeks = /(\d{1,2})\s*semaines?\b/i.exec(text);
  return weeks ? Number(weeks[1]) * 7 : null;
}

export function mapExtraction(
  med: ExtractedMedication,
  today: Date = new Date(),
): MappedMedication {
  const proposals: string[] = [];
  const missing: ('doseLabel' | 'schedules')[] = [];

  let times = [...med.timesWritten];
  if (times.length === 0 && med.posologyText) {
    // "petit-déjeuner" is a morning, not a lunch ("déjeuner").
    const wording = med.posologyText.replace(/petit[- ]d[ée]jeuner/gi, 'matin');
    const found = MOMENTS.filter((m) => m.pattern.test(wording));
    times = found.map((m) => m.time);
    if (found.length > 0) {
      proposals.push(
        `Horaires proposés à partir de « ${med.posologyText} » : ${found
          .map((m) => `${m.word} = ${m.time}`)
          .join(', ')}. Ajustez-les à vos habitudes.`,
      );
    }
  }
  if (times.length === 0) missing.push('schedules');
  if (!med.doseLabel) missing.push('doseLabel');

  const startsOn = med.startDate ?? toLocalDateString(today);
  if (!med.startDate)
    proposals.push('Début du traitement : aujourd’hui (non indiqué sur le document).');

  let endsOn = med.endDate;
  const start = parseLocalDate(startsOn);
  if (endsOn && start && endsOn < startsOn) endsOn = null;
  if (!endsOn && start) {
    const days = durationDays(med.durationText || med.posologyText);
    if (days !== null && days > 0 && days <= 366) {
      const end = new Date(start);
      end.setDate(end.getDate() + days - 1);
      endsOn = toLocalDateString(end);
      proposals.push(
        `Fin du traitement calculée à partir de « ${med.durationText || med.posologyText} » : ${days} jour${days > 1 ? 's' : ''}, jour de début inclus.`,
      );
    }
  }

  // The original wording is kept in the notes: the user can always compare.
  const original = [med.posologyText && `Sur le document : « ${med.posologyText} »`, med.notes]
    .filter(Boolean)
    .join('\n')
    .slice(0, 500);

  return {
    input: {
      name: med.name,
      form: med.form,
      doseLabel: med.doseLabel,
      startsOn,
      endsOn,
      notes: original || null,
      schedules: times.map((timeOfDay) => ({ timeOfDay, daysOfWeek: [...ALL_WEEKDAYS] })),
    },
    proposals,
    missing,
  };
}
