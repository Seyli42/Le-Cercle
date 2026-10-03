import { Pressable, Text } from 'react-native';

import { fontSize, makeStyles, spacing } from '@/theme';

type Props = {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  /** Screen readers announce a radio (one choice) or a checkbox (several choices). */
  readonly role?: 'radio' | 'checkbox';
  readonly accessibilityLabel?: string;
};

export function Chip({ label, selected, onPress, role = 'radio', accessibilityLabel }: Props) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={4}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  chip: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: spacing.md,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  selected: { backgroundColor: colors.primary },
  label: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600' },
  labelSelected: { color: colors.onPrimary },
}));
