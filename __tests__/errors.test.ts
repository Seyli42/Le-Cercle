import { AppError, DEFAULT_MESSAGES, toAppError } from '@/lib/errors';

describe('toAppError', () => {
  it('keeps an existing AppError untouched', () => {
    const original = new AppError('permission', 'Autorisez les notifications');
    expect(toAppError(original)).toBe(original);
  });

  it('recognises network failures', () => {
    const error = toAppError(new TypeError('Network request failed'));
    expect(error.kind).toBe('network');
    expect(error.userMessage).toBe(DEFAULT_MESSAGES.network);
  });

  it('falls back to unknown for anything else', () => {
    expect(toAppError('boom').kind).toBe('unknown');
    expect(toAppError(new Error('x')).kind).toBe('unknown');
  });

  it('has a French message for every kind', () => {
    for (const message of Object.values(DEFAULT_MESSAGES)) {
      expect(message.length).toBeGreaterThan(10);
    }
  });
});
