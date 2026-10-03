import { formatPhone, isMobileFr, normalizePhone } from '@/features/circle/phone';

it.each([
  ['06 12 34 56 78', '+33612345678'],
  ['06.12.34.56.78', '+33612345678'],
  ['0612345678', '+33612345678'],
  ['+33 6 12 34 56 78', '+33612345678'],
  ['+33 (0)6 12 34 56 78', '+33612345678'],
  ['0033612345678', '+33612345678'],
  ['+32 470 12 34 56', '+32470123456'],
])('normalises %s', (input, expected) => {
  expect(normalizePhone(input)).toBe(expected);
});

it.each(['', '12345', '06 12 34', '+33 6 12 34 56 7', 'abc', '+0612345678'])(
  'rejects "%s"',
  (input) => {
    expect(normalizePhone(input)).toBeNull();
  },
);

it('formats French numbers for display', () => {
  expect(formatPhone('+33612345678')).toBe('06 12 34 56 78');
  expect(formatPhone('+32470123456')).toBe('+32470123456');
  expect(isMobileFr('+33612345678')).toBe(true);
  expect(isMobileFr('+33144556677')).toBe(false);
});
