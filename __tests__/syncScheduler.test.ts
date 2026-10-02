import {
  getSyncState,
  onRemoteChanges,
  requestSync,
  setSyncContext,
  syncNow,
} from '@/features/sync/scheduler';
import { runSync } from '@/features/sync/sync';
import type { LocalDb } from '@/lib/db/types';
import { AppError } from '@/lib/errors';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/monitoring', () => ({ reportError: jest.fn((e: unknown) => e) }));
jest.mock('@/features/sync/supabaseRemote', () => ({ createSupabaseRemote: () => ({}) }));
jest.mock('@/features/sync/sync', () => ({
  runSync: jest.fn(),
  countPending: jest.fn(async () => 0),
  lastSuccessfulSync: jest.fn(async () => null),
}));

const run = runSync as jest.MockedFunction<typeof runSync>;
const db = {} as LocalDb;
const ok = { pushed: 0, rejected: 0, applied: 0 };

beforeEach(() => {
  jest.useFakeTimers();
  run.mockReset();
  setSyncContext({ db, userId: 'alice' });
});

afterEach(() => {
  setSyncContext(null);
  jest.useRealTimers();
});

it('never runs two syncs at once, and replays the request that arrived meanwhile', async () => {
  let release: () => void = () => undefined;
  run.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(ok))));
  run.mockResolvedValue(ok);
  const first = syncNow('a');
  const second = syncNow('b');
  expect(run).toHaveBeenCalledTimes(1);
  release();
  await first;
  await second;
  await jest.runAllTimersAsync();
  expect(run).toHaveBeenCalledTimes(2);
});

it('groups a burst of local changes into a single sync', async () => {
  run.mockResolvedValue(ok);
  requestSync();
  requestSync();
  requestSync();
  await jest.advanceTimersByTimeAsync(3000);
  expect(run).toHaveBeenCalledTimes(1);
});

it('goes offline without throwing, then retries by itself', async () => {
  run.mockRejectedValueOnce(new AppError('network', 'offline'));
  run.mockResolvedValue(ok);
  await expect(syncNow('test')).resolves.toBeNull();
  expect(getSyncState().status).toBe('offline');
  await jest.advanceTimersByTimeAsync(30_000);
  expect(run).toHaveBeenCalledTimes(2);
  expect(getSyncState().status).toBe('idle');
});

it('tells the reminders when another phone changed something', async () => {
  const listener = jest.fn();
  const unsubscribe = onRemoteChanges(listener);
  run.mockResolvedValueOnce({ ...ok, applied: 0 });
  await syncNow('nothing');
  expect(listener).not.toHaveBeenCalled();
  run.mockResolvedValueOnce({ ...ok, applied: 3 });
  await syncNow('changes');
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
});

it('does nothing once signed out', async () => {
  setSyncContext(null);
  await expect(syncNow('after-sign-out')).resolves.toBeNull();
  expect(run).not.toHaveBeenCalled();
});
