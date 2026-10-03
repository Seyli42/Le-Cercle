/**
 * The sign-in email (supabase/templates/code.html) and its subject (supabase/config.toml)
 * exist in every app language, and always contain the code. A broken template = nobody
 * can sign in.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LANGUAGES } from '@/i18n';

const root = join(__dirname, '..');
const html = readFileSync(join(root, 'supabase/templates/code.html'), 'utf8');
const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8');

/** Splits a {{ if eq .Data.language "xx" }}…{{ else }}…{{ end }} chain by language. */
function branches(template: string): Map<string, string> {
  const parts = template.split(
    /\{\{ (?:if|else if) eq \.Data\.language "(\w+)" \}\}|\{\{ else \}\}/,
  );
  const result = new Map<string, string>();
  // parts: [before, lang1, text1, lang2, text2, ..., undefined (else), fallback]
  for (let i = 1; i < parts.length; i += 2) {
    result.set(parts[i] ?? 'fallback', (parts[i + 1] ?? '').replace(/\{\{ end \}\}[\s\S]*$/, ''));
  }
  return result;
}

describe('sign-in email', () => {
  const body = branches(html);

  it('has a version per language, French by default, each with the code', () => {
    expect([...body.keys()].sort()).toEqual(
      [...LANGUAGES.filter((l) => l !== 'fr'), 'fallback'].sort(),
    );
    expect(body.get('fallback')).toContain('Votre code de connexion');
    for (const text of body.values()) expect(text).toContain('{{ .Token }}');
    expect(body.get('ar')).toContain('dir="rtl"');
  });

  it('has a subject per language, in both templates', () => {
    const subjects = [...config.matchAll(/^subject = '(.*)'$/gm)].map((m) => m[1] ?? '');
    expect(subjects).toHaveLength(2);
    for (const subject of subjects) {
      const bySubject = branches(subject);
      expect(bySubject.size).toBe(LANGUAGES.length);
      for (const text of bySubject.values()) expect(text).toContain('DoseCircle');
    }
  });
});
