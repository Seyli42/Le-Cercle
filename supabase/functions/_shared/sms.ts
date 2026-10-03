/**
 * SMS texts and parsing of the relatives' answers. Pure functions (no Deno API), unit
 * tested in sms_test.ts.
 *
 * Texts use only the GSM-7 alphabet (no ê, â, î, ô, û, ç, œ, ’): a GSM-7 SMS holds 160
 * characters, against 70 when a single other character forces Unicode, which would
 * double or triple the cost of every alert.
 */

// GSM 03.38 basic character set (and the extension table characters we allow).
const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

export function isGsm7(text: string): boolean {
  return [...text].every((char) => GSM7.includes(char));
}

/** Replaces the characters that would force Unicode by close GSM-7 ones. */
export function toGsm7(text: string): string {
  const map: Record<string, string> = {
    ê: 'e',
    ë: 'e',
    â: 'a',
    ä: 'a',
    î: 'i',
    ï: 'i',
    ô: 'o',
    û: 'u',
    ç: 'c',
    œ: 'oe',
    Œ: 'OE',
    À: 'A',
    Â: 'A',
    È: 'E',
    Ê: 'E',
    Î: 'I',
    Ô: 'O',
    Û: 'U',
    Ù: 'U',
    '’': "'",
    '‘': "'",
    '«': '"',
    '»': '"',
    '–': '-',
    '—': '-',
    '…': '...',
    ' ': ' ',
  };
  return [...text].map((char) => (GSM7.includes(char) ? char : (map[char] ?? '?'))).join('');
}

const clean = (name: string) => toGsm7(name.trim()).slice(0, 30);

export function inviteMessage(input: {
  memberFirstName: string;
  patientFirstName: string;
  code: string;
}): string {
  return (
    `Bonjour ${clean(input.memberFirstName)}, ${clean(input.patientFirstName)} souhaite vous ` +
    `ajouter a son Cercle : vous serez prevenu(e) par SMS si une prise de medicament n'est ` +
    `pas confirmee. Repondez OUI ${input.code} pour accepter, STOP pour refuser.`
  );
}

export function alertMessage(input: {
  memberFirstName: string;
  patientFirstName: string;
  plannedLocalTime: string;
  /** Last contact of the person's phone, already formatted ("07:45"), or null. */
  lastSeenLocalTime: string | null;
}): string {
  const patient = clean(input.patientFirstName);
  const lastSeen = input.lastSeenLocalTime
    ? ` Son telephone s'est connecte pour la derniere fois a ${input.lastSeenLocalTime}.`
    : '';
  return (
    `Le Cercle : ${patient} n'a pas confirme sa prise de ${input.plannedLocalTime}.${lastSeen} ` +
    `Il peut s'agir d'un oubli ou d'un souci de telephone : pensez a prendre de ses nouvelles.`
  );
}

export const REPLIES = {
  confirmed:
    'Merci ! Vous faites maintenant partie du Cercle. Repondez STOP a tout moment pour ne plus recevoir de messages.',
  codeRequired:
    'Plusieurs invitations sont en attente pour ce numero : repondez OUI suivi du code recu (ex. OUI 1234).',
  wrongCode: 'Ce code ne correspond a aucune invitation. Verifiez le code et reessayez.',
  noInvite: "Aucune invitation en attente pour ce numero. Le Cercle ne vous enverra pas d'alerte.",
  unknown: 'Repondez OUI suivi du code pour accepter, ou STOP pour ne plus recevoir de messages.',
} as const;

export type Reply =
  | { readonly kind: 'yes'; readonly code: string | null }
  | { readonly kind: 'stop' }
  | { readonly kind: 'unknown' };

/** Understands "oui", "OUI 1234", "Oui, 1234 !", "STOP", "Non", "arrêt"… */
export function parseReply(body: string): Reply {
  const text = body.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  if (/^(STOP|ARRET|NON|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)\b/.test(text)) return { kind: 'stop' };
  const yes = /^(OUI|YES|OK)\b\W*(\d{4})?\b/.exec(text);
  if (yes) return { kind: 'yes', code: yes[2] ?? null };
  return { kind: 'unknown' };
}

/** E.164 check identical to the database constraint. */
export function isE164(phone: string): boolean {
  return /^\+[1-9][0-9]{7,14}$/.test(phone);
}
