import { Stack } from 'expo-router';

import { AdsProvider } from '@/features/monetization/AdsProvider';
import { PremiumProvider } from '@/features/monetization/PremiumProvider';
import { ReminderProvider } from '@/features/reminders/ReminderProvider';
import { SyncProvider } from '@/features/sync/SyncProvider';
import { DatabaseProvider } from '@/lib/db/DatabaseProvider';

export default function SignedInLayout() {
  return (
    <DatabaseProvider>
      <ReminderProvider>
        <SyncProvider>
          <PremiumProvider>
            <AdsProvider>
              <Stack
                screenOptions={{ headerTitleStyle: { fontSize: 20 }, headerBackTitle: 'Retour' }}
              >
                <Stack.Screen name="index" options={{ title: 'Mes médicaments' }} />
                <Stack.Screen name="medications/new" options={{ title: 'Nouveau médicament' }} />
                <Stack.Screen name="medications/[id]" options={{ title: 'Modifier' }} />
                <Stack.Screen name="account" options={{ title: 'Mon compte' }} />
                <Stack.Screen name="reminders" options={{ title: 'Vérifier mes rappels' }} />
                <Stack.Screen name="history" options={{ title: 'Historique des prises' }} />
                <Stack.Screen name="circle" options={{ title: 'Mon Cercle' }} />
                <Stack.Screen name="premium" options={{ title: 'Le Cercle Premium' }} />
              </Stack>
            </AdsProvider>
          </PremiumProvider>
        </SyncProvider>
      </ReminderProvider>
    </DatabaseProvider>
  );
}
