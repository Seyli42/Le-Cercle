import { t } from '@/i18n';
import type { PermissionState } from '@/features/reminders/notifications';

export type ReminderHealth = {
  readonly permission: PermissionState;
  readonly canAskAgain: boolean;
  /** Android: exact alarms allowed. null = cannot be checked (Expo Go). */
  readonly exactAlarms: boolean | null;
  /** Android: app exempted from battery optimisation. null = cannot be checked. */
  readonly ignoringBatteryOptimizations: boolean | null;
  readonly scheduleFailures: number;
};

export type IssueAction =
  | 'request-permission'
  | 'open-app-settings'
  | 'open-exact-alarm-settings'
  | 'open-battery-settings'
  | 'retry-sync';

export type Issue = {
  readonly id: 'permission' | 'exact-alarms' | 'battery' | 'schedule-failures';
  /** critical = reminders will not ring (or late); warning = they might not. */
  readonly level: 'critical' | 'warning';
  readonly title: string;
  readonly description: string;
  readonly action: { readonly kind: IssueAction; readonly label: string };
};

/** What prevents reminders from ringing on time, most serious first. */
export function computeIssues(health: ReminderHealth): Issue[] {
  const issues: Issue[] = [];

  if (health.permission !== 'granted') {
    const canAsk = health.permission === 'undetermined' || health.canAskAgain;
    issues.push({
      id: 'permission',
      level: 'critical',
      title: t('health.permissionTitle'),
      description: t('health.permissionDescription'),
      action: canAsk
        ? { kind: 'request-permission', label: t('health.allowNotifications') }
        : { kind: 'open-app-settings', label: t('health.openSettings') },
    });
  }
  if (health.exactAlarms === false) {
    issues.push({
      id: 'exact-alarms',
      level: 'critical',
      title: t('health.exactTitle'),
      description: t('health.exactDescription'),
      action: { kind: 'open-exact-alarm-settings', label: t('health.exactAction') },
    });
  }
  if (health.ignoringBatteryOptimizations === false) {
    issues.push({
      id: 'battery',
      level: 'warning',
      title: t('health.batteryTitle'),
      description: t('health.batteryDescription'),
      action: { kind: 'open-battery-settings', label: t('health.batteryAction') },
    });
  }
  if (health.scheduleFailures > 0) {
    issues.push({
      id: 'schedule-failures',
      level: 'critical',
      title: t('health.failuresTitle'),
      description: t('health.failuresDescription'),
      action: { kind: 'retry-sync', label: t('health.retry') },
    });
  }
  return issues;
}
