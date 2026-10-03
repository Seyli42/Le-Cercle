import { Stack } from 'expo-router';

import { PushRegistration } from '@/features/circle/PushRegistration';
import { AdsProvider } from '@/features/monetization/AdsProvider';
import { PremiumProvider } from '@/features/monetization/PremiumProvider';
import { ReminderProvider } from '@/features/reminders/ReminderProvider';
import { SyncProvider } from '@/features/sync/SyncProvider';
import { DatabaseProvider } from '@/lib/db/DatabaseProvider';
import { t } from '@/i18n';

export default function SignedInLayout() {
  return (
    <DatabaseProvider>
      <ReminderProvider>
        <SyncProvider>
          <PushRegistration />
          <PremiumProvider>
            <AdsProvider>
              <Stack
                screenOptions={{
                  headerTitleStyle: { fontSize: 20 },
                  headerBackTitle: t('nav.back'),
                }}
              >
                <Stack.Screen name="index" options={{ title: t('nav.home') }} />
                <Stack.Screen name="medications/new" options={{ title: t('nav.newMedication') }} />
                <Stack.Screen
                  name="medications/[id]"
                  options={{ title: t('nav.editMedication') }}
                />
                <Stack.Screen name="account" options={{ title: t('nav.account') }} />
                <Stack.Screen name="reminders" options={{ title: t('nav.reminders') }} />
                <Stack.Screen name="history" options={{ title: t('nav.history') }} />
                <Stack.Screen name="circle" options={{ title: t('nav.circle') }} />
                <Stack.Screen name="premium" options={{ title: t('nav.premium') }} />
              </Stack>
            </AdsProvider>
          </PremiumProvider>
        </SyncProvider>
      </ReminderProvider>
    </DatabaseProvider>
  );
}
