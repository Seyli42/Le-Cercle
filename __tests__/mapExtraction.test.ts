import { mapExtraction } from '@/features/scan/mapExtraction';
import type { ExtractedMedication } from '@/features/scan/types';

const base: ExtractedMedication = {
  name: 'Amoxicilline 1 g',
  form: 'capsule',
  doseLabel: '1 gélule',
  posologyText: '',
  timesWritten: [],
  durationText: '',
  startDate: null,
  endDate: null,
  notes: '',
  legibility: 'clear',
};
const today = new Date(2026, 9, 3);

it('keeps the clock times written on the document as they are', () => {
  const result = mapExtraction({ ...base, timesWritten: ['08:00', '20:00'] }, today);
  expect(result.input.schedules.map((s) => s.timeOfDay)).toEqual(['08:00', '20:00']);
  expect(result.proposals.some((p) => p.includes('Horaires proposés'))).toBe(false);
});

it('proposes usual times for "matin et soir", and says so', () => {
  const result = mapExtraction({ ...base, posologyText: '1 matin et soir pendant 7 jours' }, today);
  expect(result.input.schedules.map((s) => s.timeOfDay)).toEqual(['08:00', '19:00']);
  expect(result.proposals[0]).toMatch(/matin = 08:00, soir = 19:00/);
  expect(result.input.notes).toBe('Sur le document : « 1 matin et soir pendant 7 jours »');
});

it('computes the end date from a duration, start day included', () => {
  const result = mapExtraction(
    { ...base, posologyText: '1 matin', durationText: '7 jours' },
    today,
  );
  expect(result.input.startsOn).toBe('2026-10-03');
  expect(result.input.endsOn).toBe('2026-10-09');
  expect(result.proposals.join(' ')).toMatch(/7 jours, jour de début inclus/);
  expect(mapExtraction({ ...base, durationText: '2 semaines' }, today).input.endsOn).toBe(
    '2026-10-16',
  );
});

it('keeps written dates and ignores an end date before the start', () => {
  const written = mapExtraction({ ...base, startDate: '2026-10-05', endDate: '2026-10-12' }, today);
  expect([written.input.startsOn, written.input.endsOn]).toEqual(['2026-10-05', '2026-10-12']);
  const wrong = mapExtraction({ ...base, startDate: '2026-10-05', endDate: '2026-10-01' }, today);
  expect(wrong.input.endsOn).toBeNull();
});

it('never invents a dose or a schedule: the user must fill them in', () => {
  const result = mapExtraction({ ...base, doseLabel: '', posologyText: '3 fois par jour' }, today);
  expect(result.input.schedules).toEqual([]);
  expect(result.missing).toEqual(['schedules', 'doseLabel']);
});

it('reads "petit-déjeuner" as a morning, not as lunch', () => {
  const result = mapExtraction(
    { ...base, posologyText: '1 au petit-déjeuner et 1 au dîner' },
    today,
  );
  expect(result.input.schedules.map((s) => s.timeOfDay)).toEqual(['08:00', '19:00']);
});
