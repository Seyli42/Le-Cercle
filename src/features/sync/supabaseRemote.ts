import type { PostgrestError } from '@supabase/supabase-js';

import type { Cursors, PullPage, PushBatch, SyncRemote } from '@/features/sync/sync';
import type { Json } from '@/lib/database.types';
import { AppError, DEFAULT_MESSAGES, toAppError } from '@/lib/errors';
import type { AppSupabaseClient } from '@/lib/supabase';

const AUTH_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);

/** Network and session problems are transient; anything else means a refused row. */
function toSyncError(error: PostgrestError): AppError {
  if (AUTH_CODES.has(error.code)) return new AppError('auth', DEFAULT_MESSAGES.auth, error);
  const asNetwork = toAppError(new Error(error.message));
  if (asNetwork.kind === 'network' || error.code === '') {
    return new AppError('network', DEFAULT_MESSAGES.network, error);
  }
  return new AppError('unknown', DEFAULT_MESSAGES.unknown, error);
}

function isPullPage(value: unknown): value is PullPage {
  if (!value || typeof value !== 'object') return false;
  const page = value as Record<string, unknown>;
  return (
    Array.isArray(page.medications) &&
    Array.isArray(page.schedules) &&
    Array.isArray(page.dose_events) &&
    typeof page.limit === 'number'
  );
}

/** Plain JSON copy (the rows only contain strings, numbers, arrays and null). */
const asJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;

export function createSupabaseRemote(client: AppSupabaseClient): SyncRemote {
  return {
    async push(batch: PushBatch) {
      const { error } = await client.rpc('sync_push', {
        p_medications: asJson(batch.medications ?? []),
        p_schedules: asJson(batch.schedules ?? []),
        p_dose_events: asJson(batch.dose_events ?? []),
      });
      if (error) throw toSyncError(error);
    },
    async pull(cursors: Cursors, limit: number) {
      const { data, error } = await client.rpc('sync_pull', {
        p_cursors: asJson(cursors),
        p_limit: limit,
      });
      if (error) throw toSyncError(error);
      if (!isPullPage(data)) throw new AppError('unknown', DEFAULT_MESSAGES.unknown);
      return data;
    },
  };
}
