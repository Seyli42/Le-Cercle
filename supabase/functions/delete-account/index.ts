/**
 * POST with the user's session → deletes the account for good (GDPR "right to erasure",
 * required by the App Store and Google Play). Every row of every table references
 * auth.users with ON DELETE CASCADE: deleting the user deletes all their data.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { json, requireEnv } from '../_shared/env.ts';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not_authenticated' }, 401);

  const admin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  // The account deleted is always the one of the session, never an id from the body.
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json({ error: 'not_authenticated' }, 401);

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    console.error('delete-account', deleteError.message);
    return json({ error: 'delete_failed' }, 500);
  }
  return json({ ok: true });
});
