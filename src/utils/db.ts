// Database Utility - TypeScript migration
// Unified interface for both PostgreSQL and SQLite

import { config } from '../config/config.js';
import { getDb } from '../db/knex.js';
import type { BetterSQLite3Database } from '../types/database.js';

const USE_PG = config.database.type === 'postgres';

let _pgAdapter: {
    getGuildData: (store: string, guildId: string) => Promise<Record<string, unknown>>;
    setGuildData: (store: string, guildId: string, data: Record<string, unknown>) => Promise<void>;
    updateGuildData: (store: string, guildId: string, updater: (current: Record<string, unknown>) => Record<string, unknown>) => Promise<Record<string, unknown>>;
    getAllGuildData: (store: string) => Promise<Array<{ guildId: string; data: Record<string, unknown> }>>;
    getUserData: (store: string, guildId: string, userId: string) => Promise<Record<string, unknown> | undefined>;
    setUserData: (store: string, guildId: string, userId: string, data: Record<string, unknown>) => Promise<void>;
    getAllUserData: (store: string, guildId: string) => Promise<Array<{ userId: string; data: Record<string, unknown> }>>;
    getData: (store: string) => Promise<Record<string, unknown>>;
    setData: (store: string, data: Record<string, unknown>) => Promise<void>;
} | null = null;

let _sqliteDb: { db: BetterSQLite3Database; DATA_DIR: string } | null = null;
let _adapterPromise: Promise<typeof _pgAdapter | typeof _sqliteDb> | null = null;

async function getAdapter(): Promise<typeof _pgAdapter | typeof _sqliteDb> {
    if (_adapterPromise) { return _adapterPromise; }
    _adapterPromise = _initAdapter();
    return _adapterPromise;
}

