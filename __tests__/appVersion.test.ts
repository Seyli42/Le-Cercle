import { formatAppVersion } from '@/lib/appVersion';

describe('formatAppVersion', () => {
  it('store build', () => {
    expect(
      formatAppVersion({ version: '1.0.0', build: '12', updateId: null, channel: 'production' }),
    ).toBe('Version 1.0.0 (12)');
  });

  it('shows the update and a non-production channel', () => {
    expect(
      formatAppVersion({
        version: '1.0.0',
        build: '12',
        updateId: '3f2a1b9c-0000-4000-8000-000000000000',
        channel: 'preview',
      }),
    ).toBe('Version 1.0.0 (12) · mise à jour 3f2a1b9c · canal preview');
  });

  it('unknown values (Expo Go, tests)', () => {
    expect(formatAppVersion({ version: null, build: null, updateId: null, channel: null })).toBe(
      'Version ?',
    );
  });
});
