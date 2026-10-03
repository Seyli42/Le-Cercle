/**
 * Translations. The app follows the phone's language (or the one chosen for DoseCircle in
 * the phone settings); unsupported languages fall back to English.
 *
 * Texts live in ./locales/<language>.json, French being the reference: every other file
 * is typed against it, so a missing text is a TypeScript error, and __tests__/i18n.test.ts
 * checks that every translation keeps the same {placeholders}.
 */
import { getCalendars, getLocales } from 'expo-localization';

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
import { pluralCategory } from '@/i18n/plural';

export const LANGUAGES = [
  'fr',
  'en',
  'es',
  'pt',
  'zh',
  'ja',
  'ru',
  'ar',
  'hi',
  'id',
  'ms',
] as const;
export type Language = (typeof LANGUAGES)[number];

/** Native names, for a language picker or the store listings. */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  pt: 'Português',
  zh: '中文',
  ja: '日本語',
  ru: 'Русский',
  ar: 'العربية',
  hi: 'हिन्दी',
  id: 'Bahasa Indonesia',
  ms: 'Bahasa Melayu',
};

type PluralKey = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
const PLURAL_KEYS: readonly string[] = ['zero', 'one', 'two', 'few', 'many', 'other'];
type PluralForms = { readonly other: string } & Partial<
  Record<Exclude<PluralKey, 'other'>, string>
>;
/** A plural entry has an "other" form and nothing but plural forms. */
type IsPlural<T> = T extends { other: string }
  ? Exclude<keyof T, PluralKey> extends never
    ? true
    : false
  : false;
/** French shape, with plural entries opened to every plural form (Arabic has six). */
type Widen<T> = T extends string
  ? string
  : IsPlural<T> extends true
    ? PluralForms
    : { readonly [K in keyof T]: Widen<T[K]> };
export type Messages = Widen<typeof fr>;
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : IsPlural<T[K]> extends true
      ? `${P}${K}`
      : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<Messages>;
export type Params = Readonly<Record<string, string | number>>;

// Typed against French: a missing or misspelled key in any language fails the build.
const CATALOG: Readonly<Record<Language, Messages>> = {
  fr: fr satisfies Messages,
  en: en satisfies Messages,
  es: es satisfies Messages,
  pt: pt satisfies Messages,
  zh: zh satisfies Messages,
  ja: ja satisfies Messages,
  ru: ru satisfies Messages,
  ar: ar satisfies Messages,
  hi: hi satisfies Messages,
  id: id satisfies Messages,
  ms: ms satisfies Messages,
};

const isLanguage = (code: string | null | undefined): code is Language =>
  (LANGUAGES as readonly string[]).includes(code ?? '');

type DeviceLocale = { readonly languageCode: string | null; readonly languageTag: string };

/** First supported language among the phone's preferred ones, English otherwise. */
export function detectLanguage(locales: readonly DeviceLocale[]): {
  language: Language;
  localeTag: string;
} {
  for (const locale of locales) {
    const code = locale.languageCode?.toLowerCase();
    if (isLanguage(code)) return { language: code, localeTag: locale.languageTag };
  }
  return { language: 'en', localeTag: 'en' };
}

let state = detectLanguage(safeLocales());
const listeners = new Set<() => void>();

function safeLocales(): DeviceLocale[] {
  try {
    return getLocales();
  } catch {
    return [];
  }
}

export const getLanguage = (): Language => state.language;
/** BCP-47 tag for dates and numbers (keeps the region: "en-GB" writes dates like a Briton). */
export const getLocaleTag = (): string => state.localeTag;
export const isRTL = (language: Language = state.language): boolean => language === 'ar';

/** Re-reads the phone's language (Android can change it while the app runs). */
export function refreshLanguage(): boolean {
  const next = detectLanguage(safeLocales());
  if (next.language === state.language && next.localeTag === state.localeTag) return false;
  state = next;
  listeners.forEach((listener) => listener());
  return true;
}

/** Tests and previews only. */
export function setLanguageForTests(language: Language): void {
  state = { language, localeTag: language };
  listeners.forEach((listener) => listener());
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function lookup(messages: Messages, key: string): string | PluralForms | undefined {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' || (node !== null && typeof node === 'object')
    ? (node as string | PluralForms)
    : undefined;
}

function interpolate(text: string, params: Params | undefined): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Text in the current language; `count` picks the plural form. */
export function t(key: MessageKey, params?: Params): string {
  return translate(state.language, key, params);
}

export function translate(language: Language, key: MessageKey, params?: Params): string {
  const entry = lookup(CATALOG[language], key) ?? lookup(CATALOG.en, key) ?? key;
  if (typeof entry === 'string') return interpolate(entry, params);
  if (!Object.keys(entry).every((k) => PLURAL_KEYS.includes(k))) return key;
  const count = Number(params?.count ?? 0);
  const form = entry[pluralCategory(language, count)] ?? entry.other;
  return interpolate(form, params);
}

// ---------------------------------------------------------------------------
// Dates and times in the person's language (Hermes ships Intl.DateTimeFormat).
// ---------------------------------------------------------------------------
const formatters = new Map<string, Intl.DateTimeFormat>();

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  const cacheKey = `${state.localeTag}|${JSON.stringify(options)}`;
  let formatter = formatters.get(cacheKey);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(state.localeTag, options);
    } catch {
      formatter = new Intl.DateTimeFormat(state.language, options);
    }
    formatters.set(cacheKey, formatter);
  }
  return formatter.format(date);
}

export const formatTime = (date: Date): string =>
  formatDate(date, { hour: '2-digit', minute: '2-digit' });

export const formatDateTime = (date: Date): string =>
  formatDate(date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "08:00" stored for a schedule, shown as the phone shows hours ("8:00 AM" in the US). */
export function formatTimeOfDay(value: string): string {
  const [h, m] = value.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return value;
  const date = new Date(2000, 0, 1, h, m);
  return uses24HourClock() ? value : formatTime(date);
}

/** The phone's clock setting (12 h / 24 h). */
export function uses24HourClock(): boolean {
  try {
    return getCalendars()[0]?.uses24hourClock ?? true;
  } catch {
    return true;
  }
}
