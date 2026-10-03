/**
 * Plural category of a number, per language (CLDR rules, the subset our languages need).
 * Written out instead of Intl.PluralRules, which is not available on every Hermes build.
 */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export function pluralCategory(language: string, n: number): PluralCategory {
  const i = Math.floor(Math.abs(n));
  const integer = Number.isInteger(n);
  switch (language) {
    case 'fr':
    case 'pt':
      return i === 0 || i === 1 ? 'one' : 'other';
    case 'hi':
      return n >= 0 && n <= 1 ? 'one' : 'other';
    case 'ru': {
      if (!integer) return 'other';
      const m10 = i % 10;
      const m100 = i % 100;
      if (m10 === 1 && m100 !== 11) return 'one';
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
      return 'many';
    }
    case 'ar': {
      if (!integer) return 'other';
      const m100 = i % 100;
      if (i === 0) return 'zero';
      if (i === 1) return 'one';
      if (i === 2) return 'two';
      if (m100 >= 3 && m100 <= 10) return 'few';
      if (m100 >= 11 && m100 <= 99) return 'many';
      return 'other';
    }
    case 'zh':
    case 'ja':
    case 'id':
    case 'ms':
      return 'other';
    default:
      // en, es and most others.
      return i === 1 && integer ? 'one' : 'other';
  }
}
