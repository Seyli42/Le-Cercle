import * as Crypto from 'expo-crypto';
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
async function getOrCreateKey(): Promise<string> {
  const options: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  };
  // If reading fails, the error propagates: creating a new key here would make the
  // existing database unreadable forever.
  const existing = await SecureStore.getItemAsync(KEY_STORAGE_NAME, options);
  if (existing !== null) return existing;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_STORAGE_NAME, key, options);
  return key;
}

async function openWithKey(key: string): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  // Must be the very first statement. Encrypts the file with SQLCipher in real builds;
  // ignored by the plain SQLite of Expo Go (no encryption there).
  await database.execAsync(`PRAGMA key = "x'${key}'"`);
  // Fails with "file is not a database" if the key does not match the file.
  await database.getFirstAsync('SELECT count(*) FROM sqlite_master');
  await database.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  return database;
}

/**
 * Opens (and creates if needed) the encrypted local database.
 *
 * If the file cannot be decrypted (e.g. restored from a backup on a new phone, where the
 * key does not exist), it is recreated empty: the data comes back from the server sync.
 */
async function openLocalDb(): Promise<LocalDb> {
  const key = await getOrCreateKey();
  let database: SQLite.SQLiteDatabase;
  try {
    database = await openWithKey(key);
  } catch (error) {
    // Only a key mismatch justifies starting over; any other failure is surfaced as is.
    if (!(error instanceof Error && /not a database|encrypted/i.test(error.message))) throw error;
    reportError(error, 'db.open.unreadable');
    await SQLite.deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
    database = await openWithKey(key);
  }
  const db = toLocalDb(database);
  await migrate(db);
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
