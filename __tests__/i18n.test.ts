/**
 * Every language has every text, keeps the same {placeholders} as French, and gives the
 * plural forms its grammar needs. A translation error here would show a broken or missing
 * text to someone taking their medication.
 */
import ar from '@/i18n/locales/ar.json';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import fr from '@/i18n/locales/fr.json';
import hi from '@/i18n/locales/hi.json';
import id from '@/i18n/locales/id.json';
import ja from '@/i18n/locales/ja.json';
import ms from '@/i18n/locales/ms.json';
import pt from '@/i18n/locales/pt.json';
import ru from '@/i18n/locales/ru.json';
import zh from '@/i18n/locales/zh.json';
import {
  detectLanguage,
  getLanguage,
  isRTL,
  LANGUAGES,
  setLanguageForTests,
  t,
  translate,
  type Language,
} from '@/i18n';
import { pluralCategory, type PluralCategory } from '@/i18n/plural';

const CATALOG: Record<Language, unknown> = { fr, en, es, pt, zh, ja, ru, ar, hi, id, ms };
const PLURAL_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

type Leaf = { path: string; value: string | Record<string, string> };

function leaves(node: unknown, path = ''): Leaf[] {
  if (typeof node === 'string') return [{ path, value: node }];
  const entries = Object.entries(node as Record<string, unknown>);
  if (
    entries.length > 0 &&
    entries.every(([k, v]) => PLURAL_KEYS.has(k) && typeof v === 'string')
  ) {
    return [{ path, value: node as Record<string, string> }];
  }
  return entries.flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

const placeholders = (value: Leaf['value']): string[] => {
  const texts = typeof value === 'string' ? [value] : Object.values(value);
  return [...new Set(texts.flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))]
    .filter((name): name is string => name !== undefined)
    .sort();
};

/** Plural forms each language needs (for the integers we display). */
const REQUIRED: Record<Language, PluralCategory[]> = {
  fr: ['one', 'other'],
  en: ['one', 'other'],
  es: ['one', 'other'],
  pt: ['one', 'other'],
  hi: ['one', 'other'],
  ru: ['one', 'few', 'many'],
  ar: ['zero', 'one', 'two', 'few', 'many', 'other'],
  zh: ['other'],
  ja: ['other'],
  id: ['other'],
  ms: ['other'],
};

const reference = new Map(leaves(fr).map((leaf) => [leaf.path, leaf.value]));

describe.each(LANGUAGES.filter((l) => l !== 'fr'))('%s', (language) => {
  const own = leaves(CATALOG[language]);
  const byPath = new Map(own.map((leaf) => [leaf.path, leaf.value]));

  it('is a real translation, not a copy of French', () => {
    expect((CATALOG[language] as { __stub?: boolean }).__stub).toBeUndefined();
    expect(byPath.get('welcome.lead')).not.toBe(reference.get('welcome.lead'));
  });

  it('has exactly the texts of the French reference', () => {
    expect([...byPath.keys()].sort()).toEqual([...reference.keys()].sort());
  });

  it('keeps every {placeholder}', () => {
    const wrong = [...reference.entries()]
      .filter(([path, value]) => {
        const translated = byPath.get(path);
        return (
          translated !== undefined && placeholders(translated).join() !== placeholders(value).join()
        );
      })
      .map(([path]) => path);
    expect(wrong).toEqual([]);
  });

  it('gives the plural forms its grammar needs', () => {
    const plurals = own.filter((leaf) => typeof leaf.value !== 'string');
    for (const leaf of plurals) {
      const forms = Object.keys(leaf.value);
      expect({
        path: leaf.path,
        missing: REQUIRED[language].filter((f) => !forms.includes(f)),
      }).toEqual({
        path: leaf.path,
        missing: [],
      });
    }
  });

  it('has no empty text (except the "other" subscription period)', () => {
    const empty = own
      .filter((leaf) => leaf.path !== 'premium.period.other')
      .filter((leaf) =>
        typeof leaf.value === 'string'
          ? !leaf.value.trim()
          : Object.values(leaf.value).some((v) => !v.trim()),
      )
      .map((leaf) => leaf.path);
    expect(empty).toEqual([]);
  });
});

describe('runtime', () => {
  afterEach(() => setLanguageForTests('fr'));

  it('follows the first supported language of the phone, English otherwise', () => {
    expect(
      detectLanguage([
        { languageCode: 'de', languageTag: 'de-DE' },
        { languageCode: 'es', languageTag: 'es-MX' },
      ]),
    ).toEqual({
      language: 'es',
      localeTag: 'es-MX',
    });
    expect(detectLanguage([{ languageCode: 'de', languageTag: 'de-DE' }]).language).toBe('en');
    expect(detectLanguage([]).language).toBe('en');
  });

  it('fills placeholders and picks the plural form', () => {
    expect(getLanguage()).toBe('fr');
    expect(t('reminderBanner.count', { count: 1 })).toBe('1 point à corriger. ');
    expect(t('reminderBanner.count', { count: 3 })).toBe('3 points à corriger. ');
    expect(translate('ru', 'reminderBanner.count', { count: 3 })).toMatch(/^3 /);
    expect(translate('en', 'verify.codeLength', { length: 6 })).toBe('The code has 6 digits.');
  });

  it('Arabic is written right to left', () => {
    expect(isRTL('ar')).toBe(true);
    expect(isRTL('fr')).toBe(false);
  });
});

describe('plural rules', () => {
  it('follow each grammar', () => {
    expect([0, 1, 2].map((n) => pluralCategory('fr', n))).toEqual(['one', 'one', 'other']);
    expect([0, 1, 2].map((n) => pluralCategory('en', n))).toEqual(['other', 'one', 'other']);
    expect([1, 3, 5, 11, 21, 22, 25].map((n) => pluralCategory('ru', n))).toEqual([
      'one',
      'few',
      'many',
      'many',
      'one',
      'few',
      'many',
    ]);
    expect([0, 1, 2, 3, 11, 100].map((n) => pluralCategory('ar', n))).toEqual([
      'zero',
      'one',
      'two',
      'few',
      'many',
      'other',
    ]);
    expect(pluralCategory('ja', 1)).toBe('other');
  });
});
