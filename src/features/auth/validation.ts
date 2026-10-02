export const OTP_LENGTH = 6;
/** Must match `max_frequency` in supabase/config.toml. */
export const RESEND_COOLDOWN_SECONDS = 60;

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

// Deliberately simple: the server does the real check, this only catches typos.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(input: string): boolean {
  const email = normalizeEmail(input);
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

/** Keeps digits only, so pasted codes like "123 456" still work. */
export function sanitizeOtp(input: string): string {
  return input.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export function isValidOtp(input: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(input);
}
