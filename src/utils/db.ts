// Unified PG/SQLite interface with adapter pattern
import { config } from '../config/config.js';
import { getDb } from '../db/knex.js';
import { createClient, type Client, type ResultSet, type Row } from '@libsql/client';
import { validateGuildData, validateUserData, validateGlobalData, type GuildConfig, type UserConfig, type GlobalConfig } from '../db/schemas.js';

export type { UserConfig, GuildConfig, GlobalConfig };

const USE_PG = config.database.type === 'postgres';

let _pgAdapter: DbAdapter | null = null;
let _sqliteClient: Client | null = null;
let _adapterPromise: Promise<AdapterHandle> | null = null;

interface DbAdapter {
    getGuildData: (store: string, guildId: string) => Promise<GuildConfig>;
    setGuildData: (store: string, guildId: string, data: GuildConfig) => Promise<void>;
    updateGuildData: (store: string, guildId: string, updater: (data: GuildConfig) => GuildConfig) => Promise<GuildConfig>;
    getAllGuildData: (store: string) => Promise<{ guildId: string; data: GuildConfig }[]>;
    getUserData: (store: string, guildId: string, userId: string) => Promise<UserConfig | undefined>;
    setUserData: (store: string, guildId: string, userId: string, data: UserConfig) => Promise<void>;
    getAllUserData: (store: string, guildId: string) => Promise<{ userId: string; data: UserConfig }[]>;
    getData: (store: string) => Promise<GlobalConfig>;
    setData: (store: string, data: GlobalConfig) => Promise<void>;
}

type AdapterHandle = DbAdapter | { client: Client };

async function getAdapter(): Promise<AdapterHandle> {
    if (_adapterPromise) { return _adapterPromise; }
    _adapterPromise = _initAdapter();
    return _adapterPromise;
}

async function _initAdapter(): Promise<AdapterHandle> {
    if (USE_PG) {
        const { createAdapter, getGuildData, setGuildData, updateGuildData,
            getAllGuildData, getUserData, setUserData, getAllUserData,
            getData, setData } = await import('../db/adapter.js');
        const { getDb } = await import('../db/knex.js');
        createAdapter(getDb());
        _pgAdapter = { getGuildData, setGuildData, updateGuildData,
            getAllGuildData, getUserData, setUserData, getAllUserData,
            getData, setData };
        return _pgAdapter;
    }

    const path = (await import('path')).default;
    const { fileURLToPath } = await import('url');
    const { existsSync, mkdirSync } = await import('fs');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const DATA_DIR = path.join(__dirname, '../data');
    if (!existsSync(DATA_DIR)) { mkdirSync(DATA_DIR, { recursive: true }); }

    const dbPath = path.join(DATA_DIR, 'apollo.db');
    const client = createClient({
        url: `file:${dbPath}`,
        intMode: 'number',
        concurrency: 4,
    });

    // Initialize tables
    await client.batch([
        `CREATE TABLE IF NOT EXISTS guild_store (
        store TEXT NOT NULL, guild_id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (store, guild_id))`,
        `CREATE TABLE IF NOT EXISTS guild_user_store (
        store TEXT NOT NULL, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '[]', PRIMARY KEY (store, guild_id, user_id))`,
    ], 'write');

    // Enable WAL mode
    await client.execute('PRAGMA journal_mode = WAL');
    await client.execute('PRAGMA wal_autocheckpoint = 1000');
    await client.execute('PRAGMA foreign_keys = ON');
    await client.execute('PRAGMA synchronous = NORMAL');
    await client.execute('PRAGMA busy_timeout = 5000');

    _sqliteClient = client;
    return { client };
}

function deserialize(value: string): Record<string, unknown> {
    try { return JSON.parse(value); } catch { return {}; }
}

function serialize(value: unknown): string {
    return JSON.stringify(value);
}

export async function getGuildData(store: string, guildId: string): Promise<GuildConfig> {
    if (USE_PG) { return (await getAdapter() as DbAdapter).getGuildData(store, guildId); }
    const isTest = process.env['NODE_ENV'] === 'test' || process.env['VITEST'] === 'true';
    if (isTest && config.database.type === 'sqlite') {
        const db = getDb();
        const row = await db('guild_store')
            .select('data')
            .where({ store, guild_id: guildId })
            .first();
        try { return validateGuildData(store, row ? JSON.parse(row.data as string) : {}); } catch { return {}; }
    }
    const { client } = await getAdapter() as { client: Client };
    const result = await client.execute({
        sql: 'SELECT data FROM guild_store WHERE store = ? AND guild_id = ?',
        args: [store, guildId],
    });
    const row = result.rows[0];
    return row ? validateGuildData(store, deserialize(row['data'] as string)) : {};
}

