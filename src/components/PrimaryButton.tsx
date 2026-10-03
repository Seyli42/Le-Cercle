import { ActivityIndicator, Pressable, Text } from 'react-native';

import { MIN_TOUCH, fontSize, makeStyles, spacing, useColors, type Colors } from '@/theme';

type Props = {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary' | 'danger';
  readonly disabled?: boolean;
  readonly loading?: boolean;
};

const background = (colors: Colors) =>
  ({
    primary: colors.primary,
    secondary: colors.surface,
    danger: colors.danger,
  }) as const;

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: Props) {
  const styles = useStyles();
  const colors = useColors();
  const inactive = disabled || loading;
  const textColor = variant === 'secondary' ? colors.primary : colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background(colors)[variant] },
        inactive && styles.inactive,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  button: {
    minHeight: MIN_TOUCH,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  label: { fontSize: fontSize.button, fontWeight: '600' },
}));
