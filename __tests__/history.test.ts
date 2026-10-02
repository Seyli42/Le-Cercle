import { buildHistory, countHistory } from '@/features/history/history';
import type { Medication } from '@/features/medications/types';
import type { DoseEvent } from '@/features/reminders/doseEvents';

const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);

const med: Medication = {
  id: 'm1',
  userId: 'u',
  name: 'Kardégic',
  form: 'other',
  doseLabel: '1 sachet',
  startsOn: '2026-09-01',
  endsOn: null,
  notes: null,
  updatedAt: '',
  schedules: [
    {
      id: 's8',
      timeOfDay: '08:00',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      createdAt: local(1, 9).toISOString(), // created on 1 Oct at 09:00
    },
  ],
};

const event = (scheduleId: string, at: Date, status: DoseEvent['status']): DoseEvent => ({
  scheduleId,
  medicationId: 'm1',
  scheduledAt: at.toISOString(),
  status,
  respondedAt: new Date(at.getTime() + 5 * 60_000).toISOString(),
});

const labels = new Map([['m1', { name: 'Kardégic', doseLabel: '1 sachet' }]]);

it('lists every planned intake since the schedule exists, newest day first', () => {
  const days = buildHistory({
    medications: [med],
    labels,
    events: [event('s8', local(2, 8), 'taken'), event('s8', local(3, 8), 'skipped')],
    from: local(1, 0),
    now: local(4, 12),
  });
  expect(days.map((d) => d.date)).toEqual(['2026-10-04', '2026-10-03', '2026-10-02']);
  expect(days.map((d) => d.items[0]?.status)).toEqual(['unconfirmed', 'skipped', 'taken']);
});

it('keeps an intake answered on a schedule deleted since', () => {
  const days = buildHistory({
    medications: [],
    labels,
    events: [event('old', local(2, 20), 'taken')],
    from: local(1, 0),
    now: local(4, 12),
  });
  expect(days).toHaveLength(1);
  expect(days[0]?.items[0]).toMatchObject({ medicationName: 'Kardégic', timeOfDay: '20:00' });
});

it('leaves an intake of the last hour in "today" rather than "unconfirmed"', () => {
  const days = buildHistory({
    medications: [med],
    labels,
    events: [],
    from: local(4, 0),
    now: local(4, 8, 30),
  });
  expect(days).toEqual([]);
});

it('counts factually, overall and over a period', () => {
  const days = buildHistory({
    medications: [med],
    labels,
    events: [
      event('s8', local(2, 8), 'taken'),
      event('s8', local(3, 8), 'taken'),
      event('s8', local(4, 8), 'snoozed'),
    ],
    from: local(1, 0),
    now: local(4, 12),
  });
  expect(countHistory(days)).toEqual({ planned: 3, taken: 2, skipped: 0, unconfirmed: 1 });
  expect(countHistory(days, local(3, 0))).toEqual({
    planned: 2,
    taken: 1,
    skipped: 0,
    unconfirmed: 1,
  });
});
