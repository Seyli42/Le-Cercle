import { Stack } from 'expo-router';

import { DatabaseProvider } from '@/lib/db/DatabaseProvider';

export default function SignedInLayout() {
  return (
    <DatabaseProvider>
      <Stack screenOptions={{ headerTitleStyle: { fontSize: 20 }, headerBackTitle: 'Retour' }}>
        <Stack.Screen name="index" options={{ title: 'Mes médicaments' }} />
        <Stack.Screen name="medications/new" options={{ title: 'Nouveau médicament' }} />
        <Stack.Screen name="medications/[id]" options={{ title: 'Modifier' }} />
        <Stack.Screen name="account" options={{ title: 'Mon compte' }} />
      </Stack>
    </DatabaseProvider>
  );
}
