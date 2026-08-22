/* eslint-disable no-console */
import knex from 'knex';
import { config } from '../config/config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, unlinkSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

let _db = null;

export function getDb() {
    if (_db) {return _db;}

    const { type, postgres } = config.database;

    if (type === 'postgres') {
        _db = knex({
            client: 'pg',
            connection: postgres.connectionString,
            pool: postgres.pool,
            migrations: {
                directory: new URL('./migrations', import.meta.url).pathname,
                extension: 'cjs',
                loadExtensions: ['.cjs']
            }
        });
    } else {
        // Use in-memory database for tests to avoid conflicts
        const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
        if (isTest) {
            _db = knex({
                client: 'better-sqlite3',
                connection: { filename: ':memory:' },
                useNullAsDefault: true,
                acquireConnectionTimeout: 10000,
                pool: { min: 1, max: 1 },
                migrations: {
                    directory: new URL('./migrations', import.meta.url).pathname,
                    extension: 'cjs',
                    loadExtensions: ['.cjs']
                }
            });
        } else {
            if (!existsSync(DATA_DIR)) {mkdirSync(DATA_DIR, { recursive: true });}
            _db = knex({
                client: 'better-sqlite3',
                connection: { filename: path.join(DATA_DIR, 'apollo.db') },
                useNullAsDefault: true,
                acquireConnectionTimeout: 10000,
                pool: { min: 1, max: 1 }, // SQLite: single writer
                migrations: {
                    directory: new URL('./migrations', import.meta.url).pathname,
                    extension: 'cjs',
                    loadExtensions: ['.cjs']
                }
            });
        }
    }

    return _db;
}

export async function runMigrations() {
    const db = getDb();
    await db.migrate.latest();
    console.log('[DB] Migrations up to date');
}

export async function closeDb() {
    if (_db) {
        await _db.destroy();
        _db = null;
    }
}

// For tests: reset database by deleting the file
export async function resetTestDb() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
        await closeDb();
        const dbPath = path.join(DATA_DIR, 'apollo.db');
        if (existsSync(dbPath)) {
            unlinkSync(dbPath);
        }
    }
}
