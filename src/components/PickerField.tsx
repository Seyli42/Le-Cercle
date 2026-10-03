import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { MIN_TOUCH, fontSize, makeStyles, spacing } from '@/theme';
import { getLocaleTag, t, uses24HourClock } from '@/i18n';

type Props = {
  readonly label: string;
  readonly mode: 'date' | 'time';
  readonly value: Date;
  /** Text shown on the button, e.g. "08:00" or "2 octobre 2026". */
  readonly display: string;
  readonly onChange: (value: Date) => void;
  readonly minimumDate?: Date | undefined;
  readonly error?: string | undefined;
};

/**
 * Field that opens the native picker: a dialog on Android, an inline wheel on iOS.
 * Times are always shown in 24 h format, as on French prescriptions.
 */
export function PickerField({ label, mode, value, display, onChange, minimumDate, error }: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const isIos = Platform.OS === 'ios';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${display}. ${t('common.tapToEdit')}`}
        onPress={() => {
          setDraft(value);
          setOpen(true);
        }}
        style={[styles.button, error ? styles.buttonError : null]}
      >
        <Text style={styles.value}>{display}</Text>
      </Pressable>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {open && (
        <View style={isIos ? styles.iosPanel : undefined}>
          <DateTimePicker
            value={isIos ? draft : value}
            mode={mode}
            is24Hour={uses24HourClock()}
            locale={getLocaleTag()}
            display={isIos ? 'spinner' : 'default'}
            {...(minimumDate ? { minimumDate } : {})}
            onValueChange={(_, date) => {
              if (isIos) {
                setDraft(date);
              } else {
                setOpen(false);
                onChange(date);
              }
            }}
            onDismiss={() => setOpen(false)}
          />
          {isIos && (
            <PrimaryButton
              label={t('common.validate')}
              onPress={() => {
                setOpen(false);
                onChange(draft);
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { gap: spacing.xs },
  label: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  button: {
    minHeight: MIN_TOUCH,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  buttonError: { borderColor: colors.danger },
  value: { fontSize: fontSize.body, color: colors.text },
  error: { fontSize: fontSize.body, color: colors.danger },
  iosPanel: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.sm },
}));
