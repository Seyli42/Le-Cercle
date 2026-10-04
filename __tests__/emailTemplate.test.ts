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

/** The languages the template switches on: {{ if eq .language "xx" }}. */
const languages = [...html.matchAll(/eq \.language "(\w+)"/g)].map((m) => m[1]);

describe('sign-in email', () => {
  it('has a version per language, French by default, and shows the code', () => {
    expect([...languages].sort()).toEqual(LANGUAGES.filter((l) => l !== 'fr').sort());
    expect(html).toContain('$title := "Votre code de connexion"');
    expect(html).toContain('{{ .Token }}');
    expect(html).toMatch(/eq \.language "ar" \}\}\{\{ \$lang = "ar" \}\}\{\{ \$dir = "rtl" \}\}/);
  });

  it('never breaks the sending (Supabase refuses a template that fails)', () => {
    // Accounts without metadata (Data = nil) must not crash the template.
    expect(html).toContain('{{ with .Data }}');
    expect(html).not.toContain('.Data.language');
    // Go reads {{ }} even inside HTML comments.
    for (const comment of html.match(/<!--[\s\S]*?-->/g) ?? []) {
      expect(comment).not.toContain('{{');
    }
  });

  it('has a short subject showing the code, in both templates', () => {
    const subjects = [...config.matchAll(/^subject = "(.*)"$/gm)].map((m) => m[1] ?? '');
    expect(subjects).toHaveLength(2);
    for (const subject of subjects) {
      // Supabase refuses subjects longer than 255 characters.
      expect(subject.length).toBeLessThanOrEqual(255);
      expect(subject).toContain('DoseCircle');
      expect(subject).toContain('{{ .Token }}');
    }
  });
});
