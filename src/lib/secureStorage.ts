import * as SecureStore from 'expo-secure-store';

/**
 * Storage for the Supabase session, encrypted by the OS (iOS Keychain / Android Keystore).
 *
 * Some platforms reject secure values above ~2 KB and a Supabase session is bigger,
 * so each value is split into chunks: `<key>__0`, `<key>__1`… plus `<key>__count`.
 */

const CHUNK_SIZE = 1800;

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable in the background once the phone has been unlocked once since boot
  // (needed later to sync reminders while the screen is locked), never migrated
  // to another device through a backup.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const countKey = (key: string) => `${key}__count`;
const chunkKey = (key: string, index: number) => `${key}__${index}`;

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key), OPTIONS);
  const count = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function deleteChunks(key: string, from: number, to: number): Promise<void> {
  for (let i = from; i < to; i += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, i), OPTIONS);
  }
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await readCount(key);
    if (count === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i), OPTIONS);
      // A missing chunk means an interrupted write: treat as signed out rather than crash.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const previousCount = await readCount(key);
    const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    for (let i = 0; i < count; i += 1) {
      await SecureStore.setItemAsync(
        chunkKey(key, i),
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        OPTIONS,
      );
    }
    await SecureStore.setItemAsync(countKey(key), String(count), OPTIONS);
    await deleteChunks(key, count, previousCount);
  },

  async removeItem(key: string): Promise<void> {
    const count = await readCount(key);
    await SecureStore.deleteItemAsync(countKey(key), OPTIONS);
    await deleteChunks(key, 0, count);
  },
};
