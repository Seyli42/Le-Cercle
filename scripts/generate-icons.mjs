// Generates the app icons and the store graphics from one drawing (SVG), with the
// Chromium installed for tests. Usage: node scripts/generate-icons.mjs
// Drawing: eight dots in a circle (the relatives, "le cercle") around a check mark
// (an intake confirmed). Colours: primary blue of src/theme.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BLUE = '#1D4ED8';
const CHROME =
  process.env.CHROME_PATH ??
  ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find(existsSync);
if (!CHROME) throw new Error('Chromium introuvable : définissez CHROME_PATH.');

/** Ring + check, centred at (cx, cy), for a mark of the given radius. */
function mark(cx, cy, radius, color) {
  const dots = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * 2 * Math.PI - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(radius * 0.17).toFixed(1)}" fill="${color}"/>`;
  }).join('');
  const s = radius / 330;
  const check = `<path d="M ${cx - 135 * s} ${cy + 5 * s} L ${cx - 40 * s} ${cy + 100 * s} L ${cx + 140 * s} ${cy - 95 * s}"
    fill="none" stroke="${color}" stroke-width="${82 * s}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return dots + check;
}

const svg = (w, h, body, background = 'none') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (background === 'none' ? '' : `<rect width="${w}" height="${h}" fill="${background}"/>`) +
  body +
  '</svg>';

const dir = mkdtempSync(join(tmpdir(), 'icons-'));
function render(name, width, height, content, out) {
  const html = join(dir, `${name}.html`);
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head><body>${content}</body></html>`,
  );
  execFileSync(CHROME, [
    '--headless',
    '--no-sandbox',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--window-size=${width},${height}`,
    `--screenshot=${resolve(out)}`,
    `file://${html}`,
  ]);
  console.log('✓', out);
}

// iOS / generic icon: opaque square (iOS rounds the corners itself, no transparency).
render(
  'icon',
  1024,
  1024,
  svg(1024, 1024, mark(512, 512, 330, '#FFFFFF'), BLUE),
  'assets/icon.png',
);
// Android adaptive icon: the mark stays inside the 66 % safe zone (masks vary by phone).
render(
  'fg',
  1024,
  1024,
  svg(1024, 1024, mark(512, 512, 235, '#FFFFFF')),
  'assets/android-icon-foreground.png',
);
render('bg', 1024, 1024, svg(1024, 1024, '', BLUE), 'assets/android-icon-background.png');
render(
  'mono',
  1024,
  1024,
  svg(1024, 1024, mark(512, 512, 235, '#FFFFFF')),
  'assets/android-icon-monochrome.png',
);
// Splash: blue disc on the white / dark splash background.
render(
  'splash',
  1024,
  1024,
  svg(
    1024,
    1024,
    `<circle cx="512" cy="512" r="500" fill="${BLUE}"/>` + mark(512, 512, 300, '#FFFFFF'),
  ),
  'assets/splash-icon.png',
);
render('favicon', 48, 48, svg(48, 48, mark(24, 24, 15.5, '#FFFFFF'), BLUE), 'assets/favicon.png');

// Store graphics.
render(
  'store-icon',
  512,
  512,
  svg(512, 512, mark(256, 256, 165, '#FFFFFF'), BLUE),
  'store/icon-512.png',
);
render(
  'feature',
  1024,
  500,
  svg(
    1024,
    500,
    mark(250, 250, 150, '#FFFFFF') +
      `<text x="470" y="225" font-family="Helvetica, Arial, sans-serif" font-size="78" font-weight="700" fill="#FFFFFF">Le Cercle</text>` +
      `<text x="472" y="300" font-family="Helvetica, Arial, sans-serif" font-size="36" fill="#DBEAFE">Vos médicaments, à l’heure.</text>` +
      `<text x="472" y="350" font-family="Helvetica, Arial, sans-serif" font-size="36" fill="#DBEAFE">Vos proches, rassurés.</text>`,
    BLUE,
  ),
  'store/feature-graphic.png',
);
