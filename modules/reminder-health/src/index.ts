import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type NativeModule = {
  canScheduleExactAlarms(): boolean;
  isIgnoringBatteryOptimizations(): boolean;
  getPackageName(): string;
};

// Absent on iOS (not needed) and in Expo Go (no custom native code).
const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<NativeModule>('ReminderHealth') : null;

/** null = cannot be checked (Expo Go); true on iOS where alarms are always on time. */
export function canScheduleExactAlarms(): boolean | null {
  if (Platform.OS !== 'android') return true;
  return native ? native.canScheduleExactAlarms() : null;
}

/** null = cannot be checked (Expo Go); true on iOS. */
export function isIgnoringBatteryOptimizations(): boolean | null {
  if (Platform.OS !== 'android') return true;
  return native ? native.isIgnoringBatteryOptimizations() : null;
}

export function getAndroidPackageName(): string | null {
  return native ? native.getPackageName() : null;
}
