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
  /** Language of each relative's phone (push_tokens.locale). Missing: English. */
  readonly localeOf?: (token: string) => string | null | undefined;
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

type AlertWords = {
  /** Used when the person left their first name empty. */
  someone: string;
  title: (name: string) => string;
  planned: (time: string) => string;
  lastSeen: (time: string) => string;
  advice: string;
};

/**
 * Same languages as the app (src/i18n/locales). Wording reviewed with the app texts
 * "circle.exampleTitle" / "circle.exampleBody": keep them in sync.
 */
export const ALERT_WORDS = {
  fr: {
    someone: 'Votre proche',
    title: (n) => `${n} n’a pas confirmé sa prise`,
    planned: (t) => `Prise prévue à ${t}.`,
    lastSeen: (t) => `Son téléphone s’est connecté pour la dernière fois à ${t}.`,
    advice:
      'Il peut s’agir d’un oubli ou d’un souci de téléphone : pensez à prendre de ses nouvelles.',
  },
  en: {
    someone: 'Your loved one',
    title: (n) => `${n} hasn’t confirmed their dose`,
    planned: (t) => `Dose planned at ${t}.`,
    lastSeen: (t) => `Their phone was last online at ${t}.`,
    advice: 'It may be a slip or a phone problem: it may be worth checking in on them.',
  },
  es: {
    someone: 'Tu ser querido',
    title: (n) => `${n} no ha confirmado su toma`,
    planned: (t) => `Toma prevista a las ${t}.`,
    lastSeen: (t) => `Su teléfono se conectó por última vez a las ${t}.`,
    advice:
      'Puede ser un olvido o un problema con el teléfono: quizá convenga preguntarle cómo está.',
  },
  pt: {
    someone: 'O seu próximo',
    title: (n) => `${n} não confirmou a toma`,
    planned: (t) => `Toma prevista às ${t}.`,
    lastSeen: (t) => `O telemóvel ligou-se pela última vez às ${t}.`,
    advice:
      'Pode ser um esquecimento ou um problema de telemóvel: talvez valha a pena saber como está.',
  },
  zh: {
    someone: '您的亲友',
    title: (n) => `${n} 尚未确认服药`,
    planned: (t) => `计划服药时间为 ${t}。`,
    lastSeen: (t) => `其手机最后一次联网时间为 ${t}。`,
    advice: '可能是忘记了，也可能是手机出了问题：不妨问候一下。',
  },
  ja: {
    someone: 'あなたの大切な人',
    title: (n) => `${n} さんが服用を確認していません`,
    planned: (t) => `予定の服用時刻は ${t} です。`,
    lastSeen: (t) => `スマートフォンの最終接続は ${t} です。`,
    advice:
      '飲み忘れかスマートフォンの不具合かもしれません。様子を聞いてみるとよいかもしれません。',
  },
  ru: {
    someone: 'Ваш близкий',
    title: (n) => `${n} не подтвердил(а) приём`,
    planned: (t) => `Приём был запланирован на ${t}.`,
    lastSeen: (t) => `Последний раз телефон был в сети в ${t}.`,
    advice: 'Возможно, это забывчивость или проблема с телефоном: стоит узнать, как дела.',
  },
  ar: {
    someone: 'شخصك العزيز',
    title: (n) => `${n} لم يؤكّد جرعته`,
    planned: (t) => `الجرعة كانت مقررة الساعة ${t}.`,
    lastSeen: (t) => `آخر اتصال لهاتفه كان الساعة ${t}.`,
    advice: 'قد يكون نسيانًا أو مشكلة في الهاتف: ربما من الجيد الاطمئنان عليه.',
  },
  hi: {
    someone: 'आपके अपने',
    title: (n) => `${n} ने अपनी खुराक की पुष्टि नहीं की`,
    planned: (t) => `खुराक ${t} बजे तय थी।`,
    lastSeen: (t) => `उनका फ़ोन आखिरी बार ${t} बजे ऑनलाइन था।`,
    advice: 'शायद भूल गए हों या फ़ोन में कोई समस्या हो: हाल-चाल पूछ लेना अच्छा रहेगा।',
  },
  id: {
    someone: 'Orang terdekat Anda',
    title: (n) => `${n} belum mengonfirmasi minum obat`,
    planned: (t) => `Jadwal minum pukul ${t}.`,
    lastSeen: (t) => `Ponselnya terakhir online pukul ${t}.`,
    advice: 'Mungkin lupa atau ada masalah ponsel: mungkin ada baiknya menanyakan kabarnya.',
  },
  ms: {
    someone: 'Orang tersayang anda',
    title: (n) => `${n} belum mengesahkan pengambilan ubat`,
    planned: (t) => `Pengambilan dijadualkan pukul ${t}.`,
    lastSeen: (t) => `Telefonnya kali terakhir dalam talian pukul ${t}.`,
    advice: 'Mungkin terlupa atau masalah telefon: mungkin wajar bertanya khabar.',
  },
} satisfies Record<string, AlertWords>;

export type AlertLanguage = keyof typeof ALERT_WORDS;

/** "pt-BR", "PT" or "pt" → "pt"; anything unknown → English. */
export function alertLanguage(locale: string | null | undefined): AlertLanguage {
  const code = (locale ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return Object.hasOwn(ALERT_WORDS, code) ? (code as AlertLanguage) : 'en';
}

export function alertText(
  alert: Pick<AlertToSend, 'patientFirstName' | 'plannedLocalTime' | 'lastSeenLocalTime'>,
  locale: string | null | undefined = 'fr',
) {
  const words: AlertWords = ALERT_WORDS[alertLanguage(locale)];
  const name = alert.patientFirstName.trim().slice(0, 30) || words.someone;
  const parts = [
    words.planned(alert.plannedLocalTime),
    alert.lastSeenLocalTime ? words.lastSeen(alert.lastSeenLocalTime) : null,
    words.advice,
  ];
  return { title: words.title(name), body: parts.filter(Boolean).join(' ') };
}

export function buildMessages(alert: AlertToSend): PushMessage[] {
  return alert.tokens.map((to) => {
    // Each relative reads the alert in the language of their own phone.
    const { title, body } = alertText(alert, alert.localeOf?.(to) ?? 'en');
    return {
      to,
      title,
      body,
      sound: 'default',
      priority: 'high',
      channelId: ALERT_CHANNEL,
      data: { type: 'circle_alert', alertId: alert.alertId },
    };
  });
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
