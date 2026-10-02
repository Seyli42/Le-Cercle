/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '@/lib/db/migrations';
import type { LocalDb, SqlValue } from '@/lib/db/types';

/** Real in-memory SQLite (Node built-in) behind the app's LocalDb interface. */
export async function createTestDb(): Promise<LocalDb> {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  const bind = (params?: readonly SqlValue[]) => (params ? [...params] : []);

  const db: LocalDb = {
    execAsync: async (sql) => {
      database.exec(sql);
    },
    runAsync: async (sql, params) => {
      const result = database.prepare(sql).run(...bind(params));
      return { changes: Number(result.changes) };
    },
    getAllAsync: async <T>(sql: string, params?: readonly SqlValue[]) =>
      database.prepare(sql).all(...bind(params)) as T[],
    getFirstAsync: async <T>(sql: string, params?: readonly SqlValue[]) =>
      (database.prepare(sql).get(...bind(params)) as T | undefined) ?? null,
    transaction: async (task) => {
      database.exec('BEGIN');
      try {
        await task(db);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
  await migrate(db);
  return db;
}