export async function setGuildData(store: string, guildId: string, data: GuildConfig): Promise<void> {
    if (USE_PG) { return (await getAdapter() as DbAdapter).setGuildData(store, guildId, data); }
    const isTest = process.env['NODE_ENV'] === 'test' || process.env['VITEST'] === 'true';
    if (isTest && config.database.type === 'sqlite') {
        const db = getDb();
        await db.raw(
            'INSERT INTO guild_store (store, guild_id, data) VALUES (?, ?, ?) ON CONFLICT(store, guild_id) DO UPDATE SET data = excluded.data',
            [store, guildId, JSON.stringify(data)]
        );
        return;
    }
    const { client } = await getAdapter() as { client: Client };
    await client.execute({
        sql: 'INSERT INTO guild_store (store, guild_id, data) VALUES (?, ?, ?) ON CONFLICT(store, guild_id) DO UPDATE SET data = excluded.data',
        args: [store, guildId, serialize(data)],
    });
}

export async function updateGuildData(store: string, guildId: string, updater: (data: GuildConfig) => GuildConfig): Promise<GuildConfig> {
    const current = await getGuildData(store, guildId);
    const next = updater(current);
    await setGuildData(store, guildId, next);
    return next;
}

export async function updateUserData(store: string, guildId: string, userId: string, updater: (data: UserConfig) => UserConfig): Promise<UserConfig> {
    const current = await getUserData(store, guildId, userId) ?? {};
    const next = updater(current as UserConfig);
    await setUserData(store, guildId, userId, next);
    return next;
}

export async function appendToGuildArray(store: string, guildId: string, key: string, item: unknown): Promise<void> {
    await updateGuildData(store, guildId, (data: Record<string, unknown>) => {
        const existing = data[key];
        const arr: unknown[] = Array.isArray(existing) ? existing : [];
        arr.push(item);
        data[key] = arr;
        return data;
    });
}

export async function removeFromGuildArray(store: string, guildId: string, key: string, predicate: (item: unknown) => boolean): Promise<number> {
    let removed = 0;
    await updateGuildData(store, guildId, (data: Record<string, unknown>) => {
        const existing = data[key];
        if (!Array.isArray(existing)) { return data; }
        const before = existing.length;
        const next = existing.filter((item) => !predicate(item));
        data[key] = next;
        removed = before - next.length;
        return data;
    });
    return removed;
}

export async function getAllGuildData(store: string): Promise<{ guildId: string; data: GuildConfig }[]> {
    if (USE_PG) { return (await getAdapter() as DbAdapter).getAllGuildData(store); }
    const { client } = await getAdapter() as { client: Client };
    const result = await client.execute({
        sql: 'SELECT guild_id, data FROM guild_store WHERE store = ? AND guild_id != ?',
        args: [store, '__global__'],
    });
    return result.rows.map((r: Row) => ({
        guildId: r['guild_id'] as string,
        data: validateGuildData(store, deserialize(r['data'] as string)),
    }));
}

export async function getAllGuildIds(store: string): Promise<string[]> {
    if (USE_PG) {
        const { getAllGuildData } = await import('../db/adapter.js');
        const data = await getAllGuildData(store);
        return data.map(d => d.guildId);
    }
    const { client } = await getAdapter() as { client: Client };
    const result = await client.execute({
        sql: 'SELECT guild_id FROM guild_store WHERE store = ? AND guild_id != ?',
        args: [store, '__global__'],
    });
    return result.rows.map((r: Row) => r['guild_id'] as string);
}

export async function getUserData(store: string, guildId: string, userId: string): Promise<UserConfig | undefined> {
    if (USE_PG) { return (await getAdapter() as DbAdapter).getUserData(store, guildId, userId); }
    const { client } = await getAdapter() as { client: Client };
    const result = await client.execute({
        sql: 'SELECT data FROM guild_user_store WHERE store = ? AND guild_id = ? AND user_id = ?',
        args: [store, guildId, userId],
    });
    const row = result.rows[0];
    if (!row) { return undefined; }
    return validateUserData(store, deserialize(row['data'] as string));
}

