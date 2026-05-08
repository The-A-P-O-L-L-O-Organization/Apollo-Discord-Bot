// Database Utility
// SQLite-backed persistence layer — drop-in replacement for dataStore.js
// Uses better-sqlite3 (synchronous) for simple, reliable guild data storage.

import Database from 'better-sqlite3';
import path from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH  = path.join(DATA_DIR, 'apollo.db');

// Ensure data directory exists before opening the database
if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema bootstrap
// All guild data is stored as JSON blobs keyed by (store, guild_id).
// This keeps the schema dead simple while preserving the existing data model.
// ---------------------------------------------------------------------------
db.exec(`
    CREATE TABLE IF NOT EXISTS guild_store (
        store    TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        data     TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (store, guild_id)
    );

    CREATE TABLE IF NOT EXISTS guild_user_store (
        store    TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        data     TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (store, guild_id, user_id)
    );
`);

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------
const stmts = {
    getGuild: db.prepare('SELECT data FROM guild_store WHERE store = ? AND guild_id = ?'),
    setGuild: db.prepare('INSERT INTO guild_store (store, guild_id, data) VALUES (?, ?, ?) ON CONFLICT(store, guild_id) DO UPDATE SET data = excluded.data'),
    getAllGuilds: db.prepare('SELECT guild_id, data FROM guild_store WHERE store = ?'),

    getUser: db.prepare('SELECT data FROM guild_user_store WHERE store = ? AND guild_id = ? AND user_id = ?'),
    setUser: db.prepare('INSERT INTO guild_user_store (store, guild_id, user_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(store, guild_id, user_id) DO UPDATE SET data = excluded.data'),
    getAllUsers: db.prepare('SELECT user_id, data FROM guild_user_store WHERE store = ? AND guild_id = ?')
};

// ---------------------------------------------------------------------------
// Guild-level helpers  (replaces getGuildData / setGuildData)
// ---------------------------------------------------------------------------

/**
 * Returns the parsed data object for a guild in a named store.
 * Returns {} if no row exists yet.
 */
export function getGuildData(store, guildId) {
    const row = stmts.getGuild.get(store, guildId);
    try {
        return row ? JSON.parse(row.data) : {};
    } catch (e) {
        console.error('[ERROR] Failed to parse data:', e);
        return {};
    }
}

/**
 * Overwrites the data object for a guild in a named store.
 */
export function setGuildData(store, guildId, data) {
    stmts.setGuild.run(store, guildId, JSON.stringify(data));
}

/**
 * Reads, patches with updater fn, then writes back atomically.
 * @param {string} store
 * @param {string} guildId
 * @param {(current: object) => object} updater
 */
export function updateGuildData(store, guildId, updater) {
    const current = getGuildData(store, guildId);
    const next    = updater(current);
    setGuildData(store, guildId, next);
    return next;
}

/**
 * Appends an item to an array key inside guild data.
 */
export function appendToGuildArray(store, guildId, key, item) {
    updateGuildData(store, guildId, data => {
        if (!Array.isArray(data[key])) {data[key] = [];}
        data[key].push(item);
        return data;
    });
}

/**
 * Removes items from an array key inside guild data that match a predicate.
 * Returns the number of items removed.
 */
export function removeFromGuildArray(store, guildId, key, predicate) {
    let removed = 0;
    updateGuildData(store, guildId, data => {
        if (!Array.isArray(data[key])) {return data;}
        const before = data[key].length;
        data[key] = data[key].filter(item => !predicate(item));
        removed = before - data[key].length;
        return data;
    });
    return removed;
}

/**
 * Returns all guilds that have data in a store (excluding the global sentinel).
 * @returns {{ guildId: string, data: object }[]}
 */
export function getAllGuildData(store) {
    return stmts.getAllGuilds.all(store)
        .filter(row => row.guild_id !== '__global__')
        .map(row => {
            try {
                return { guildId: row.guild_id, data: JSON.parse(row.data) };
            } catch (e) {
                console.error('[ERROR] Failed to parse data:', e);
                return { guildId: row.guild_id, data: {} };
            }
        });
}

// ---------------------------------------------------------------------------
// User-level helpers
// ---------------------------------------------------------------------------

/**
 * Returns parsed user data. Returns undefined if not found.
 */
export function getUserData(store, guildId, userId) {
    const row = stmts.getUser.get(store, guildId, userId);
    try {
        return row ? JSON.parse(row.data) : undefined;
    } catch (e) {
        console.error('[ERROR] Failed to parse data:', e);
        return undefined;
    }
}

/**
 * Overwrites user data.
 */
export function setUserData(store, guildId, userId, data) {
    stmts.setUser.run(store, guildId, userId, JSON.stringify(data));
}

/**
 * Appends an item to a user's data array.
 */
export function appendToUserArray(store, guildId, userId, item) {
    const current = getUserData(store, guildId, userId);
    const arr = Array.isArray(current) ? current : [];
    arr.push(item);
    setUserData(store, guildId, userId, arr);
}

/**
 * Removes items from a user's array that match a predicate.
 * Returns number of items removed.
 */
export function removeFromUserArray(store, guildId, userId, predicate) {
    const current = getUserData(store, guildId, userId);
    if (!Array.isArray(current)) {return 0;}
    const next    = current.filter(item => !predicate(item));
    const removed = current.length - next.length;
    if (removed > 0) {setUserData(store, guildId, userId, next);}
    return removed;
}

/**
 * Returns all users for a guild in a store.
 * @returns {{ userId: string, data: any }[]}
 */
export function getAllUserData(store, guildId) {
    return stmts.getAllUsers.all(store, guildId).map(row => {
        try {
            return { userId: row.user_id, data: JSON.parse(row.data) };
        } catch (e) {
            console.error('[ERROR] Failed to parse stored data:', e);
            return { userId: row.user_id, data: [] };
        }
    });
}

// ---------------------------------------------------------------------------
// Global (non-guild) store — used by pollScheduler and reminderScheduler
// Stored in guild_store with sentinel guild_id '__global__'
// ---------------------------------------------------------------------------

/**
 * Reads a top-level JSON data object by store name (global, not guild-scoped).
 */
export function getData(store) {
    return getGuildData(store, '__global__');
}

/**
 * Writes a top-level JSON data object by store name (global, not guild-scoped).
 */
export function setData(store, data) {
    setGuildData(store, '__global__', data);
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

/**
 * Generates a unique ID string.
 */
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Ensures a subdirectory exists within the data directory.
 */
export function ensureSubDir(subdir) {
    const subdirPath = path.join(DATA_DIR, subdir);
    if (!existsSync(subdirPath)) {
        mkdirSync(subdirPath, { recursive: true });
    }
    return subdirPath;
}

/**
 * Writes JSON data to a file inside a data subdirectory (e.g. transcripts).
 */
export function writeToSubDir(subdir, filename, data) {
    const subdirPath = ensureSubDir(subdir);
    const filePath   = path.join(subdirPath, filename);
    try {
        writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`[ERROR] Failed to write ${subdir}/${filename}:`, error);
    }
}

/**
 * Exposes the raw better-sqlite3 Database instance for advanced queries.
 */
export { db };

export function close() {
    if (db) {
        db.close();
    }
}
