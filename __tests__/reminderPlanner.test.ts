import type { Medication } from '@/features/medications/types';
import {
  diffSchedule,
  isoWeekday,
  occurrenceKey,
  planReminders,
  upcomingOccurrences,
  type PlannedNotification,
} from '@/features/reminders/planner';

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7] as const;

function med(patch: Partial<Medication> & Pick<Medication, 'id'>): Medication {
  return {
    userId: 'u1',
    name: 'Levothyrox',
    form: 'tablet',
    doseLabel: '1 comprimé',
    startsOn: '2026-01-01',
    endsOn: null,
    notes: null,
    updatedAt: '2026-01-01T00:00:00Z',
    schedules: [{ id: `${patch.id}-s8`, timeOfDay: '08:00', daysOfWeek: [...EVERY_DAY] }],
    ...patch,
  };
}

// Friday 2 October 2026, 10:00 in Paris.
const NOW = new Date(2026, 9, 2, 10, 0);
const local = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min);

describe('upcomingOccurrences', () => {
  it('runs in the Paris time zone', () => {
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-120);
  });

  it('maps JS days to ISO weekdays', () => {
    expect(isoWeekday(local(2026, 10, 5, 12))).toBe(1); // Monday
    expect(isoWeekday(local(2026, 10, 4, 12))).toBe(7); // Sunday
  });

  it('skips today’s past intakes and lists the next ones', () => {
    const list = upcomingOccurrences([med({ id: 'm' })], NOW, local(2026, 10, 4, 23));
    expect(list.map((o) => o.at)).toEqual([local(2026, 10, 3, 8), local(2026, 10, 4, 8)]);
  });

  it('respects the weekdays of each schedule', () => {
    const m = med({
      id: 'm',
      schedules: [{ id: 's', timeOfDay: '09:00', daysOfWeek: [1, 3] }],
    });
    const list = upcomingOccurrences([m], NOW, local(2026, 10, 9, 23));
    expect(list.map((o) => o.at)).toEqual([local(2026, 10, 5, 9), local(2026, 10, 7, 9)]);
  });

  it('respects start and end dates (end date included)', () => {
    const m = med({ id: 'm', startsOn: '2026-10-04', endsOn: '2026-10-05' });
    const list = upcomingOccurrences([m], NOW, local(2026, 10, 10, 23));
    expect(list.map((o) => o.at)).toEqual([local(2026, 10, 4, 8), local(2026, 10, 5, 8)]);
  });

  it('keeps the local hour across the autumn clock change (25 October 2026)', () => {
    const list = upcomingOccurrences(
      [med({ id: 'm' })],
      local(2026, 10, 24, 12),
      local(2026, 10, 26, 23),
    );
    expect(list.map((o) => [o.at.getHours(), o.at.toISOString()])).toEqual([
      [8, '2026-10-25T07:00:00.000Z'], // after the change: UTC+1
      [8, '2026-10-26T07:00:00.000Z'],
    ]);
  });

  it('still reminds on the spring clock change night, an hour later', () => {
    const m = med({
      id: 'm',
      schedules: [{ id: 's', timeOfDay: '02:30', daysOfWeek: [...EVERY_DAY] }],
    });
    const list = upcomingOccurrences([m], local(2027, 3, 27, 12), local(2027, 3, 28, 23));
    expect(list).toHaveLength(1);
    expect(list[0]?.at.getHours()).toBe(3);
  });

  it('sorts intakes of several medications by time', () => {
    const a = med({
      id: 'a',
      name: 'Aspirine',
      schedules: [{ id: 'a1', timeOfDay: '20:00', daysOfWeek: [...EVERY_DAY] }],
    });
    const b = med({ id: 'b', name: 'Bisoprolol' });
    const list = upcomingOccurrences([a, b], NOW, local(2026, 10, 3, 23));
    expect(list.map((o) => o.medicationName)).toEqual(['Aspirine', 'Bisoprolol', 'Aspirine']);
  });
});

