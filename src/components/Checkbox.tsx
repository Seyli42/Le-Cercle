import { Pressable, Text, View } from 'react-native';

import { MIN_TOUCH, fontSize, makeStyles, spacing } from '@/theme';

type Props = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
};

export function Checkbox({ checked, onChange, label }: Props) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.row}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH },
  box: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.primary },
  tick: { color: colors.onPrimary, fontSize: 20, fontWeight: '700' },
  label: { flex: 1, fontSize: fontSize.body, color: colors.text, lineHeight: 24 },
}));
