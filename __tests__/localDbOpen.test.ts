/**
 * Opening the encrypted local database. Regression: a file that the key cannot read
 * ("file is not a database") must be recreated, not leave the app stuck on an error
 * screen — the connection is closed first (expo-sqlite refuses to delete an open
 * database) and the journal files go with it.
 */
type FakeConnection = {
  execAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  closeAsync: jest.Mock;
  runAsync: jest.Mock;
  getAllAsync: jest.Mock;
  withExclusiveTransactionAsync: jest.Mock;
};

const mockConnections: FakeConnection[] = [];
const mockDeleted: string[] = [];
let mockUnreadableOpens = 0;

function mockConnection(): FakeConnection {
  const unreadable = mockUnreadableOpens > 0;
  if (unreadable) mockUnreadableOpens -= 1;
  const c: FakeConnection = {
    execAsync: jest.fn(() => Promise.resolve()),
    getFirstAsync: jest.fn(() =>
      unreadable
        ? Promise.reject(
            new Error('Call to function rejected', { cause: new Error('file is not a database') }),
          )
        : Promise.resolve({ 'count(*)': 0 }),
    ),
    closeAsync: jest.fn(() => Promise.resolve()),
    runAsync: jest.fn(() => Promise.resolve({ changes: 0 })),
    getAllAsync: jest.fn(() => Promise.resolve([])),
    withExclusiveTransactionAsync: jest.fn(),
  };
  mockConnections.push(c);
  return c;
}

jest.mock('expo-sqlite', () => ({
  defaultDatabaseDirectory: '/data/files/SQLite',
  openDatabaseAsync: jest.fn((_name: string, options: { useNewConnection?: boolean }) => {
    if (!options?.useNewConnection) throw new Error('must ask for a new connection');
    return Promise.resolve(mockConnection());
  }),
}));
jest.mock('expo-file-system', () => ({
  File: function MockFile(this: { exists: boolean; delete: () => void }, mockUri: string) {
    this.exists = true;
    this.delete = () => mockDeleted.push(mockUri);
  },
}));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
  getItemAsync: jest.fn(() => Promise.resolve('ab'.repeat(32))),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/db/migrations', () => ({ migrate: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/monitoring', () => ({ reportError: jest.fn() }));

beforeEach(() => {
  jest.resetModules();
  mockConnections.length = 0;
  mockDeleted.length = 0;
  mockUnreadableOpens = 0;
});

const open = () => (require('@/lib/db/expoDb') as typeof import('@/lib/db/expoDb')).getLocalDb();

it('opens with the key first, on a new connection', async () => {
  await open();
  expect(mockConnections).toHaveLength(1);
  expect(mockConnections[0]?.execAsync.mock.calls[0]?.[0]).toBe(
    `PRAGMA key = "x'${'ab'.repeat(32)}'"`,
  );
  expect(mockDeleted).toEqual([]);
});

it('recreates an unreadable file: closes it, deletes it with its journal, reopens', async () => {
  mockUnreadableOpens = 1;
  await open();
  expect(mockConnections).toHaveLength(2);
  expect(mockConnections[0]?.closeAsync).toHaveBeenCalled();
  expect(mockDeleted).toEqual([
    'file:///data/files/SQLite/dosecircle.db',
    'file:///data/files/SQLite/dosecircle.db-wal',
    'file:///data/files/SQLite/dosecircle.db-shm',
    'file:///data/files/SQLite/dosecircle.db-journal',
  ]);
});

it('names the failing step when it still cannot open', async () => {
  mockUnreadableOpens = 2;
  await expect(open()).rejects.toThrow(/^reopen: check: /);
});
