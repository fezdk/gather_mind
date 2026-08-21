import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { AppState, EditorDraft, createEmptyState } from './model';
import { parseEditorDraft, parseStoredState } from './stored-state';

const LEGACY_DATABASE_NAME = 'ExpoSQLiteStorage';
const LEGACY_STORAGE_KEY = 'gather-mind-native-state-v1';
const DATABASE_NAME = 'gather-mind-encrypted.db';
const CIPHER_CHECK_DATABASE_NAME = 'gather-mind-cipher-check.db';
const DATABASE_KEY = 'gather-mind-database-key-v1';
const STATE_KEY = 'app-state';
const EDITOR_DRAFT_KEY = 'editor-draft';
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

type StateRow = { value: string };

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let cipherAvailablePromise: Promise<void> | null = null;
let operationQueue: Promise<unknown> = Promise.resolve();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getOrCreateDatabaseKey(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DATABASE_KEY, SECURE_STORE_OPTIONS);
  if (stored) {
    if (!/^[0-9a-f]{64}$/.test(stored)) throw new Error('The local encryption key has an invalid format.');
    return stored;
  }
  const generated = bytesToHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(DATABASE_KEY, generated, SECURE_STORE_OPTIONS);
  return generated;
}

async function requireEncryptedSQLite(): Promise<void> {
  if (!cipherAvailablePromise) {
    cipherAvailablePromise = (async () => {
      const checkDatabase = await SQLite.openDatabaseAsync(CIPHER_CHECK_DATABASE_NAME);
      try {
        const cipher = await checkDatabase.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version;');
        if (!cipher?.cipher_version) {
          throw new Error('This build does not include encrypted SQLite support. Install a native Gather Mind build instead of Expo Go.');
        }
      } finally {
        await checkDatabase.closeAsync().catch(() => undefined);
        await SQLite.deleteDatabaseAsync(CIPHER_CHECK_DATABASE_NAME).catch(() => undefined);
      }
    })().catch((error) => {
      cipherAvailablePromise = null;
      throw error;
    });
  }
  return cipherAvailablePromise;
}

async function openEncryptedDatabase(): Promise<SQLite.SQLiteDatabase> {
  await requireEncryptedSQLite();
  const key = await getOrCreateDatabaseKey();
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  try {
    // A raw 256-bit key avoids placing user-chosen, low-entropy text in the database key path.
    await database.execAsync(`PRAGMA key = "x'${key}'";`);
    await database.execAsync(`
      PRAGMA cipher_memory_security = ON;
      PRAGMA secure_delete = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS app_storage (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    // This deliberately touches an encrypted page so a missing or incorrect key fails now.
    await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM app_storage;');
    return database;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openEncryptedDatabase().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const queued = operationQueue.then(operation);
  operationQueue = queued.catch(() => undefined);
  return queued;
}

async function readLegacyState(): Promise<string | null> {
  const database = await SQLite.openDatabaseAsync(LEGACY_DATABASE_NAME);
  try {
    const table = await database.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'storage';");
    if (!table) return null;
    const row = await database.getFirstAsync<StateRow>('SELECT value FROM storage WHERE key = ?;', LEGACY_STORAGE_KEY);
    return row?.value ?? null;
  } finally {
    await database.closeAsync();
  }
}

async function scrubLegacyState(): Promise<void> {
  const database = await SQLite.openDatabaseAsync(LEGACY_DATABASE_NAME);
  try {
    const table = await database.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'storage';");
    if (!table) return;
    const row = await database.getFirstAsync<{ present: number }>('SELECT 1 AS present FROM storage WHERE key = ?;', LEGACY_STORAGE_KEY);
    if (!row) return;
    await database.execAsync('PRAGMA secure_delete = ON;');
    await database.runAsync('DELETE FROM storage WHERE key = ?;', LEGACY_STORAGE_KEY);
    await database.execAsync('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  } finally {
    await database.closeAsync();
  }
}

async function readEncryptedState(database: SQLite.SQLiteDatabase): Promise<string | null> {
  const row = await database.getFirstAsync<StateRow>('SELECT value FROM app_storage WHERE key = ?;', STATE_KEY);
  return row?.value ?? null;
}

async function writeEncryptedState(database: SQLite.SQLiteDatabase, state: AppState): Promise<void> {
  const raw = JSON.stringify(state);
  await database.runAsync(
    'INSERT INTO app_storage (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
    STATE_KEY,
    raw,
  );
  const verified = await readEncryptedState(database);
  if (verified !== raw) throw new Error('Gather Mind could not verify the encrypted local write.');
}

export function loadState(): Promise<AppState> {
  return enqueue(async () => {
    const database = await getDatabase();
    const encrypted = await readEncryptedState(database);
    if (encrypted !== null) {
      const state = parseStoredState(encrypted, 'Encrypted local storage');
      const storedVersion = (JSON.parse(encrypted) as { version?: unknown }).version;
      if (storedVersion !== state.version) await writeEncryptedState(database, state);
      // Complete cleanup if the app was interrupted after encrypted verification on a prior launch.
      await scrubLegacyState();
      return state;
    }

    const legacy = await readLegacyState();
    const state = legacy !== null ? parseStoredState(legacy, 'Existing local storage') : createEmptyState();
    await writeEncryptedState(database, state);
    if (legacy !== null) await scrubLegacyState();
    return state;
  });
}

export async function saveState(state: AppState): Promise<void> {
  return enqueue(async () => writeEncryptedState(await getDatabase(), state));
}

export function loadEditorDraft(): Promise<EditorDraft | null> {
  return enqueue(async () => {
    const database = await getDatabase();
    const row = await database.getFirstAsync<StateRow>('SELECT value FROM app_storage WHERE key = ?;', EDITOR_DRAFT_KEY);
    return row?.value ? parseEditorDraft(row.value) : null;
  });
}

export function saveEditorDraft(draft: EditorDraft | null): Promise<void> {
  return enqueue(async () => {
    const database = await getDatabase();
    if (!draft) {
      await database.runAsync('DELETE FROM app_storage WHERE key = ?;', EDITOR_DRAFT_KEY);
      return;
    }
    const raw = JSON.stringify(draft);
    await database.runAsync(
      'INSERT INTO app_storage (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
      EDITOR_DRAFT_KEY,
      raw,
    );
    const verified = await database.getFirstAsync<StateRow>('SELECT value FROM app_storage WHERE key = ?;', EDITOR_DRAFT_KEY);
    if (verified?.value !== raw) throw new Error('Gather Mind could not verify the encrypted editor draft.');
  });
}

export async function clearState(): Promise<void> {
  return enqueue(async () => {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM app_storage;');
    await database.execAsync('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  });
}

export async function closeStateStorage(): Promise<void> {
  return enqueue(async () => {
    const pending = databasePromise;
    databasePromise = null;
    if (pending) await (await pending).closeAsync();
  });
}
