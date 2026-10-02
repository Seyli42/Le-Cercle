/**
 * Decides WHEN to synchronise: after local changes (grouped), when the app comes back,
 * when the network returns, and periodically while open. One sync at a time.
 */
import { countPending, lastSuccessfulSync, runSync, type SyncReport } from '@/features/sync/sync';
import { createSupabaseRemote } from '@/features/sync/supabaseRemote';
import type { LocalDb } from '@/lib/db/types';
import { AppError } from '@/lib/errors';
import { reportError } from '@/lib/monitoring';
import { supabase } from '@/lib/supabase';

export type SyncState = {
  readonly status: 'idle' | 'syncing' | 'offline' | 'error';
  readonly pending: number;
  readonly lastSuccessAt: string | null;
};

type Context = { readonly db: LocalDb; readonly userId: string };

const DEBOUNCE_MS = 3000;
const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000];

let context: Context | null = null;
let state: SyncState = { status: 'idle', pending: 0, lastSuccessAt: null };
let running: Promise<SyncReport | null> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

const stateListeners = new Set<(state: SyncState) => void>();
const changeListeners = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  stateListeners.forEach((listener) => listener(state));
}

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSyncState(listener: (state: SyncState) => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/** Called when the server brought changes (another phone): reminders must be redone. */
export function onRemoteChanges(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

async function refreshCounters(): Promise<void> {
  if (!context) return;
  const [pending, lastSuccessAt] = await Promise.all([
    countPending(context.db, context.userId),
    lastSuccessfulSync(context.db, context.userId),
  ]);
  setState({ pending, lastSuccessAt });
}

async function runOnce(ctx: Context): Promise<SyncReport | null> {
  if (!supabase) return null;
  setState({ status: 'syncing' });
  try {
    const report = await runSync(ctx.db, ctx.userId, createSupabaseRemote(supabase), {
      now: () => new Date(),
      onRejected: (table, _id, error) => reportError(error, `sync.rejected.${table}`),
    });
    failures = 0;
    setState({ status: 'idle' });
    if (report.applied > 0) changeListeners.forEach((listener) => listener());
    return report;
  } catch (error) {
    const appError = reportError(error, 'sync.run', {
      expected: error instanceof AppError && (error.kind === 'network' || error.kind === 'auth'),
    });
    setState({ status: appError.kind === 'network' ? 'offline' : 'error' });
    const delay = RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)];
    failures += 1;
    if (retry) clearTimeout(retry);
    retry = setTimeout(() => void syncNow('retry'), delay);
    return null;
  } finally {
    await refreshCounters().catch(() => undefined);
  }
}

/** Starts a sync now (or right after the current one). Never throws. */
export function syncNow(reason: string): Promise<SyncReport | null> {
  const ctx = context;
  if (!ctx) return Promise.resolve(null);
  if (running) {
    again = true;
    return running;
  }
  if (debounce) {
    clearTimeout(debounce);
    debounce = null;
  }
  running = runOnce(ctx).finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow(`${reason}-again`);
    }
  });
  return running;
}

/** After a local change: waits a few seconds so that a burst of edits goes in one sync. */
export function requestSync(): void {
  if (!context) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void syncNow('local-change');
  }, DEBOUNCE_MS);
  void refreshCounters().catch(() => undefined);
}

/** Binds the scheduler to the signed-in user (null on sign-out or app close). */
export function setSyncContext(next: Context | null): void {
  context = next;
  failures = 0;
  for (const timer of [debounce, retry]) if (timer) clearTimeout(timer);
  debounce = null;
  retry = null;
  if (next) void refreshCounters().catch(() => undefined);
  else setState({ status: 'idle', pending: 0, lastSuccessAt: null });
}