describe('planReminders', () => {
  const base = { userId: 'u1', answered: new Set<string>(), now: NOW, budget: 60 };

  it('plans one notification per intake with the medication in clear', () => {
    const plan = planReminders({ ...base, medications: [med({ id: 'm' })], horizonDays: 2 });
    expect(plan.notifications).toHaveLength(2);
    expect(plan.notifications[0]).toMatchObject({
      title: '💊 Levothyrox',
      body: 'C’est l’heure de votre prise de 08:00 : 1 comprimé.',
      data: { kind: 'dose', scheduleId: 'm-s8', scheduledAt: '2026-10-03T06:00:00.000Z' },
    });
    expect(plan.truncated).toBe(false);
  });

  it('never reminds a dose already taken or skipped', () => {
    const answered = new Set([occurrenceKey('m-s8', local(2026, 10, 3, 8))]);
    const plan = planReminders({
      ...base,
      answered,
      medications: [med({ id: 'm' })],
      horizonDays: 2,
    });
    expect(plan.notifications.map((n) => n.at)).toEqual([local(2026, 10, 4, 8)]);
  });

  it('respects the platform limit and adds an "open the app" notification', () => {
    const m = med({
      id: 'm',
      schedules: ['08:00', '12:00', '20:00'].map((t, i) => ({
        id: `s${i}`,
        timeOfDay: t,
        daysOfWeek: [...EVERY_DAY],
      })),
    });
    const plan = planReminders({ ...base, medications: [m], budget: 10 });
    const doses = plan.notifications.filter((n) => n.data.kind === 'dose');
    const safety = plan.notifications.filter((n) => n.data.kind === 'safety');
    expect(doses).toHaveLength(10);
    expect(safety).toHaveLength(1);
    expect(plan.truncated).toBe(true);
    expect(safety[0]!.at.getTime()).toBe(plan.coveredUntil!.getTime() + 60_000);
  });

  it('does not add the safety notification when everything fits', () => {
    const m = med({ id: 'm', endsOn: '2026-10-05' });
    const plan = planReminders({ ...base, medications: [m] });
    expect(plan.notifications.every((n) => n.data.kind === 'dose')).toBe(true);
    expect(plan.coveredUntil).toEqual(local(2026, 10, 5, 8));
  });

  it('changes identifiers when the text changes, so the phone shows the new name', () => {
    const a = planReminders({ ...base, medications: [med({ id: 'm' })], horizonDays: 1 });
    const b = planReminders({
      ...base,
      medications: [med({ id: 'm', name: 'Euthyrox' })],
      horizonDays: 1,
    });
    expect(a.notifications[0]!.identifier).not.toBe(b.notifications[0]!.identifier);
    const c = planReminders({ ...base, medications: [med({ id: 'm' })], horizonDays: 1 });
    expect(a.notifications[0]!.identifier).toBe(c.notifications[0]!.identifier);
  });

  it('plans nothing for an ended treatment', () => {
    const plan = planReminders({ ...base, medications: [med({ id: 'm', endsOn: '2026-10-01' })] });
    expect(plan).toEqual({ notifications: [], coveredUntil: null, truncated: false });
  });
});

describe('diffSchedule', () => {
  const planned = (identifier: string): PlannedNotification => ({
    identifier,
    at: NOW,
    title: '',
    body: '',
    data: { kind: 'safety', userId: 'u1' },
  });
  const context = { finalAnswers: new Set<string>(), activeScheduleIds: new Set(['s1']) };

  it('only schedules what is missing and cancels what is obsolete', () => {
    const result = diffSchedule(
      [planned('dose_a'), planned('dose_b')],
      [
        { identifier: 'dose_a', data: null },
        { identifier: 'dose_old', data: null },
        { identifier: 'someone-else', data: null },
      ],
      context,
    );
    expect(result.toSchedule.map((n) => n.identifier)).toEqual(['dose_b']);
    expect(result.toCancel).toEqual(['dose_old']);
  });

  it('keeps a snooze until its dose is taken/skipped or its schedule removed', () => {
    const snooze = {
      identifier: 'snooze_x',
      data: { kind: 'dose' as const, scheduleId: 's1', scheduledAt: '2026-10-02T06:00:00.000Z' },
    };
    expect(diffSchedule([], [snooze], context).toCancel).toEqual([]);
    expect(
      diffSchedule([], [snooze], {
        ...context,
        finalAnswers: new Set([occurrenceKey('s1', '2026-10-02T06:00:00.000Z')]),
      }).toCancel,
    ).toEqual(['snooze_x']);
    expect(
      diffSchedule([], [snooze], { ...context, activeScheduleIds: new Set() }).toCancel,
    ).toEqual(['snooze_x']);
  });
});
