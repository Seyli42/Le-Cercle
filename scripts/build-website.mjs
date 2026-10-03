// Builds the public website (privacy policy, account deletion, support) required by the
// App Store and Google Play, as plain HTML files to upload to any host (Hostinger…).
// Usage: npm run website:build  →  website/dist/
// Sources: website/pages/*.md, docs/PRIVACY.md, values in website/site.json.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

const root = new URL('..', import.meta.url).pathname;
const site = JSON.parse(readFileSync(join(root, 'website/site.json'), 'utf8'));
const out = join(root, 'website/dist');

const LOCALES = {
  fr: {
    dir: '',
    download: ["Télécharger sur l'App Store", 'Disponible sur Google Play'],
    soon: '_Bientôt disponible sur l’App Store et Google Play._',
    other: { href: 'en/index.html', label: 'English' },
    pages: [
      { file: 'index.html', source: 'website/pages/index.md', title: 'DoseCircle' },
      {
        file: 'confidentialite.html',
        source: 'docs/PRIVACY.md',
        title: 'Politique de confidentialité',
      },
      {
        file: 'suppression-compte.html',
        source: 'website/pages/suppression-compte.md',
        title: 'Supprimer votre compte',
      },
      { file: 'support.html', source: 'website/pages/support.md', title: 'Aide et contact' },
      {
        file: 'mentions-legales.html',
        source: 'website/pages/mentions-legales.md',
        title: 'Mentions légales',
      },
    ],
  },
  // English pages, for the store listings of every other language (en/…).
  en: {
    dir: 'en',
    download: ['Download on the App Store', 'Get it on Google Play'],
    soon: '_Coming soon to the App Store and Google Play._',
    other: { href: '../index.html', label: 'Français' },
    pages: [
      { file: 'index.html', source: 'website/pages/en/index.md', title: 'DoseCircle' },
      { file: 'privacy.html', source: 'docs/PRIVACY.en.md', title: 'Privacy policy' },
      {
        file: 'delete-account.html',
        source: 'website/pages/en/delete-account.md',
        title: 'Delete your account',
      },
      { file: 'support.html', source: 'website/pages/en/support.md', title: 'Help and contact' },
      { file: 'legal.html', source: 'website/pages/en/legal.md', title: 'Legal notice' },
    ],
  },
};

const fill = (text, locale) => {
  const links =
    [
      site.appStoreUrl && `[${locale.download[0]}](${site.appStoreUrl})`,
      site.playStoreUrl && `[${locale.download[1]}](${site.playStoreUrl})`,
    ]
      .filter(Boolean)
      .join(' · ') || locale.soon;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key === 'downloadLinks') return links;
    if (!(key in site)) throw new Error(`Valeur manquante dans website/site.json : ${key}`);
    return site[key];
  });
};

const css = `
:root{--bg:#fff;--text:#0F172A;--muted:#475569;--primary:#1D4ED8;--surface:#F3F6FA;--border:#64748B}
@media (prefers-color-scheme:dark){:root{--bg:#0B1220;--text:#F1F5F9;--muted:#CBD5E1;--primary:#93C5FD;--surface:#1E293B}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:18px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}a{color:var(--primary)}
nav{display:flex;flex-wrap:wrap;gap:8px 20px;padding:16px;max-width:760px;margin:0 auto;font-weight:600}
h1{font-size:2rem;line-height:1.2}h2{margin-top:2em}blockquote{margin:1em 0;padding:12px 16px;background:var(--surface);border-left:4px solid var(--primary)}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}th,td{border:1px solid var(--border);padding:8px;text-align:left;vertical-align:top}
footer{color:var(--muted);font-size:15px;text-align:center;padding:24px 16px}`;

rmSync(out, { recursive: true, force: true });
const unfilled = [];
for (const [lang, locale] of Object.entries(LOCALES)) {
  const dir = join(out, locale.dir);
  mkdirSync(dir, { recursive: true });
  const up = locale.dir ? '../' : '';
  const nav =
    locale.pages.map((p) => `<a href="${p.file}">${p.title}</a>`).join('') +
    `<a href="${locale.other.href}" lang="${lang === 'fr' ? 'en' : 'fr'}">${locale.other.label}</a>`;
  for (const page of locale.pages) {
    const markdown = fill(readFileSync(join(root, page.source), 'utf8'), locale)
      // The template's editorial note is for you, not for the public.
      .replace(
        /^> (?:Modèle rédigé pour l'application|Template written for the app)[\s\S]*?\n\n/m,
        '',
      );
    for (const match of markdown.matchAll(
      /\[(?:Raison sociale|Company name|adresse|address|SIRET|registration number|date|à préciser|to be specified|e-mail[^\]]*|email[^\]]*|dedicated email[^\]]*|région choisie|chosen region|UE ou US[^\]]*|EU or US[^\]]*|nom ou[^\]]*|name or[^\]]*|7|forme juridique|legal form|montant|amount|ville|city|numéro|number|nom|name)\]/g,
    )) {
      unfilled.push(`${join(locale.dir, page.file)}: ${match[0]}`);
    }
    const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title} — DoseCircle</title><link rel="icon" href="${up}favicon.png"><style>${css}</style></head>
<body><nav aria-label="Pages">${nav}</nav><main>${marked.parse(markdown)}</main>
<footer>© ${new Date().getFullYear()} ${site.companyName} · <a href="mailto:${site.contactEmail}">${site.contactEmail}</a></footer></body></html>
`;
    writeFileSync(join(dir, page.file), html);
  }
}
writeFileSync(
  join(out, 'app-ads.txt'),
  fill(readFileSync(join(root, 'website/app-ads.txt'), 'utf8'), LOCALES.fr),
);
writeFileSync(join(out, 'favicon.png'), readFileSync(join(root, 'assets/favicon.png')));

console.log(
  `✓ Site généré dans website/dist (${readdirSync(out, { recursive: true }).length} fichiers, français + anglais dans en/).`,
);
if (site.admobPublisherId === 'pub-0000000000000000') unfilled.push('site.json: admobPublisherId');
if (site.companyName.startsWith('[')) unfilled.push('site.json: companyName');
if (unfilled.length) {
  console.warn(
    '\n⚠️  À compléter avant de publier :\n  - ' + [...new Set(unfilled)].join('\n  - '),
  );
}