async function _initAdapter(): Promise<typeof _pgAdapter | typeof _sqliteDb> {
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
    const Database = (await import('better-sqlite3')).default;
    const path = (await import('path')).default;
    const { fileURLToPath } = await import('url');
    const { existsSync, mkdirSync } = await import('fs');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const DATA_DIR = path.join(__dirname, '../data');
    if (!existsSync(DATA_DIR)) { mkdirSync(DATA_DIR, { recursive: true }); }
    const db = new Database(path.join(DATA_DIR, 'apollo.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.exec(`CREATE TABLE IF NOT EXISTS guild_store (
    store TEXT NOT NULL, guild_id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (store, guild_id));
    CREATE TABLE IF NOT EXISTS guild_user_store (
    store TEXT NOT NULL, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '[]', PRIMARY KEY (store, guild_id, user_id));`);
    _sqliteDb = { db, DATA_DIR };
    return _sqliteDb;
}

export async function getGuildData(store: string, guildId: string): Promise<Record<string, unknown>> {
    if (USE_PG) { return (await getAdapter()).getGuildData!(store, guildId); }
    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    if (isTest && config.database.type === 'sqlite') {
        const db = await getDb();
        const row = await db('guild_store')
            .select('data')
            .where({ store, guild_id: guildId })
            .first();
        try { return row ? JSON.parse(row.data) : {}; } catch { return {}; }
    }
    const { db } = await getAdapter() as { db: BetterSQLite3Database };
    const stmt = db.prepare('SELECT data FROM guild_store WHERE store = ? AND guild_id = ?');
    const row = stmt.get(store, guildId);
    try { return row ? JSON.parse(row.data) : {}; } catch { return {}; }
}

export async function setGuildData(store: string, guildId: string, data: Record<string, unknown>): Promise<void> {
    if (USE_PG) { return (await getAdapter()).setGuildData!(store, guildId, data); }
    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    if (isTest && config.database.type === 'sqlite') {
        const db = await getDb();
        await db.raw(
            'INSERT INTO guild_store (store, guild_id, data) VALUES (?, ?, ?) ON CONFLICT(store, guild_id) DO UPDATE SET data = excluded.data',
            [store, guildId, JSON.stringify(data)]
        );
        return;
    }
    const { db } = await getAdapter() as { db: BetterSQLite3Database };
    const stmt = db.prepare('INSERT INTO guild_store (store, guild_id, data) VALUES (?, ?, ?) ON CONFLICT(store, guild_id) DO UPDATE SET data = excluded.data');
    stmt.run(store, guildId, JSON.stringify(data));
}

export async function updateGuildData(store: string, guildId: string, updater: (current: Record<string, unknown>) => Record<string, unknown>): Promise<Record<string, unknown>> {
    const current = await getGuildData(store, guildId);
    const next = updater(current);
    await setGuildData(store, guildId, next);
    return next;
}

export async function appendToGuildArray(store: string, guildId: string, key: string, item: unknown): Promise<void> {
    return updateGuildData(store, guildId, (data: Record<string, unknown>) => {
        if (!Array.isArray(data[key])) { data[key] = []; }
        (data[key] as unknown[]).push(item);
        return data;
    });
}

export async function removeFromGuildArray(store: string, guildId: string, key: string, predicate: (item: unknown) => boolean): Promise<number> {
    let removed = 0;
    await updateGuildData(store, guildId, (data: Record<string, unknown>) => {
        if (!Array.isArray(data[key])) { return data; }
        const before = (data[key] as unknown[]).length;
        data[key] = (data[key] as unknown[]).filter((item) => !predicate(item));
        removed = before - (data[key] as unknown[]).length;
        return data;
    });
    return removed;
}

export async function getAllGuildData(store: string): Promise<Array<{ guildId: string; data: Record<string, unknown> }>> {
    if (USE_PG) { return (await getAdapter()).getAllGuildData!(store); }
    const { db } = await getAdapter() as { db: BetterSQLite3Database };
    const stmt = db.prepare('SELECT guild_id, data FROM guild_store WHERE store = ?');
    const rows = stmt.all(store).filter((r) => r.guild_id !== '__global__');
    return rows.map((r) => {
        try { return { guildId: r.guild_id, data: JSON.parse(r.data) }; } catch { return { guildId: r.guild_id, data: {} }; }
    });
}

export async function getAllGuildIds(store: string): Promise<string[]> {
    if (USE_PG) {
        const { getAllGuildData } = await import('../db/adapter.js');
        const data = await getAllGuildData(store);
        return data.map(d => d.guildId);
    }
    const { db } = await getAdapter() as { db: BetterSQLite3Database };
    const stmt = db.prepare('SELECT guild_id FROM guild_store WHERE store = ? AND guild_id != ?');
    const rows = stmt.all(store, '__global__');
    return rows.map(r => r.guild_id);
}

export async function getUserData(store: string, guildId: string, userId: string): Promise<Record<string, unknown> | undefined> {
    if (USE_PG) { return (await getAdapter()).getUserData!(store, guildId, userId); }
    const { db } = await getAdapter() as { db: BetterSQLite3Database };
    const stmt = db.prepare('SELECT data FROM guild_user_store WHERE store = ? AND guild_id = ? AND user_id = ?');
    const row = stmt.get(store, guildId, userId);
    try { return row ? JSON.parse(row.data) : undefined; } catch { return undefined; }
}

export async function setUserData(store: string, guildId: string, userId: string, data: Record<string, unknown>): Promise<void> {
    if (USE_PG) { return (await getAdapter()).setUserData!(store, guildId, userId, data); }
    const { db } = await getAdapter() as { db: BetterSQLite3Database };
    const stmt = db.prepare('INSERT INTO guild_user_store (store, guild_id, user_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(store, guild_id, user_id) DO UPDATE SET data = excluded.data');
    stmt.run(store, guildId, userId, JSON.stringify(data));
}

export async function appendToUserArray(store: string, guildId: string, userId: string, item: unknown): Promise<void> {
    const current = await getUserData(store, guildId, userId);
    const arr = Array.isArray(current) ? current : [];
    arr.push(item);
    await setUserData(store, guildId, userId, arr);
}

export async function removeFromUserArray(store: string, guildId: string, userId: string, predicate: (item: unknown) => boolean): Promise<number> {
    const current = await getUserData(store, guildId, userId);
    if (!Array.isArray(current)) { return 0; }
    const next = current.filter((item) => !predicate(item));
    const removed = current.length - next.length;
    if (removed > 0) { await setUserData(store, guildId, userId, next); }
    return removed;
}

export async function getAllUserData(store: string, guildId: string): Promise<Array<{ userId: string; data: Record<string, unknown> }>> {
    if (USE_PG) { return (await getAdapter()).getAllUserData!(store, guildId); }
    const { db } = await getAdapter() as { db: BetterSQLite3Database };
    const stmt = db.prepare('SELECT user_id, data FROM guild_user_store WHERE store = ? AND guild_id = ?');
    return stmt.all(store, guildId).map((r) => {
        try { return { userId: r.user_id, data: JSON.parse(r.data) }; } catch { return { userId: r.user_id, data: [] }; }
    });
}

export async function getData(store: string): Promise<Record<string, unknown>> {
    return getGuildData(store, '__global__');
}

export async function setData(store: string, data: Record<string, unknown>): Promise<void> {
    return setGuildData(store, '__global__', data);
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
    if (!USE_PG && _sqliteDb) {
        // Perform final WAL checkpoint before closing
        try {
            _sqliteDb.db.pragma('wal_checkpoint(TRUNCATE)');
        } catch {
            // Ignore checkpoint errors on close
        }
        _sqliteDb.db.close();
        _sqliteDb = null;
    }
}

// Periodic WAL checkpoint for SQLite (call from main process)
let _walCheckpointInterval: ReturnType<typeof setInterval> | null = null;

export function startWalCheckpointInterval(intervalMs = 5 * 60 * 1000): void {
    if (_walCheckpointInterval) { return; }
    if (USE_PG) { return; } // Only for SQLite
    
    _walCheckpointInterval = setInterval(() => {
        if (_sqliteDb) {
            try {
                _sqliteDb.db.pragma('wal_checkpoint(TRUNCATE)');
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('[DB] WAL checkpoint failed:', (err as Error).message);
            }
        }
    }, intervalMs);
    
    // Don't prevent process exit
    if (_walCheckpointInterval) _walCheckpointInterval.unref();
}

export function stopWalCheckpointInterval(): void {
    if (_walCheckpointInterval) {
        clearInterval(_walCheckpointInterval);
        _walCheckpointInterval = null;
    }
}