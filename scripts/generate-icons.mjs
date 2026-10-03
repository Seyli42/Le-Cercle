// Generates the app icons and the store graphics from one drawing (SVG), with the
// Chromium installed for tests. Usage: node scripts/generate-icons.mjs
// Colours: primary blue of src/theme.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BLUE = '#1D4ED8';
const CHROME =
  process.env.CHROME_PATH ??
  ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find(existsSync);
if (!CHROME) throw new Error('Chromium introuvable : définissez CHROME_PATH.');

/**
 * The DoseCircle logo: five people (the person in the middle, larger, surrounded by
 * their relatives) and a check mark (an intake confirmed). Drawn on a 1024 grid, then
 * placed at (cx, cy) with the given scale. The thin gaps between shapes are real holes
 * (SVG mask), so the same drawing works on blue, on transparent and in one colour.
 */
let maskId = 0;
function mark(cx, cy, scale, color) {
  const GAP = 26;
  const person = (hx, hy, r, w, top, bottom) => {
    const h = bottom - top;
    const body =
      `M ${hx - w} ${bottom} C ${hx - w} ${top + 0.35 * h} ${hx - 0.55 * w} ${top} ${hx} ${top} ` +
      `C ${hx + 0.55 * w} ${top} ${hx + w} ${top + 0.35 * h} ${hx + w} ${bottom} Z`;
    return [
      `<path d="${body}" fill="black" stroke="black" stroke-width="${GAP * 2}" stroke-linejoin="round"/>`,
      `<circle cx="${hx}" cy="${hy}" r="${r + GAP}" fill="black"/>`,
      `<path d="${body}" fill="white"/>`,
      `<circle cx="${hx}" cy="${hy}" r="${r}" fill="white"/>`,
    ].join('');
  };
  // Side relatives: a body that curves down and inwards, as if embracing the person.
  const hugger = (side) => {
    const x = (v) => (side < 0 ? v : 1024 - v);
    const body =
      `M ${x(232)} 562 C ${x(150)} 590 ${x(128)} 690 ${x(178)} 770 ` +
      `C ${x(222)} 838 ${x(300)} 872 ${x(352)} 884 ` +
      `C ${x(318)} 846 ${x(292)} 800 ${x(286)} 748 ` +
      `C ${x(280)} 690 ${x(300)} 636 ${x(338)} 600 ` +
      `C ${x(310)} 572 ${x(272)} 560 ${x(232)} 562 Z`;
    return [
      `<path d="${body}" fill="black" stroke="black" stroke-width="${GAP * 2}" stroke-linejoin="round"/>`,
      `<circle cx="${x(240)}" cy="478" r="${70 + GAP}" fill="black"/>`,
      `<path d="${body}" fill="white" stroke="white" stroke-width="10" stroke-linejoin="round"/>`,
      `<circle cx="${x(240)}" cy="478" r="70" fill="white"/>`,
    ].join('');
  };
  const check = 'M 410 770 L 494 852 L 664 684';
  const layers = [
    person(362, 262, 70, 112, 350, 520), // back left
    person(662, 262, 70, 112, 350, 520), // back right
    hugger(-1),
    hugger(1),
    person(512, 466, 90, 150, 580, 820), // the person
    // Their body ends on the check mark, as on the original logo.
    `<path d="M 362 728 L 494 860 L 662 692 L 662 900 L 362 900 Z" fill="black"/>`,
    `<path d="${check}" fill="none" stroke="black" stroke-width="${64 + GAP * 2}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${check}" fill="none" stroke="white" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join('');
  const id = `m${(maskId += 1)}`;
  const t = `translate(${cx - 512 * scale} ${cy - 570 * scale}) scale(${scale})`;
  return (
    `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100000" height="100000">` +
    `<g transform="${t}">${layers}</g></mask></defs>` +
    `<rect width="100000" height="100000" fill="${color}" mask="url(#${id})"/>`
  );
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
  svg(1024, 1024, mark(512, 512, 0.82, '#FFFFFF'), BLUE),
  'assets/icon.png',
);
// Android adaptive icon: the mark stays inside the 66 % safe zone (masks vary by phone).
render(
  'fg',
  1024,
  1024,
  svg(1024, 1024, mark(512, 512, 0.58, '#FFFFFF')),
  'assets/android-icon-foreground.png',
);
render('bg', 1024, 1024, svg(1024, 1024, '', BLUE), 'assets/android-icon-background.png');
render(
  'mono',
  1024,
  1024,
  svg(1024, 1024, mark(512, 512, 0.58, '#FFFFFF')),
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
    `<circle cx="512" cy="512" r="500" fill="${BLUE}"/>` + mark(512, 512, 0.74, '#FFFFFF'),
  ),
  'assets/splash-icon.png',
);
render('favicon', 48, 48, svg(48, 48, mark(24, 24, 0.042, '#FFFFFF'), BLUE), 'assets/favicon.png');

// Store graphics.
render(
  'store-icon',
  512,
  512,
  svg(512, 512, mark(256, 256, 0.41, '#FFFFFF'), BLUE),
  'store/icon-512.png',
);
render(
  'feature',
  1024,
  500,
  svg(
    1024,
    500,
    mark(250, 250, 0.4, '#FFFFFF') +
      `<text x="470" y="225" font-family="Helvetica, Arial, sans-serif" font-size="78" font-weight="700" fill="#FFFFFF">DoseCircle</text>` +
      `<text x="472" y="300" font-family="Helvetica, Arial, sans-serif" font-size="36" fill="#DBEAFE">Vos médicaments, à l’heure.</text>` +
      `<text x="472" y="350" font-family="Helvetica, Arial, sans-serif" font-size="36" fill="#DBEAFE">Vos proches, rassurés.</text>`,
    BLUE,
  ),
  'store/feature-graphic.png',
);
