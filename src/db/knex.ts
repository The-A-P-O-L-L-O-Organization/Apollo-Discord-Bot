// Knex Database Configuration - TypeScript migration
// Handles PostgreSQL and SQLite connections with migrations

import type { Knex } from 'knex';
import knex from 'knex';
import { config } from '../config/config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

let _db: Knex | null = null;

export function getDb(): Knex {
    if (_db) { return _db; }

    const { type, postgres } = config.database;

    if (type === 'postgres') {
        const { host, port, database, user, password, ssl, pool } = postgres;
        _db = knex({
            client: 'pg',
            connection: {
                host,
                port,
                database,
                user,
                password,
                ssl
            },
            pool,
            migrations: {
                directory: new URL('./migrations', import.meta.url).pathname,
                extension: 'cjs',
                loadExtensions: ['.cjs']
            }
        });
    } else {
        // Use in-memory database for tests to avoid conflicts
        const isTest = process.env['NODE_ENV'] === 'test' || process.env['VITEST'] === 'true';
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
            if (!existsSync(DATA_DIR)) { mkdirSync(DATA_DIR, { recursive: true }); }
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

export async function runMigrations(): Promise<void> {
    const db = getDb();
    await db.migrate.latest();
    logger.info('[DB] Migrations up to date');
}

export async function closeDb(): Promise<void> {
    if (_db) {
        await _db.destroy();
        _db = null;
    }
}

// For tests: reset database by deleting the file
export async function resetTestDb(): Promise<void> {
    if (process.env['NODE_ENV'] === 'test' || process.env['VITEST'] === 'true') {
        await closeDb();
        const dbPath = path.join(DATA_DIR, 'apollo.db');
        if (existsSync(dbPath)) {
            unlinkSync(dbPath);
        }
    }
}