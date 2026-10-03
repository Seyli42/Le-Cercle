import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Checkbox } from '@/components/Checkbox';
import { Chip } from '@/components/Chip';
import { PickerField } from '@/components/PickerField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import {
  formatLocalDate,
  parseLocalDate,
  timeOfDayToDate,
  toLocalDateString,
  toTimeOfDay,
} from '@/features/medications/dates';
import {
  describeDays,
  FORM_LABELS,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
} from '@/features/medications/format';
import { MedicationValidationError } from '@/features/medications/repository';
import {
  ALL_WEEKDAYS,
  type MedicationForm as Form,
  type MedicationInput,
  type Weekday,
} from '@/features/medications/types';
import {
  LIMITS,
  MEDICATION_FORMS,
  validateMedicationInput,
  type FieldErrors,
} from '@/features/medications/validation';
import { toAppError } from '@/lib/errors';
import { fontSize, makeStyles, spacing } from '@/theme';
import { formatTimeOfDay, t } from '@/i18n';

type DraftSchedule = { readonly key: string; timeOfDay: string; daysOfWeek: Weekday[] };

type Props = {
  readonly initial?: MedicationInput;
  readonly submitLabel: string;
  /** Saves the medication. May throw an AppError or a MedicationValidationError. */
  readonly onSubmit: (input: MedicationInput) => Promise<void>;
};

let keyCounter = 0;
const newKey = () => `schedule-${++keyCounter}`;

function nextTime(schedules: readonly DraftSchedule[]): string {
  const last = schedules.at(-1)?.timeOfDay;
  if (!last) return '08:00';
  const hour = Math.min(Number(last.slice(0, 2)) + 4, 23);
  const candidate = `${String(hour).padStart(2, '0')}:00`;
  return schedules.some((s) => s.timeOfDay === candidate) ? '23:00' : candidate;
}

