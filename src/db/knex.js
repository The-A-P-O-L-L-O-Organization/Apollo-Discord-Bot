/* eslint-disable no-console */
import knex from 'knex';
import { config } from '../config/config.js';

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
        _db = knex({
            client: 'better-sqlite3',
            connection: { filename: ':memory:' },
            useNullAsDefault: true,
            migrations: {
                directory: new URL('./migrations', import.meta.url).pathname,
                extension: 'cjs',
                loadExtensions: ['.cjs']
            }
        });
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
