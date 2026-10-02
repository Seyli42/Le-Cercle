import { computeIssues, type ReminderHealth } from '@/features/reminders/health';

const healthy: ReminderHealth = {
  permission: 'granted',
  canAskAgain: true,
  exactAlarms: true,
  ignoringBatteryOptimizations: true,
  scheduleFailures: 0,
};

describe('computeIssues', () => {
  it('reports nothing when everything is fine', () => {
    expect(computeIssues(healthy)).toEqual([]);
  });

  it('treats unknown checks (Expo Go) as no issue', () => {
    expect(
      computeIssues({ ...healthy, exactAlarms: null, ignoringBatteryOptimizations: null }),
    ).toEqual([]);
  });

  it('asks for the permission when it can, otherwise sends to the settings', () => {
    expect(computeIssues({ ...healthy, permission: 'undetermined' })[0]?.action.kind).toBe(
      'request-permission',
    );
    expect(
      computeIssues({ ...healthy, permission: 'denied', canAskAgain: false })[0]?.action.kind,
    ).toBe('open-app-settings');
  });

  it('lists every problem, critical ones first', () => {
    const issues = computeIssues({
      permission: 'denied',
      canAskAgain: false,
      exactAlarms: false,
      ignoringBatteryOptimizations: false,
      scheduleFailures: 2,
    });
    expect(issues.map((i) => [i.id, i.level])).toEqual([
      ['permission', 'critical'],
      ['exact-alarms', 'critical'],
      ['battery', 'warning'],
      ['schedule-failures', 'critical'],
    ]);
  });
});
