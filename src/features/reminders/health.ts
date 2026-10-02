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
      title: 'Les notifications sont désactivées',
      description: 'Sans elles, Le Cercle ne peut pas vous rappeler vos prises.',
      action: canAsk
        ? { kind: 'request-permission', label: 'Autoriser les notifications' }
        : { kind: 'open-app-settings', label: 'Ouvrir les réglages' },
    });
  }
  if (health.exactAlarms === false) {
    issues.push({
      id: 'exact-alarms',
      level: 'critical',
      title: 'Les rappels peuvent arriver en retard',
      description:
        'Android doit autoriser Le Cercle à sonner à l’heure exacte. Activez « Alarmes et rappels ».',
      action: { kind: 'open-exact-alarm-settings', label: 'Activer les alarmes exactes' },
    });
  }
  if (health.ignoringBatteryOptimizations === false) {
    issues.push({
      id: 'battery',
      level: 'warning',
      title: 'L’économie de batterie peut bloquer les rappels',
      description:
        'Sur certains téléphones, l’économie de batterie retarde les rappels. Choisissez « Ne pas optimiser » (ou « Sans restriction ») pour Le Cercle.',
      action: { kind: 'open-battery-settings', label: 'Ouvrir les réglages de batterie' },
    });
  }
  if (health.scheduleFailures > 0) {
    issues.push({
      id: 'schedule-failures',
      level: 'critical',
      title: 'Certains rappels n’ont pas pu être programmés',
      description: 'Réessayez. Si le problème continue, redémarrez le téléphone.',
      action: { kind: 'retry-sync', label: 'Réessayer' },
    });
  }
  return issues;
}
