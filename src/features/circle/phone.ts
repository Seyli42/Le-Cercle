/**
 * Turns a phone number typed by a French user into the international format (E.164)
 * required to send SMS: "06 12 34 56 78" → "+33612345678".
 * Numbers starting with + or 00 are kept international (other countries).
 */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s.\-()]/g, '');
  let e164: string;
  if (/^\+\d+$/.test(compact)) e164 = compact;
  else if (/^00\d+$/.test(compact)) e164 = `+${compact.slice(2)}`;
  else if (/^0[1-9]\d{8}$/.test(compact)) e164 = `+33${compact.slice(1)}`;
  else return null;
  // French numbers written "+33 0 6…": the national 0 must go.
  e164 = e164.replace(/^\+330/, '+33');
  if (e164.startsWith('+33') && !/^\+33[1-9]\d{8}$/.test(e164)) return null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** "+33612345678" → "06 12 34 56 78" (other countries are shown as stored). */
export function formatPhone(e164: string): string {
  const match = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return match ? `0${match.slice(1).join(' ')}` : e164;
}

export function isMobileFr(e164: string): boolean {
  return /^\+33[67]\d{8}$/.test(e164);
}
