import { palettes, type Colors } from '@/theme';

// WCAG 2.1 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum]: 4.5 for body text (AA), 3 for borders/large text.
const PAIRS: readonly [keyof Colors, keyof Colors, number][] = [
  ['text', 'background', 7],
  ['text', 'surface', 7],
  ['textMuted', 'background', 4.5],
  ['textMuted', 'surface', 4.5],
  ['primary', 'background', 4.5],
  ['primary', 'surface', 4.5],
  ['onPrimary', 'primary', 4.5],
  ['onPrimary', 'danger', 4.5],
  ['danger', 'background', 4.5],
  ['danger', 'surface', 4.5],
  ['success', 'background', 4.5],
  ['success', 'surface', 4.5],
  ['warningText', 'warningSurface', 4.5],
  ['text', 'warningSurface', 4.5],
  ['text', 'dangerSurface', 4.5],
  ['border', 'background', 3],
];

describe.each(Object.entries(palettes))('%s palette', (_, colors) => {
  it.each(PAIRS)('%s on %s is readable', (fg, bg, min) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });
});
