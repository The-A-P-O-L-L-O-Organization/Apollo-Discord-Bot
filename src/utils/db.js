import { config } from '../config/config.js';
import { getDb } from '../db/knex.js';

const USE_PG = config.database.type === 'postgres';

let _pgAdapter = null;
let _sqliteDb = null;
let _adapterPromise = null;

async function getAdapter() {
    if (_adapterPromise) {return _adapterPromise;}
    _adapterPromise = _initAdapter();
    return _adapterPromise;
}

async function _initAdapter() {
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
    if (!existsSync(DATA_DIR)) {mkdirSync(DATA_DIR, { recursive: true });}
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

export async function getGuildData(store, guildId) {
    if (USE_PG) {return (await getAdapter()).getGuildData(store, guildId);}
    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    if (isTest && config.database.type === 'sqlite') {
        const db = await getDb();
        const row = await db('guild_store')
            .select('data')
            .where({ store, guild_id: guildId })
            .first();
        try { return row ? JSON.parse(row.data) : {}; } catch { return {}; }
    }
    const { db } = await getAdapter();
    const stmt = db.prepare('SELECT data FROM guild_store WHERE store = ? AND guild_id = ?');
    const row = stmt.get(store, guildId);
    try { return row ? JSON.parse(row.data) : {}; } catch { return {}; }
}

export async function setGuildData(store, guildId, data) {
    if (USE_PG) {return (await getAdapter()).setGuildData(store, guildId, data);}
    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    if (isTest && config.database.type === 'sqlite') {
        const db = await getDb();
        await db.raw(
            'INSERT INTO guild_store (store, guild_id, data) VALUES (?, ?, ?) ON CONFLICT(store, guild_id) DO UPDATE SET data = excluded.data',
            [store, guildId, JSON.stringify(data)]
        );
        return;
    }
    const { db } = await getAdapter();
    const stmt = db.prepare('INSERT INTO guild_store (store, guild_id, data) VALUES (?, ?, ?) ON CONFLICT(store, guild_id) DO UPDATE SET data = excluded.data');
    stmt.run(store, guildId, JSON.stringify(data));
}

export async function updateGuildData(store, guildId, updater) {
    const current = await getGuildData(store, guildId);
    const next = updater(current);
    await setGuildData(store, guildId, next);
    return next;
}

export async function appendToGuildArray(store, guildId, key, item) {
    return updateGuildData(store, guildId, (data) => {
        if (!Array.isArray(data[key])) {data[key] = [];}
        data[key].push(item);
        return data;
    });
}

export async function removeFromGuildArray(store, guildId, key, predicate) {
    let removed = 0;
    await updateGuildData(store, guildId, (data) => {
        if (!Array.isArray(data[key])) {return data;}
        const before = data[key].length;
        data[key] = data[key].filter((item) => !predicate(item));
        removed = before - data[key].length;
        return data;
    });
    return removed;
}

export async function getAllGuildData(store) {
    if (USE_PG) {return (await getAdapter()).getAllGuildData(store);}
    const { db } = await getAdapter();
    const stmt = db.prepare('SELECT guild_id, data FROM guild_store WHERE store = ?');
    const rows = stmt.all(store).filter((r) => r.guild_id !== '__global__');
    return rows.map((r) => {
        try { return { guildId: r.guild_id, data: JSON.parse(r.data) }; } catch { return { guildId: r.guild_id, data: {} }; }
    });
}

export async function getUserData(store, guildId, userId) {
    if (USE_PG) {return (await getAdapter()).getUserData(store, guildId, userId);}
    const { db } = await getAdapter();
    const stmt = db.prepare('SELECT data FROM guild_user_store WHERE store = ? AND guild_id = ? AND user_id = ?');
    const row = stmt.get(store, guildId, userId);
    try { return row ? JSON.parse(row.data) : undefined; } catch { return undefined; }
}

export async function setUserData(store, guildId, userId, data) {
    if (USE_PG) {return (await getAdapter()).setUserData(store, guildId, userId, data);}
    const { db } = await getAdapter();
    const stmt = db.prepare('INSERT INTO guild_user_store (store, guild_id, user_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(store, guild_id, user_id) DO UPDATE SET data = excluded.data');
    stmt.run(store, guildId, userId, JSON.stringify(data));
}

export async function appendToUserArray(store, guildId, userId, item) {
    const current = await getUserData(store, guildId, userId);
    const arr = Array.isArray(current) ? current : [];
    arr.push(item);
    await setUserData(store, guildId, userId, arr);
}

export async function removeFromUserArray(store, guildId, userId, predicate) {
    const current = await getUserData(store, guildId, userId);
    if (!Array.isArray(current)) {return 0;}
    const next = current.filter((item) => !predicate(item));
    const removed = current.length - next.length;
    if (removed > 0) {await setUserData(store, guildId, userId, next);}
    return removed;
}

export async function getAllUserData(store, guildId) {
    if (USE_PG) {return (await getAdapter()).getAllUserData(store, guildId);}
    const { db } = await getAdapter();
    const stmt = db.prepare('SELECT user_id, data FROM guild_user_store WHERE store = ? AND guild_id = ?');
    return stmt.all(store, guildId).map((r) => {
        try { return { userId: r.user_id, data: JSON.parse(r.data) }; } catch { return { userId: r.user_id, data: [] }; }
    });
}

export async function getData(store) {
    return getGuildData(store, '__global__');
}

export async function setData(store, data) {
    return setGuildData(store, '__global__', data);
}

export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export async function ensureSubDir(subdir) {
    const path = (await import('path')).default;
    const { fileURLToPath } = await import('url');
    const { existsSync, mkdirSync } = await import('fs');
    const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data');
    const subdirPath = path.join(DATA_DIR, subdir);
    if (!existsSync(subdirPath)) {mkdirSync(subdirPath, { recursive: true });}
    return subdirPath;
}

export async function writeToSubDir(subdir, filename, data) {
    const path = (await import('path')).default;
    const { writeFileSync } = await import('fs');
    const subdirPath = await ensureSubDir(subdir);
    const filePath = path.join(subdirPath, filename);
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function close() {
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
let _walCheckpointInterval = null;

export function startWalCheckpointInterval(intervalMs = 5 * 60 * 1000) {
    if (_walCheckpointInterval) {return;}
    if (USE_PG) {return;} // Only for SQLite
    
    _walCheckpointInterval = setInterval(() => {
        if (_sqliteDb) {
            try {
                _sqliteDb.db.pragma('wal_checkpoint(TRUNCATE)');
            } catch (err) {
                console.warn('[DB] WAL checkpoint failed:', err.message);
            }
        }
    }, intervalMs);
    
    // Don't prevent process exit
    _walCheckpointInterval.unref();
}

export function stopWalCheckpointInterval() {
    if (_walCheckpointInterval) {
        clearInterval(_walCheckpointInterval);
        _walCheckpointInterval = null;
    }
}
