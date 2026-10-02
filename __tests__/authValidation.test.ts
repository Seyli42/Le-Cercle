import { isValidEmail, isValidOtp, normalizeEmail, sanitizeOtp } from '@/features/auth/validation';

describe('auth validation', () => {
  it('normalises e-mails', () => {
    expect(normalizeEmail('  Marie@Exemple.FR ')).toBe('marie@exemple.fr');
  });

  it.each(['marie@exemple.fr', ' Jean.Dupont+test@orange.fr '])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['', 'marie', 'marie@', 'marie@exemple', 'ma rie@exemple.fr'])(
    'rejects "%s"',
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );

  it('keeps digits only from a pasted code', () => {
    expect(sanitizeOtp('123 456')).toBe('123456');
    expect(sanitizeOtp('12-34-56-78')).toBe('123456');
  });

  it('requires exactly 6 digits', () => {
    expect(isValidOtp('123456')).toBe(true);
    expect(isValidOtp('12345')).toBe(false);
    expect(isValidOtp('12345a')).toBe(false);
  });
});
