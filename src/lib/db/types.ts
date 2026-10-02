/**
 * Minimal database interface used by the whole app. The real implementation wraps
 * expo-sqlite; tests use Node's built-in SQLite, so repositories are tested on real SQL.
 */

export type SqlValue = string | number | null;

export interface LocalDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: readonly SqlValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
  /** Runs `task` atomically: everything is saved, or nothing is. */
  transaction(task: (tx: LocalDb) => Promise<void>): Promise<void>;
}
