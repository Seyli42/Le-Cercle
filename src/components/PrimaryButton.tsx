import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fontSize, MIN_TOUCH, spacing } from '@/theme';

type Props = {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'danger';
};

export function PrimaryButton({ label, onPress, variant = 'primary' }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: variant === 'danger' ? colors.danger : colors.primary },
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  label: { color: colors.onPrimary, fontSize: fontSize.button, fontWeight: '600' },
});
