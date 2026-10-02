import * as SecureStore from 'expo-secure-store';

import { secureStorage } from '@/lib/secureStorage';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => store.clear());

describe('secureStorage', () => {
  it('returns null when nothing is stored', async () => {
    expect(await secureStorage.getItem('session')).toBeNull();
  });

  it('round-trips a large session through several chunks', async () => {
    const session = JSON.stringify({ token: 'x'.repeat(5000) });
    await secureStorage.setItem('session', session);
    expect(store.get('session__count')).toBe('3');
    for (const value of store.values()) expect(value.length).toBeLessThanOrEqual(1800);
    expect(await secureStorage.getItem('session')).toBe(session);
  });

  it('removes leftover chunks when the value shrinks', async () => {
    await secureStorage.setItem('session', 'a'.repeat(5000));
    await secureStorage.setItem('session', 'short');
    expect(store.has('session__1')).toBe(false);
    expect(store.has('session__2')).toBe(false);
    expect(await secureStorage.getItem('session')).toBe('short');
  });

  it('treats a missing chunk as no session instead of crashing', async () => {
    await secureStorage.setItem('session', 'a'.repeat(4000));
    store.delete('session__1');
    expect(await secureStorage.getItem('session')).toBeNull();
  });

  it('removes every chunk on sign-out', async () => {
    await secureStorage.setItem('session', 'a'.repeat(4000));
    await secureStorage.removeItem('session');
    expect(store.size).toBe(0);
  });
});
