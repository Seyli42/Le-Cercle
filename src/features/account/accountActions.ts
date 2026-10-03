import { FunctionsHttpError } from '@supabase/supabase-js';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { loadCircle } from '@/features/circle/api';
import { cancelAllReminders } from '@/features/reminders/engine';
import { setSyncContext } from '@/features/sync/scheduler';
import { buildExport, wipeLocalData } from '@/features/account/localData';
import type { LocalDb } from '@/lib/db/types';
import { AppError, toAppError } from '@/lib/errors';
import type { AppSupabaseClient } from '@/lib/supabase';

/**
 * Deletes the account on the server first (needs the network), then everything on the
 * phone: reminders, local data, saved preferences. Ends signed out.
 */
export async function deleteAccount(
  client: AppSupabaseClient,
  db: LocalDb,
  userId: string,
): Promise<void> {
  const { error } = await client.functions.invoke('delete-account', { method: 'POST' });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      throw new AppError(
        'unknown',
        'La suppression n’a pas abouti. Réessayez dans quelques minutes.',
        error,
      );
    }
    const appError = toAppError(error);
    throw appError.kind === 'network'
      ? new AppError(
          'network',
          'Une connexion internet est nécessaire pour supprimer le compte.',
          error,
        )
      : appError;
  }
  // The account no longer exists: nothing may be sent or reminded anymore.
  setSyncContext(null);
  await cancelAllReminders().catch(() => undefined);
  await wipeLocalData(db, userId);
  await client.auth.signOut({ scope: 'local' });
}

/** Writes the export to a file and opens the share sheet (email, Drive, Files…). */
export async function exportAccountData(
  client: AppSupabaseClient,
  db: LocalDb,
  account: { readonly id: string; readonly email: string | null },
): Promise<void> {
  // The circle lives on the server: included when online, otherwise explained.
  const circle = await loadCircle(client, account.id)
    .then((data) => ({
      settings: { firstName: data.firstName, delayMinutes: data.delayMinutes },
      members: data.members,
      alerts: data.alerts,
    }))
    .catch(() => 'Non inclus : pas de connexion au moment de l’export.');
  const data = await buildExport(db, account, circle);

  const file = new File(Paths.cache, `le-cercle-mes-donnees-${data.exportedAt.slice(0, 10)}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(data, null, 2));

  if (!(await Sharing.isAvailableAsync())) {
    throw new AppError('unknown', 'Le partage de fichiers n’est pas disponible sur ce téléphone.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Mes données Le Cercle',
  });
}

export const DELETE_CONFIRMATION_WORD = 'SUPPRIMER';
