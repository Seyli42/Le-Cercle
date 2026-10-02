import type { Medication } from '@/features/medications/types';
import type { DoseEvent } from '@/features/reminders/doseEvents';
import { buildTodayDoses } from '@/features/reminders/today';

const med: Medication = {
  id: 'm',
  userId: 'u',
  name: 'Kardégic',
  form: 'other',
  doseLabel: '1 sachet',
  startsOn: '2026-01-01',
  endsOn: null,
  notes: null,
  updatedAt: '',
  schedules: ['08:00', '12:00', '13:30', '20:00'].map((t) => ({
    id: `s${t}`,
    timeOfDay: t,
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  })),
};

const at = (h: number, m = 0) => new Date(2026, 9, 2, h, m);
const event = (time: string, h: number, status: DoseEvent['status']): DoseEvent => ({
  scheduleId: `s${time}`,
  medicationId: 'm',
  scheduledAt: at(h).toISOString(),
  status,
  respondedAt: at(h, 5).toISOString(),
});

it('gives every intake of the day its status', () => {
  const doses = buildTodayDoses([med], [event('08:00', 8, 'taken')], at(12, 30));
  expect(doses.map((d) => [d.occurrence.timeOfDay, d.status, d.canAnswer])).toEqual([
    ['08:00', 'taken', false],
    ['12:00', 'due', true],
    ['13:30', 'upcoming', true], // within 2 h: can be marked taken early
    ['20:00', 'upcoming', false],
  ]);
});

it('marks an unanswered intake as late after one hour', () => {
  const doses = buildTodayDoses([med], [], at(9, 30));
  expect(doses[0]).toMatchObject({ status: 'late', canAnswer: true });
});

it('keeps a snoozed intake answerable', () => {
  const doses = buildTodayDoses([med], [event('08:00', 8, 'snoozed')], at(8, 6));
  expect(doses[0]).toMatchObject({ status: 'snoozed', canAnswer: true });
});

it('includes the intake at midnight and treats "undone" answers as unanswered', () => {
  const midnight: Medication = {
    ...med,
    schedules: [{ id: 's00', timeOfDay: '00:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }],
  };
  const undone: DoseEvent = { ...event('00', 0, 'pending'), scheduleId: 's00' };
  const doses = buildTodayDoses([midnight], [undone], at(0, 10));
  expect(doses).toHaveLength(1);
  expect(doses[0]).toMatchObject({ status: 'due', respondedAt: null });
});
