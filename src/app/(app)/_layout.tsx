import { Stack } from 'expo-router';

import { ReminderProvider } from '@/features/reminders/ReminderProvider';
import { DatabaseProvider } from '@/lib/db/DatabaseProvider';

export default function SignedInLayout() {
  return (
    <DatabaseProvider>
      <ReminderProvider>
        <Stack screenOptions={{ headerTitleStyle: { fontSize: 20 }, headerBackTitle: 'Retour' }}>
          <Stack.Screen name="index" options={{ title: 'Mes médicaments' }} />
          <Stack.Screen name="medications/new" options={{ title: 'Nouveau médicament' }} />
          <Stack.Screen name="medications/[id]" options={{ title: 'Modifier' }} />
          <Stack.Screen name="account" options={{ title: 'Mon compte' }} />
          <Stack.Screen name="reminders" options={{ title: 'Vérifier mes rappels' }} />
        </Stack>
      </ReminderProvider>
    </DatabaseProvider>
  );
}
