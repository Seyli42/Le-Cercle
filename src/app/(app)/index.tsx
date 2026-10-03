import { Link, router, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { ErrorFallback } from '@/components/ErrorFallback';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { treatmentStatus } from '@/features/medications/format';
import { MedicationCard } from '@/features/medications/MedicationCard';
import { useMedicationList } from '@/features/medications/useMedications';
import { ReminderBanner } from '@/features/reminders/ReminderBanner';
import { TodayDoses } from '@/features/reminders/TodayDoses';
import { colors, fontSize, spacing } from '@/theme';

export default function MedicationListScreen() {
  const { state, reload } = useMedicationList();

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Link href="/account" style={styles.headerLink} accessibilityRole="button">
            Compte
          </Link>
        ),
      }}
    />
  );

  if (state.status === 'error') {
    return (
      <>
        {header}
        <ErrorFallback onRetry={reload} />
      </>
    );
  }

  return (
    <Screen>
      {header}
      <ReminderBanner />
      <TodayDoses />
      <PrimaryButton
        label="Voir l’historique des prises"
        variant="secondary"
        onPress={() => router.push('/history')}
      />
      <PrimaryButton
        label="Mon Cercle : proches prévenus"
        variant="secondary"
        onPress={() => router.push('/circle')}
      />
      {state.status !== 'loading' && state.data.length > 0 && (
        <Text style={styles.heading} accessibilityRole="header">
          Mes traitements
        </Text>
      )}
      {state.status === 'loading' ? (
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Chargement" />
      ) : state.data.length === 0 ? (
        <>
          <Text style={styles.title}>Aucun médicament pour l’instant</Text>
          <Text style={styles.body}>
            Ajoutez vos médicaments et leurs horaires : Le Cercle vous les rappellera.
          </Text>
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
      <PrimaryButton
        label="+ Ajouter un médicament"
        onPress={() => router.push('/medications/new')}
      />
      <MedicalDisclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerLink: { fontSize: fontSize.body, color: colors.primary, padding: spacing.sm },
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
});
