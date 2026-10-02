import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { useUserId } from '@/features/auth/useUserId';
import {
  createMedication,
  deleteMedication,
  getMedication,
  listMedications,
  updateMedication,
  type RepositoryDeps,
} from '@/features/medications/repository';
import type { Medication, MedicationInput } from '@/features/medications/types';
import { useReminders } from '@/features/reminders/ReminderProvider';
import { requestSync } from '@/features/sync/scheduler';
import { useDb } from '@/lib/db/DatabaseProvider';
import type { AppError } from '@/lib/errors';
import { reportError } from '@/lib/monitoring';

const deps: RepositoryDeps = { now: () => new Date(), uuid: () => Crypto.randomUUID() };

type Loadable<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'error'; readonly error: AppError };

/** Reloads every time the screen comes back into view (e.g. after saving a form). */
function useFocusedQuery<T>(query: () => Promise<T>, context: string) {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });

  const load = useCallback(() => {
    let active = true;
    query()
      .then((data) => active && setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', error: reportError(error, context) });
      });
    return () => {
      active = false;
    };
  }, [query, context]);

  useFocusEffect(load);
  return { state, reload: load };
}

export function useMedicationList() {
  const db = useDb();
  const userId = useUserId();
  const query = useCallback(() => listMedications(db, userId), [db, userId]);
  return useFocusedQuery(query, 'medications.list');
}

export function useMedication(id: string | undefined) {
  const db = useDb();
  const userId = useUserId();
  const query = useCallback(
    async () => (id ? getMedication(db, userId, id) : null),
    [db, userId, id],
  );
  return useFocusedQuery(query, 'medications.get');
}

/** Write operations. They throw an AppError (or MedicationValidationError) on failure. */
export function useMedicationActions() {
  const db = useDb();
  const userId = useUserId();
  const { afterMedicationChange } = useReminders();
  return useMemo(() => {
    // Reminders are refreshed after every change; a refresh failure never cancels the save
    // (it is reported, and the next app opening retries).
    const thenSync = async <T>(write: Promise<T>): Promise<T> => {
      const result = await write;
      requestSync();
      await afterMedicationChange().catch(() => undefined);
      return result;
    };
    return {
      create: (input: MedicationInput): Promise<Medication> =>
        thenSync(createMedication(db, userId, input, deps)),
      update: (id: string, input: MedicationInput): Promise<Medication> =>
        thenSync(updateMedication(db, userId, id, input, deps)),
      remove: (id: string): Promise<void> => thenSync(deleteMedication(db, userId, id, deps)),
    };
  }, [db, userId, afterMedicationChange]);
}
