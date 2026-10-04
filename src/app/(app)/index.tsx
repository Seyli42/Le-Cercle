import { Link, router, Stack } from 'expo-router';
import { ActivityIndicator, Text } from 'react-native';

import { ErrorFallback } from '@/components/ErrorFallback';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { treatmentStatus } from '@/features/medications/format';
import { MedicationCard } from '@/features/medications/MedicationCard';
import { useMedicationList } from '@/features/medications/useMedications';
import { GettingStarted } from '@/features/onboarding/GettingStarted';
import { ReminderBanner } from '@/features/reminders/ReminderBanner';
import { TodayDoses } from '@/features/reminders/TodayDoses';
import { fontSize, makeStyles, spacing, useColors } from '@/theme';
import { t } from '@/i18n';

export default function MedicationListScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { state, reload } = useMedicationList();

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Link href="/account" style={styles.headerLink} accessibilityRole="button">
            {t('home.account')}
          </Link>
        ),
      }}
    />
  );

  if (state.status === 'error') {
    return (
      <>
        {header}
        <ErrorFallback onRetry={reload} error={state.error} where="medications.list" />
      </>
    );
  }

  return (
    <Screen>
      {header}
      {state.status === 'ready' && <GettingStarted medicationCount={state.data.length} />}
      <ReminderBanner />
      <TodayDoses />
      <PrimaryButton
        label={t('home.history')}
        variant="secondary"
        onPress={() => router.push('/history')}
      />
      <PrimaryButton
        label={t('home.circle')}
        variant="secondary"
        onPress={() => router.push('/circle')}
      />
      {state.status !== 'loading' && state.data.length > 0 && (
        <Text style={styles.heading} accessibilityRole="header">
          {t('home.treatments')}
        </Text>
      )}
      {state.status === 'loading' ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          accessibilityLabel={t('common.loading')}
        />
      ) : state.data.length === 0 ? (
        <>
          <Text style={styles.title}>{t('home.emptyTitle')}</Text>
          <Text style={styles.body}>{t('home.emptyBody')}</Text>
        </>
      ) : (
        [...state.data]
          // Ended treatments go to the bottom of the list.
          .sort(
            (a, b) =>
              Number(treatmentStatus(a) === 'ended') - Number(treatmentStatus(b) === 'ended'),
          )
          .map((medication) => (
            <MedicationCard
              key={medication.id}
              medication={medication}
              onPress={() =>
                router.push({ pathname: '/medications/[id]', params: { id: medication.id } })
              }
            />
          ))
      )}
      <PrimaryButton label={t('home.add')} onPress={() => router.push('/medications/new')} />
      <MedicalDisclaimer />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  headerLink: { fontSize: fontSize.body, color: colors.primary, padding: spacing.sm },
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
}));
