import * as Application from 'expo-application';
import * as Updates from 'expo-updates';

import { t } from '@/i18n';

export type AppVersion = {
  /** Store version, e.g. "1.0.0". */
  readonly version: string | null;
  /** Build number (iOS CFBundleVersion / Android versionCode). */
  readonly build: string | null;
  /** Over-the-air update in use; null = the code shipped inside the store build. */
  readonly updateId: string | null;
  readonly channel: string | null;
};

export function getAppVersion(): AppVersion {
  return {
    version: Application.nativeApplicationVersion,
    build: Application.nativeBuildVersion,
    updateId: Updates.isEnabled && !Updates.isEmbeddedLaunch ? Updates.updateId : null,
    channel: Updates.channel,
  };
}

/** One line for the account screen, read out to support when something goes wrong. */
export function formatAppVersion(v: AppVersion): string {
  const parts = [`Version ${v.version ?? '?'}${v.build ? ` (${v.build})` : ''}`];
  if (v.updateId) parts.push(t('version.update', { id: v.updateId.slice(0, 8) }));
  if (v.channel && v.channel !== 'production')
    parts.push(t('version.channel', { channel: v.channel }));
  return parts.join(' · ');
}