export async function setUserData(store: string, guildId: string, userId: string, data: UserConfig): Promise<void> {
    if (USE_PG) { return (await getAdapter() as DbAdapter).setUserData(store, guildId, userId, data); }
    const { client } = await getAdapter() as { client: Client };
    await client.execute({
        sql: 'INSERT INTO guild_user_store (store, guild_id, user_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(store, guild_id, user_id) DO UPDATE SET data = excluded.data',
        args: [store, guildId, userId, serialize(data)],
    });
}

export async function appendToUserArray(store: string, guildId: string, userId: string, item: unknown): Promise<void> {
    await updateUserData(store, guildId, userId, (data: UserConfig) => {
        const existing = data;
        const arr: unknown[] = Array.isArray(existing) ? [...existing] : [item];
        return arr as unknown as UserConfig;
    });
}

export async function removeFromUserArray(store: string, guildId: string, userId: string, predicate: (item: unknown) => boolean): Promise<number> {
    let removed = 0;
    await updateUserData(store, guildId, userId, (data: UserConfig) => {
        const existing = data;
        if (!Array.isArray(existing)) { return existing; }
        const before = existing.length;
        const next = existing.filter((item) => !predicate(item));
        removed = before - next.length;
        return next as unknown as UserConfig;
    });
    return removed;
}

export async function getAllUserData(store: string, guildId: string): Promise<{ userId: string; data: UserConfig }[]> {
    if (USE_PG) { return (await getAdapter() as DbAdapter).getAllUserData(store, guildId); }
    const { client } = await getAdapter() as { client: Client };
    const result = await client.execute({
        sql: 'SELECT user_id, data FROM guild_user_store WHERE store = ? AND guild_id = ?',
        args: [store, guildId],
    });
    return result.rows.map((r: Row) => ({
        userId: r['user_id'] as string,
        data: validateUserData(store, deserialize(r['data'] as string)),
    }));
}

export async function getData(store: string): Promise<GlobalConfig> {
    return getGuildData(store, '__global__') as Promise<GlobalConfig>;
}

export async function setData(store: string, data: GlobalConfig): Promise<void> {
    return setGuildData(store, '__global__', data as GuildConfig);
}

export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export async function ensureSubDir(subdir: string): Promise<string> {
    const path = (await import('path')).default;
    const { fileURLToPath } = await import('url');
    const { existsSync, mkdirSync } = await import('fs');
    const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data');
    const subdirPath = path.join(DATA_DIR, subdir);
    if (!existsSync(subdirPath)) { mkdirSync(subdirPath, { recursive: true }); }
    return subdirPath;
}

export async function writeToSubDir(subdir: string, filename: string, data: unknown): Promise<void> {
    const path = (await import('path')).default;
    const { writeFileSync } = await import('fs');
    const subdirPath = await ensureSubDir(subdir);
    const filePath = path.join(subdirPath, filename);
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function close(): Promise<void> {
    if (!USE_PG && _sqliteClient) {
        _sqliteClient.close();
        _sqliteClient = null;
    }
    return Promise.resolve();
}

// Periodic WAL checkpoint for SQLite (call from main process)
let _walCheckpointInterval: NodeJS.Timeout | null = null;

export function startWalCheckpointInterval(intervalMs = 5 * 60 * 1000): void {
    if (_walCheckpointInterval) { return; }
    if (USE_PG) { return; } // Only for SQLite

    _walCheckpointInterval = setInterval(async () => {
        if (_sqliteClient) {
            try {
                await _sqliteClient.execute('PRAGMA wal_checkpoint(TRUNCATE)');
            } catch (err) {
                import('./logger.js').then(({ logger }) => {
                    logger.warn({ err: err as Error }, '[DB] WAL checkpoint failed');
                }).catch(err => {
                    console.warn('[DB] WAL checkpoint failed (logger import error):', (err as Error).message);
                });
            }
        }
    }, intervalMs);

    // Don't prevent process exit
    _walCheckpointInterval.unref();
}

export function stopWalCheckpointInterval(): void {
    if (_walCheckpointInterval) {
        clearInterval(_walCheckpointInterval);
        _walCheckpointInterval = null;
    }
}