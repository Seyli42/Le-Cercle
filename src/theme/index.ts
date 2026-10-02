// Large sizes and strong contrast by default: many users are seniors or caregivers.
export const colors = {
  background: '#FFFFFF',
  surface: '#F3F6FA',
  text: '#0F172A',
  textMuted: '#475569',
  primary: '#1D4ED8',
  onPrimary: '#FFFFFF',
  danger: '#B91C1C',
  border: '#94A3B8',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const fontSize = { body: 18, title: 28, button: 20, code: 32 } as const;

/** Minimum touch target (WCAG / Apple HIG recommend at least 44pt). */
export const MIN_TOUCH = 56;
