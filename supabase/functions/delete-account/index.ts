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
  await deleteRevenueCatCustomer(data.user.id);
  return json({ ok: true });
});

/**
 * The purchase history kept by RevenueCat (customer id = user id) is erased too. Best
 * effort: the account is already gone, a failure is logged for a manual cleanup. It does
 * NOT cancel a running store subscription (only the person can, in the store settings).
 */
async function deleteRevenueCatCustomer(userId: string): Promise<void> {
  const secret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!secret) return;
  try {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${secret}` } },
    );
    // 404: never bought anything, nothing to delete.
    if (!response.ok && response.status !== 404) {
      console.error('delete-account revenuecat', response.status, userId);
    }
  } catch (error) {
    console.error('delete-account revenuecat', String(error), userId);
  }
}