export function MedicationForm({ initial, submitLabel, onSubmit }: Props) {
  const styles = useStyles();
  const [name, setName] = useState(initial?.name ?? '');
  const [form, setForm] = useState<Form>(initial?.form ?? 'tablet');
  const [doseLabel, setDoseLabel] = useState(initial?.doseLabel ?? '');
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? toLocalDateString(new Date()));
  const [endsOn, setEndsOn] = useState<string | null>(initial?.endsOn ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [schedules, setSchedules] = useState<DraftSchedule[]>(
    initial?.schedules.map((s) => ({
      key: newKey(),
      timeOfDay: s.timeOfDay,
      daysOfWeek: [...s.daysOfWeek],
    })) ?? [{ key: newKey(), timeOfDay: '08:00', daysOfWeek: [...ALL_WEEKDAYS] }],
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clearError = (field: keyof FieldErrors) =>
    setErrors(({ [field]: _removed, ...rest }) => rest);

  const updateSchedule = (key: string, patch: Partial<Omit<DraftSchedule, 'key'>>) => {
    setSchedules((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    clearError('schedules');
  };

  const toggleDay = (schedule: DraftSchedule, day: Weekday) => {
    const days = schedule.daysOfWeek.includes(day)
      ? schedule.daysOfWeek.filter((d) => d !== day)
      : [...schedule.daysOfWeek, day].sort();
    updateSchedule(schedule.key, { daysOfWeek: days });
  };

  const submit = async () => {
    const input: MedicationInput = {
      name,
      form,
      doseLabel,
      startsOn,
      endsOn,
      notes: notes || null,
      schedules: schedules.map(({ timeOfDay, daysOfWeek }) => ({ timeOfDay, daysOfWeek })),
    };
    const result = validateMedicationInput(input);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError(t('medicationForm.toFix'));
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      await onSubmit(result.value);
    } catch (error) {
      if (error instanceof MedicationValidationError) setErrors(error.fieldErrors);
      setFormError(toAppError(error).userMessage);
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.hint}>{t('medicationForm.hint')}</Text>

      <TextField
        label={t('medicationForm.name')}
        value={name}
        onChangeText={(v) => {
          setName(v);
          clearError('name');
        }}
        placeholder={t('medicationForm.namePlaceholder')}
        maxLength={LIMITS.name}
        autoCapitalize="sentences"
        error={errors.name}
      />

      <View style={styles.group}>
        <Text style={styles.label}>{t('medicationForm.form')}</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {MEDICATION_FORMS.map((f) => (
            <Chip key={f} label={FORM_LABELS[f]} selected={form === f} onPress={() => setForm(f)} />
          ))}
        </View>
      </View>

      <TextField
        label={t('medicationForm.dose')}
        value={doseLabel}
        onChangeText={(v) => {
          setDoseLabel(v);
          clearError('doseLabel');
        }}
        placeholder={t('medicationForm.dosePlaceholder')}
        maxLength={LIMITS.doseLabel}
        error={errors.doseLabel}
      />

      <View style={styles.group}>
        <Text style={styles.label}>{t('medicationForm.schedules')}</Text>
        {schedules.map((schedule, index) => (
          <View key={schedule.key} style={styles.scheduleCard}>
            <PickerField
              label={t('medicationForm.intake', { number: index + 1 })}
              mode="time"
              value={timeOfDayToDate(schedule.timeOfDay)}
              display={formatTimeOfDay(schedule.timeOfDay)}
              onChange={(date) => updateSchedule(schedule.key, { timeOfDay: toTimeOfDay(date) })}
            />
            <View style={styles.chips}>
              {ALL_WEEKDAYS.map((day) => (
                <Chip
                  key={day}
                  role="checkbox"
                  label={WEEKDAY_SHORT[day]}
                  accessibilityLabel={WEEKDAY_LONG[day]}
                  selected={schedule.daysOfWeek.includes(day)}
                  onPress={() => toggleDay(schedule, day)}
                />
              ))}
            </View>
            <Text style={styles.hint}>
              {schedule.daysOfWeek.length > 0
                ? describeDays(schedule.daysOfWeek)
                : t('medicationForm.noDay')}
            </Text>
            {schedules.length > 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('medicationForm.removeIntakeA11y', {
                  time: formatTimeOfDay(schedule.timeOfDay),
                })}
                onPress={() => setSchedules((list) => list.filter((s) => s.key !== schedule.key))}
                style={styles.link}
              >
                <Text style={styles.linkDanger}>{t('medicationForm.removeIntake')}</Text>
              </Pressable>
            )}
          </View>
        ))}
        {errors.schedules ? (
          <Text style={styles.error} accessibilityRole="alert">
            {errors.schedules}
          </Text>
        ) : null}
        {schedules.length < LIMITS.schedulesPerMedication && (
          <PrimaryButton
            label={t('medicationForm.addTime')}
            variant="secondary"
            onPress={() =>
              setSchedules((list) => [
                ...list,
                { key: newKey(), timeOfDay: nextTime(list), daysOfWeek: [...ALL_WEEKDAYS] },
              ])
            }
          />
        )}
      </View>

      <PickerField
        label={t('medicationForm.start')}
        mode="date"
        value={parseLocalDate(startsOn) ?? new Date()}
        display={formatLocalDate(startsOn)}
        onChange={(date) => {
          const value = toLocalDateString(date);
          setStartsOn(value);
          if (endsOn !== null && endsOn < value) setEndsOn(value);
        }}
        error={errors.startsOn}
      />

      <Checkbox
        checked={endsOn !== null}
        onChange={(checked) => setEndsOn(checked ? startsOn : null)}
        label={t('medicationForm.hasEnd')}
      />
      {endsOn !== null && (
        <PickerField
          label={t('medicationForm.end')}
          mode="date"
          value={parseLocalDate(endsOn) ?? new Date()}
          minimumDate={parseLocalDate(startsOn) ?? undefined}
          display={formatLocalDate(endsOn)}
          onChange={(date) => setEndsOn(toLocalDateString(date))}
          error={errors.endsOn}
        />
      )}

      <TextField
        label={t('medicationForm.notes')}
        value={notes}
        onChangeText={setNotes}
        placeholder={t('medicationForm.notesPlaceholder')}
        maxLength={LIMITS.notes}
        multiline
        style={styles.notes}
        error={errors.notes}
      />

      {formError ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {formError}
        </Text>
      ) : null}
      <PrimaryButton label={submitLabel} loading={saving} onPress={() => void submit()} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  form: { gap: spacing.lg },
  group: { gap: spacing.sm },
  label: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  hint: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  scheduleCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  link: { minHeight: 44, justifyContent: 'center' },
  linkDanger: { fontSize: fontSize.body, color: colors.danger, fontWeight: '600' },
  error: { fontSize: fontSize.body, color: colors.danger },
  notes: { minHeight: 96, paddingTop: spacing.sm, textAlignVertical: 'top' },
}));
