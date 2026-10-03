/**
 * Alerts to the relatives' phones through the Expo push service (free; it relays to
 * Apple and Google). Pure functions, the network call is injected: tested in push_test.ts.
 *
 * Alerts never contain the medication name (medical secrecy): only the first name of the
 * person and the planned time.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Android channel created by the app (src/features/reminders/notifications.ts). */
export const ALERT_CHANNEL = 'circle-alerts';

export type AlertToSend = {
  readonly alertId: string;
  readonly patientFirstName: string;
  readonly plannedLocalTime: string;
  /** Last contact of the person's phone, already formatted ("07:45"), or null. */
  readonly lastSeenLocalTime: string | null;
  readonly tokens: readonly string[];
};

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: string;
  data: { type: 'circle_alert'; alertId: string };
};

export function alertText(
  alert: Pick<AlertToSend, 'patientFirstName' | 'plannedLocalTime' | 'lastSeenLocalTime'>,
) {
  const name = alert.patientFirstName.trim().slice(0, 30) || 'Votre proche';
  const lastSeen = alert.lastSeenLocalTime
    ? ` Son téléphone s’est connecté pour la dernière fois à ${alert.lastSeenLocalTime}.`
    : '';
  return {
    title: `${name} n’a pas confirmé sa prise`,
    body:
      `Prise prévue à ${alert.plannedLocalTime}.${lastSeen} ` +
      'Il peut s’agir d’un oubli ou d’un souci de téléphone : pensez à prendre de ses nouvelles.',
  };
}

export function buildMessages(alert: AlertToSend): PushMessage[] {
  const { title, body } = alertText(alert);
  return alert.tokens.map((to) => ({
    to,
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId: ALERT_CHANNEL,
    data: { type: 'circle_alert', alertId: alert.alertId },
  }));
}

/** One "ticket" per message, in the same order (Expo push API). */
export type PushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

export type SendOutcome = {
  /** At least one phone received the alert. */
  readonly ok: boolean;
  /** Phones uninstalled / signed out at Apple or Google: to forget. */
  readonly deadTokens: string[];
  readonly errorCode: string | null;
};

export function interpretTickets(
  messages: readonly PushMessage[],
  tickets: readonly PushTicket[],
): SendOutcome {
  const deadTokens: string[] = [];
  let ok = false;
  let errorCode: string | null = null;
  messages.forEach((message, index) => {
    const ticket = tickets[index];
    if (ticket?.status === 'ok') {
      ok = true;
      return;
    }
    const code = ticket?.details?.error ?? 'no_ticket';
    if (code === 'DeviceNotRegistered') deadTokens.push(message.to);
    errorCode ??= code;
  });
  if (messages.length === 0) errorCode = 'no_device';
  return { ok, deadTokens, errorCode: ok ? null : errorCode };
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Sends the messages (at most 100 per request, per Expo's limit). */
export async function sendPush(
  messages: readonly PushMessage[],
  options: { fetch?: Fetch; accessToken?: string | undefined } = {},
): Promise<PushTicket[]> {
  const doFetch = options.fetch ?? fetch;
  const tickets: PushTicket[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const response = await doFetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: JSON.stringify(batch),
      });
      const payload = (await response.json().catch(() => null)) as { data?: PushTicket[] } | null;
      const data = response.ok && Array.isArray(payload?.data) ? payload.data : null;
      tickets.push(
        ...batch.map(
          (_, j): PushTicket =>
            data?.[j] ?? { status: 'error', details: { error: `http_${response.status}` } },
        ),
      );
    } catch {
      // Network error: these alerts are retried by the next run (3 attempts max).
      tickets.push(
        ...batch.map((): PushTicket => ({ status: 'error', details: { error: 'network' } })),
      );
    }
  }
  return tickets;
}
