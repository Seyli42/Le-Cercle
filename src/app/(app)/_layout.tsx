import { Stack } from 'expo-router';

export default function SignedInLayout() {
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontSize: 20 }, headerBackTitle: 'Retour' }} />
  );
}
