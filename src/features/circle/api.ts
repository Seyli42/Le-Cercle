import type { PostgrestError } from '@supabase/supabase-js';

import { AppError, toAppError } from '@/lib/errors';
import type { AppSupabaseClient } from '@/lib/supabase';
import { t } from '@/i18n';

/**
 * The circle lives on the server only: inviting and alerting relatives needs the
 * network anyway. Relatives are alerted by a notification on their own app (free): the
 * person shares a code, the relative types it in their app. All calls run with the
 * user's rights (RLS + checked functions).
 */

export const MAX_WATCHERS = 5;
export const DELAY_CHOICES = [15, 30, 60, 120] as const;

export type CircleLink = {
  readonly linkId: string;
  readonly firstName: string;
  readonly since: string;
  /** Watching side: last alert received about this person. */
  readonly lastAlertAt: string | null;
};

export type CircleInvite = { readonly code: string; readonly expiresAt: string };

export type SentAlert = {
  readonly id: string;
  readonly plannedAt: string | null;
  readonly sentAt: string | null;
};

export type CircleData = {
  readonly firstName: string | null;
  readonly delayMinutes: number;
  /** Relatives alerted when I do not confirm an intake. */
  readonly watchers: readonly CircleLink[];
  /** People I watch over. */
  readonly watching: readonly CircleLink[];
  readonly invite: CircleInvite | null;
  /** Alerts sent about me (most recent first). */
  readonly alerts: readonly SentAlert[];
};

const SERVER_ERRORS = [
  'first_name_required',
  'circle_full',
  'invite_limit_reached',
  'invalid_code',
  'own_invite',
  'too_many_attempts',
  'link_not_found',
] as const;
type ServerError = (typeof SERVER_ERRORS)[number];
const isServerError = (message: string): message is ServerError =>
  (SERVER_ERRORS as readonly string[]).includes(message);

function fromPostgrest(error: PostgrestError): AppError {
  if (isServerError(error.message)) {
    return new AppError(
      'validation',
      t(`circleErrors.${error.message}`, { max: MAX_WATCHERS }),
      error,
    );
  }
  return toAppError(new Error(error.message));
}

/** "ABCDEFGH" → "ABCD-EFGH" (easier to read aloud or copy). */
export function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Text shared by WhatsApp, SMS from the person's own phone, e-mail… */
export function inviteMessage(patientFirstName: string, code: string): string {
  return t('circle.inviteMessage', { name: patientFirstName, code: formatCode(code) });
}

export async function loadCircle(client: AppSupabaseClient, userId: string): Promise<CircleData> {
  const [profile, links, invite, alerts] = await Promise.all([
    client
      .from('profiles')
      .select('first_name, missed_dose_delay_minutes')
      .eq('id', userId)
      .single(),
    client.rpc('my_circle'),
    client.rpc('my_circle_invite'),
    client
      .from('circle_alerts')
      .select('id, dose_event_id, sent_at')
      .eq('patient_id', userId)
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);
  for (const result of [profile, links, invite, alerts]) {
    if (result.error) throw fromPostgrest(result.error);
  }

  const alertRows = alerts.data ?? [];
  const eventIds = [...new Set(alertRows.map((a) => a.dose_event_id))];
  const events = eventIds.length
    ? await client.from('dose_events').select('id, scheduled_at').in('id', eventIds)
    : { data: [], error: null };
  if (events.error) throw fromPostgrest(events.error);
  const plannedAt = new Map((events.data ?? []).map((e) => [e.id, e.scheduled_at]));

  const toLink = (row: NonNullable<typeof links.data>[number]): CircleLink => ({
    linkId: row.link_id,
    firstName: row.first_name,
    since: row.since,
    lastAlertAt: row.last_alert_at,
  });
  const rows = links.data ?? [];
  const current = invite.data?.[0];
  return {
    firstName: profile.data?.first_name ?? null,
    delayMinutes: profile.data?.missed_dose_delay_minutes ?? 30,
    watchers: rows.filter((r) => r.role === 'watcher').map(toLink),
    watching: rows.filter((r) => r.role === 'patient').map(toLink),
    invite: current ? { code: current.code, expiresAt: current.expires_at } : null,
    alerts: alertRows.map((a) => ({
      id: a.id,
      plannedAt: plannedAt.get(a.dose_event_id) ?? null,
      sentAt: a.sent_at,
    })),
  };
}

export async function saveSettings(
  client: AppSupabaseClient,
  userId: string,
  settings: { readonly firstName: string; readonly delayMinutes: number },
): Promise<void> {
  const firstName = settings.firstName.trim().replace(/\s+/g, ' ');
  if (!firstName || firstName.length > 50) {
    throw new AppError('validation', t('circleErrors.firstNameInvalid'));
  }
  const { error } = await client
    .from('profiles')
    .update({ first_name: firstName, missed_dose_delay_minutes: settings.delayMinutes })
    .eq('id', userId);
  if (error) throw fromPostgrest(error);
}

/** A new code (the previous unused one stops working). */
export async function createInvite(client: AppSupabaseClient): Promise<CircleInvite> {
  const { data, error } = await client.rpc('create_circle_invite');
  if (error) throw fromPostgrest(error);
  const row = data[0];
  if (!row) throw new AppError('unknown', t('circleErrors.codeNotCreated'));
  return { code: row.code, expiresAt: row.expires_at };
}

/** The relative types the code received: returns the first name of the person. */
export async function acceptInvite(client: AppSupabaseClient, code: string): Promise<string> {
  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== 8) {
    throw new AppError('validation', t('circleErrors.codeLength'));
  }
  const { data, error } = await client.rpc('accept_circle_invite', { p_code: cleaned });
  if (error) throw fromPostgrest(error);
  return data[0]?.patient_first_name ?? t('circle.yourRelative');
}

/** Either side ends the link (a relative leaves, or the person removes them). */
export async function leaveLink(client: AppSupabaseClient, linkId: string): Promise<void> {
  const { error } = await client.rpc('revoke_circle_link', { p_link_id: linkId });
  if (error) throw fromPostgrest(error);
}
