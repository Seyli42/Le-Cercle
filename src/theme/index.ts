import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

/**
 * Two palettes with strong contrast (WCAG AA or better on body text): many users are
 * seniors or caregivers. The phone's setting (light / dark) decides which one is used.
 */
const light = {
  background: '#FFFFFF',
  surface: '#F3F6FA',
  text: '#0F172A',
  textMuted: '#475569',
  primary: '#1D4ED8',
  onPrimary: '#FFFFFF',
  danger: '#B91C1C',
  dangerSurface: '#FEE2E2',
  // Input outlines: ≥ 3:1 against the background (WCAG 1.4.11).
  border: '#64748B',
  success: '#15803D',
  warningSurface: '#FEF3C7',
  warningBorder: '#B45309',
  warningText: '#92400E',
};

export type Colors = typeof light;

const dark: Colors = {
  background: '#0B1220',
  surface: '#1E293B',
  text: '#F1F5F9',
  textMuted: '#CBD5E1',
  primary: '#93C5FD',
  onPrimary: '#0B1220',
  danger: '#FCA5A5',
  dangerSurface: '#450A0A',
  border: '#64748B',
  success: '#86EFAC',
  warningSurface: '#422006',
  warningBorder: '#F59E0B',
  warningText: '#FDE68A',
};

export const palettes = { light, dark } as const;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/**
 * Styles that follow the theme. Usage, at module level:
 *   const useStyles = makeStyles((colors) => ({ title: { color: colors.text } }));
 * then `const styles = useStyles();` in the component.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: Colors) => T,
): () => T {
  const cache = new Map<Colors, T>();
  const build = (colors: Colors): T => {
    const cached = cache.get(colors);
    if (cached) return cached;
    const styles = StyleSheet.create(factory(colors));
    cache.set(colors, styles);
    return styles;
  };
  return function useStyles() {
    const colors = useColors();
    return useMemo(() => build(colors), [colors]);
  };
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const fontSize = { body: 18, title: 28, button: 20, code: 32 } as const;

/** Minimum touch target (WCAG / Apple HIG recommend at least 44pt). */
export const MIN_TOUCH = 56;
