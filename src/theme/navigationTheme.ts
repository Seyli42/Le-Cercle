import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

import type { Colors } from '@/theme';

/** Headers, back buttons and screen backgrounds in the app's own colors. */
export function navigationTheme(colors: Colors, dark: boolean): Theme {
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.surface,
      notification: colors.danger,
    },
  };
}
