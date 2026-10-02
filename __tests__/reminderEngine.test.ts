import * as Notifications from 'expo-notifications';

import { createMedication } from '@/features/medications/repository';
import type { MedicationInput } from '@/features/medications/types';
import { listDoseEvents } from '@/features/reminders/doseEvents';
import {
  answerDose,
  cancelAllReminders,
  handleNotificationResponse,
  syncReminders,
  type ResponseLike,
} from '@/features/reminders/engine';
import type { LocalDb } from '@/lib/db/types';

import { createTestDb } from './helpers/nodeDb';

// In-memory stand-in for the phone's notification system.
type Scheduled = { identifier: string; content: { title: string; body: string; data: unknown } };
const mockScheduled = new Map<string, Scheduled & { date: Date }>();
const mockPresented: Scheduled[] = [];

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationCategoryAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({
    granted: true,
    status: 'granted',
    canAskAgain: true,
  })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(
    async (request: {
      identifier: string;
      content: Scheduled['content'];
      trigger: { date: Date };
    }) => {
      mockScheduled.set(request.identifier, { ...request, date: request.trigger.date });
      return request.identifier;
    },
  ),
  getAllScheduledNotificationsAsync: jest.fn(async () =>
    [...mockScheduled.values()].map((n) => ({ identifier: n.identifier, content: n.content })),
  ),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    mockScheduled.delete(id);
  }),
  getPresentedNotificationsAsync: jest.fn(async () =>
    mockPresented.map((n) => ({ request: { identifier: n.identifier, content: n.content } })),
  ),
  dismissNotificationAsync: jest.fn(async (id: string) => {
    const index = mockPresented.findIndex((n) => n.identifier === id);
    if (index >= 0) mockPresented.splice(index, 1);
  }),
  AndroidImportance: { MAX: 5 },
  AndroidNotificationPriority: { MAX: 'max' },
  IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
  PermissionStatus: { DENIED: 'denied' },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }));
jest.mock('@/lib/monitoring', () => ({ reportError: jest.fn((e: unknown) => e) }));

const USER = 'alice';
const input: MedicationInput = {
  name: 'Levothyrox',
  form: 'tablet',
  doseLabel: '1 comprimé',
  startsOn: '2026-01-01',
  endsOn: null,
  notes: null,
  schedules: [{ timeOfDay: '08:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }],
};

let db: LocalDb;
let n = 0;
const deps = { now: () => new Date(), uuid: () => `id-${++n}` };

beforeEach(async () => {
  jest.useFakeTimers({ now: new Date(2026, 9, 2, 10, 0), doNotFake: ['setImmediate', 'nextTick'] });
  mockScheduled.clear();
  mockPresented.length = 0;
  jest.clearAllMocks();
  db = await createTestDb();
});

afterEach(() => jest.useRealTimers());

const doseIds = () => [...mockScheduled.keys()].filter((id) => id.startsWith('dose_'));

it('schedules one reminder per intake for the next 30 days, and is idempotent', async () => {
  await createMedication(db, USER, input, deps);
  const first = await syncReminders(db, USER, { reason: 'test' });
  expect(doseIds()).toHaveLength(30);
  expect(first.nextAt).toEqual(new Date(2026, 9, 3, 8, 0));

  const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.length;
  await syncReminders(db, USER, { reason: 'again' });
  expect((Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.length).toBe(calls);
});

it('cancels the reminder of a dose taken early, so it never rings after', async () => {
  const med = await createMedication(db, USER, input, deps);
  await syncReminders(db, USER, { reason: 'test' });
  const tomorrow = new Date(2026, 9, 3, 8, 0).toISOString();
  await answerDose(db, USER, {
    scheduleId: med.schedules[0]!.id,
    medicationId: med.id,
    scheduledAt: tomorrow,
    status: 'taken',
  });
  const dates = [...mockScheduled.values()].map((s) => s.date.toISOString());
  expect(dates).not.toContain(tomorrow);
  expect(doseIds()).toHaveLength(29);
});

it('handles the notification buttons: taken, snooze, and ignores other accounts', async () => {
  const med = await createMedication(db, USER, input, deps);
  await syncReminders(db, USER, { reason: 'test' });
  const scheduledAt = new Date(2026, 9, 2, 8, 0).toISOString();
  const response = (actionIdentifier: string, userId = USER): ResponseLike => ({
    actionIdentifier,
    notification: {
      request: {
        identifier: `dose_x_${actionIdentifier}_${userId}`,
        content: {
          title: '💊 Levothyrox',
          body: 'C’est l’heure',
          data: {
            kind: 'dose',
            userId,
            scheduleId: med.schedules[0]!.id,
            medicationId: med.id,
            scheduledAt,
          },
        },
      },
    },
  });

  expect(await handleNotificationResponse(db, USER, response('TAKEN', 'bob'))).toBeNull();
  expect(await listDoseEvents(db, USER, new Date(0), new Date(2030, 0))).toEqual([]);

  await handleNotificationResponse(db, USER, response('SNOOZE'));
  const snoozes = [...mockScheduled.values()].filter((s) => s.identifier.startsWith('snooze_'));
  expect(snoozes).toHaveLength(1);
  expect(snoozes[0]!.date).toEqual(new Date(2026, 9, 2, 10, 10));
  expect(snoozes[0]!.content.body).toMatch(/reporté/);

  await handleNotificationResponse(db, USER, response('TAKEN'));
  const events = await listDoseEvents(db, USER, new Date(0), new Date(2030, 0));
  expect(events.map((e) => e.status)).toEqual(['taken']);
  // The snooze is useless once the dose is taken.
  expect([...mockScheduled.keys()].some((id) => id.startsWith('snooze_'))).toBe(false);
});

it('stops every reminder when the medication is deleted or on sign-out', async () => {
  await createMedication(db, USER, input, deps);
  await createMedication(db, USER, { ...input, name: 'Kardégic' }, deps);
  await syncReminders(db, USER, { reason: 'test' });
  expect(doseIds()).toHaveLength(60);
  mockScheduled.set('other-app', {
    identifier: 'other-app',
    content: { title: '', body: '', data: null },
    date: new Date(),
  });
  await cancelAllReminders();
  expect([...mockScheduled.keys()]).toEqual(['other-app']);
});

it('rebuilds everything when forced (Android exact alarms just granted)', async () => {
  await createMedication(db, USER, input, deps);
  await syncReminders(db, USER, { reason: 'test' });
  (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
  await syncReminders(db, USER, { reason: 'test', force: true });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(30);
  expect(doseIds()).toHaveLength(30);
});

it('keeps scheduling the other reminders if one fails', async () => {
  await createMedication(db, USER, input, deps);
  (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(new Error('full'));
  const result = await syncReminders(db, USER, { reason: 'test' });
  expect(result.failures).toBe(1);
  expect(doseIds()).toHaveLength(29);
  // The next refresh fills the gap.
  await syncReminders(db, USER, { reason: 'retry' });
  expect(doseIds()).toHaveLength(30);
});
