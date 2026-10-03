import { FunctionsHttpError, type PostgrestError } from '@supabase/supabase-js';

import type { ConsentStatus } from '@/lib/database.types';
import { AppError, DEFAULT_MESSAGES, toAppError } from '@/lib/errors';
import type { AppSupabaseClient } from '@/lib/supabase';

/**
 * The circle lives on the server only: inviting and alerting relatives needs the
 * network anyway (SMS). All calls run with the user's rights (RLS).
 */

export const MAX_MEMBERS = 5;
export const DELAY_CHOICES = [15, 30, 60, 120] as const;

export type CircleMember = {
  readonly id: string;
  readonly firstName: string;
  readonly phone: string;
  readonly consent: ConsentStatus;
  readonly inviteSentAt: string | null;
  readonly invitesSent: number;
  readonly confirmedAt: string | null;
};

export type SentAlert = {
  readonly id: string;
  readonly memberFirstName: string;
  readonly plannedAt: string | null;
  readonly sentAt: string | null;
  readonly status: string;
};

export type CircleData = {
  readonly firstName: string | null;
  readonly delayMinutes: number;
  readonly members: readonly CircleMember[];
  readonly alerts: readonly SentAlert[];
};

const MESSAGES: Readonly<Record<string, string>> = {
  circle_limit_reached: `Un Cercle compte au maximum ${MAX_MEMBERS} proches.`,
  member_not_found: 'Ce proche n’est plus dans votre Cercle.',
  already_confirmed: 'Ce proche a déjà accepté votre invitation.',
  invite_too_soon:
    'Une invitation vient d’être envoyée. Patientez deux minutes avant de recommencer.',
  invite_limit_reached:
    'Trop d’invitations envoyées à ce numéro. Demandez à votre proche de répondre OUI au dernier SMS.',
  first_name_required:
    'Indiquez d’abord votre prénom : il apparaît dans le SMS envoyé à vos proches.',
  sms_failed:
    'Le SMS n’a pas pu être envoyé. Vérifiez le numéro (portable) et réessayez dans quelques minutes.',
  duplicate_phone: 'Ce numéro est déjà dans votre Cercle.',
};

function fromPostgrest(error: PostgrestError): AppError {
  if (error.code === '23505') {
    return new AppError(
      'validation',
      MESSAGES.duplicate_phone ?? DEFAULT_MESSAGES.validation,
      error,
    );
  }
  const known = MESSAGES[error.message];
  if (known) return new AppError('validation', known, error);
  return toAppError(new Error(error.message));
}

async function fromFunction(error: unknown): Promise<AppError> {
  if (error instanceof FunctionsHttpError) {
    const body: unknown = await error.context.json().catch(() => null);
    const code =
      body && typeof body === 'object' && 'error' in body ? String(body.error) : 'unknown';
    const known = MESSAGES[code];
    if (known) return new AppError('validation', known, error);
    return new AppError('unknown', DEFAULT_MESSAGES.unknown, error);
  }
  return toAppError(error);
}

export async function loadCircle(client: AppSupabaseClient, userId: string): Promise<CircleData> {
  const [profile, members, alerts] = await Promise.all([
    client
      .from('profiles')
      .select('first_name, missed_dose_delay_minutes')
      .eq('id', userId)
      .single(),
    client
      .from('circle_members')
      .select(
        'id, first_name, phone_e164, consent_status, invite_sent_at, invites_sent, confirmed_at',
      )
      .is('deleted_at', null)
      .order('created_at'),
    client
      .from('alerts_sent')
      .select('id, circle_member_id, dose_event_id, status, sent_at, created_at')
      .in('status', ['sent', 'delivered', 'failed'])
      .order('created_at', { ascending: false })
      .limit(10),
  ]);
  for (const result of [profile, members, alerts]) {
    if (result.error) throw fromPostgrest(result.error);
  }

  const memberRows = members.data ?? [];
  const alertRows = alerts.data ?? [];
  const eventIds = [...new Set(alertRows.map((a) => a.dose_event_id))];
  const events = eventIds.length
    ? await client.from('dose_events').select('id, scheduled_at').in('id', eventIds)
    : { data: [], error: null };
  if (events.error) throw fromPostgrest(events.error);
  const plannedAt = new Map((events.data ?? []).map((e) => [e.id, e.scheduled_at]));
  const names = new Map(memberRows.map((m) => [m.id, m.first_name]));

  return {
    firstName: profile.data?.first_name ?? null,
    delayMinutes: profile.data?.missed_dose_delay_minutes ?? 30,
    members: memberRows.map((m) => ({
      id: m.id,
      firstName: m.first_name,
      phone: m.phone_e164,
      consent: m.consent_status,
      inviteSentAt: m.invite_sent_at,
      invitesSent: m.invites_sent,
      confirmedAt: m.confirmed_at,
    })),
    alerts: alertRows.map((a) => ({
      id: a.id,
      memberFirstName: names.get(a.circle_member_id) ?? 'Un proche retiré',
      plannedAt: plannedAt.get(a.dose_event_id) ?? null,
      sentAt: a.sent_at,
      status: a.status,
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
    throw new AppError('validation', 'Indiquez votre prénom (50 caractères maximum).');
  }
  const { error } = await client
    .from('profiles')
    .update({ first_name: firstName, missed_dose_delay_minutes: settings.delayMinutes })
    .eq('id', userId);
  if (error) throw fromPostgrest(error);
}

export async function sendInvite(client: AppSupabaseClient, memberId: string): Promise<void> {
  const { error } = await client.functions.invoke('circle-invite', { body: { memberId } });
  if (error) throw await fromFunction(error);
}

/** Adds a relative and sends the invitation SMS. */
export async function addMember(
  client: AppSupabaseClient,
  member: { readonly firstName: string; readonly phone: string },
): Promise<void> {
  const { data, error } = await client
    .from('circle_members')
    .insert({ first_name: member.firstName.trim(), phone_e164: member.phone })
    .select('id')
    .single();
  if (error) throw fromPostgrest(error);
  await sendInvite(client, data.id);
}

export async function removeMember(client: AppSupabaseClient, memberId: string): Promise<void> {
  const { error } = await client
    .from('circle_members')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', memberId);
  if (error) throw fromPostgrest(error);
}
