import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

import { migrate } from '@/lib/db/migrations';
import type { LocalDb, SqlValue } from '@/lib/db/types';
import { reportError } from '@/lib/monitoring';

const DATABASE_NAME = 'dosecircle.db';
const KEY_STORAGE_NAME = 'local_db_key_v1';

type ExpoExecutor = Pick<
  SQLite.SQLiteDatabase,
  'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync'
>;

function wrap(executor: ExpoExecutor, transaction: LocalDb['transaction']): LocalDb {
  const params = (values?: readonly SqlValue[]) => (values ? [...values] : []);
  return {
    execAsync: (sql) => executor.execAsync(sql),
    runAsync: async (sql, values) => {
      const result = await executor.runAsync(sql, params(values));
      return { changes: result.changes };
    },
    getAllAsync: (sql, values) => executor.getAllAsync(sql, params(values)),
    getFirstAsync: (sql, values) => executor.getFirstAsync(sql, params(values)),
    transaction,
  };
}

function toLocalDb(database: SQLite.SQLiteDatabase): LocalDb {
  const transaction: LocalDb['transaction'] = (task) =>
    database.withExclusiveTransactionAsync((txn) =>
      task(
        wrap(txn, () => {
          throw new Error('Nested transactions are not supported');
        }),
      ),
    );
  return wrap(database, transaction);
}

/** 256-bit random key, created once and kept in the Keychain / Keystore. */
async function getOrCreateKey(): Promise<{ key: string; created: boolean }> {
  const options: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  };
  // If reading fails, the error propagates: creating a new key here would make the
  // existing database unreadable forever.
  const existing = await SecureStore.getItemAsync(KEY_STORAGE_NAME, options);
  if (existing !== null) return { key: existing, created: false };
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_STORAGE_NAME, key, options);
  return { key, created: true };
}

/** Names the step that failed, so a test build can show exactly what went wrong. */
async function step<T>(name: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${name}: ${message}`, { cause: error });
  }
}

async function openWithKey(key: string): Promise<SQLite.SQLiteDatabase> {
  // A NEW native connection every time: expo-sqlite otherwise hands back the connection
  // already open under the same name, still holding the previous (wrong) key.
  const database = await step('open', () =>
    SQLite.openDatabaseAsync(DATABASE_NAME, { useNewConnection: true }),
  );
  try {
    // Must be the very first statement. Encrypts the file with SQLCipher in real builds;
    // ignored by the plain SQLite of Expo Go (no encryption there).
    await step('key', () => database.execAsync(`PRAGMA key = "x'${key}'"`));
    // Fails with "file is not a database" if the key does not match the file.
    await step('check', () => database.getFirstAsync('SELECT count(*) FROM sqlite_master'));
    await step('pragmas', () =>
      database.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;'),
    );
    return database;
  } catch (error) {
    // Never leave a half-open connection behind: it would block the file deletion below.
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

/**
 * Deletes the database AND its journal files: a leftover "-wal" from the old file would
 * make the new one unreadable too. The connection is already closed (see openWithKey).
 */
async function deleteDatabaseFiles(): Promise<void> {
  const directory: string = SQLite.defaultDatabaseDirectory;
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const file = new File(`file://${directory}/${DATABASE_NAME}${suffix}`);
    if (file.exists) file.delete();
  }
}

const isUnreadable = (error: unknown): boolean => {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (/not a database|encrypted/i.test(e.message)) return true;
  }
  return false;
};

/**
 * Opens (and creates if needed) the encrypted local database.
 *
 * If the file cannot be decrypted (e.g. restored from a backup on a new phone, where the
 * key does not exist), it is recreated empty: the data comes back from the server sync.
 */
async function openLocalDb(): Promise<LocalDb> {
  const { key, created } = await step('keystore', getOrCreateKey);
  let database: SQLite.SQLiteDatabase;
  try {
    database = await openWithKey(key);
  } catch (error) {
    // Only a key mismatch justifies starting over; any other failure is surfaced as is.
    if (!isUnreadable(error)) throw error;
    reportError(error, created ? 'db.open.unreadable.newKey' : 'db.open.unreadable');
    await step('delete', deleteDatabaseFiles);
    database = await step('reopen', () => openWithKey(key));
  }
  const db = toLocalDb(database);
  await step('migrate', () => migrate(db));
  return db;
}

let shared: Promise<LocalDb> | null = null;

/**
 * The single connection shared by the screens and the background tasks (reminder
 * answers, periodic refresh). A failed opening is retried on the next call.
 */
export function getLocalDb(): Promise<LocalDb> {
  if (!shared) {
    shared = openLocalDb().catch((error: unknown) => {
      shared = null;
      throw error;
    });
  }
  return shared;
}
