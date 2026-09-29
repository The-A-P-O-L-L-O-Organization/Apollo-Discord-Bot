// Database Adapter - TypeScript migration
// PostgreSQL/SQLite adapter with field-level encryption

import type { Knex } from 'knex';
import { encryptFields, decryptFields } from '../utils/encryption.js';

// Sensitive fields that should be encrypted at rest
const SENSITIVE_GUILD_FIELDS = ['interlink_api_key', 'webhook_url', 'api_key', 'secret', 'token', 'password'];
const SENSITIVE_USER_FIELDS = ['access_token', 'refresh_token', 'api_key', 'secret', 'token', 'password'];

function deserialize(value: unknown): Record<string, unknown> {
    return typeof value === 'string' ? JSON.parse(value) as Record<string, unknown> : (value as Record<string, unknown>);
}

function serialize(value: unknown): string {
    return JSON.stringify(value);
}

let _db: Knex | null = null;

export function createAdapter(db: Knex): void {
    _db = db;
}

function assertDb(): Knex {
    if (!_db) { throw new Error('Database adapter not initialized. Call createAdapter() first.'); }
    return _db;
}

export async function getGuildData(store: string, guildId: string): Promise<Record<string, unknown>> {
    const db = assertDb();
    const row = await db('guild_store')
        .select('data')
        .where({ store, guild_id: guildId })
        .first<{ data: string }>();
    if (!row) { return {}; }

    const data = deserialize(row.data);
    // Decrypt sensitive fields
    const result = await decryptFields(data, SENSITIVE_GUILD_FIELDS);
    return (result as Record<string, unknown>) || {};
}

export async function setGuildData(store: string, guildId: string, data: unknown): Promise<void> {
    const db = assertDb();
    // Encrypt sensitive fields before storage
    const encryptedData = await encryptFields(data, SENSITIVE_GUILD_FIELDS);
    await db('guild_store')
        .insert({ store, guild_id: guildId, data: serialize(encryptedData) })
        .onConflict(['store', 'guild_id'])
        .merge();
}

export async function updateGuildData(store: string, guildId: string, updater: (current: Record<string, unknown>) => Record<string, unknown>): Promise<Record<string, unknown>> {
    const current = await getGuildData(store, guildId);
    const next = updater(current);
    await setGuildData(store, guildId, next);
    return next;
}

export async function getAllGuildData(store: string): Promise<{ guildId: string; data: Record<string, unknown> }[]> {
    const db = assertDb();
    const rows = await db('guild_store')
        .select('guild_id', 'data')
        .where({ store })
        .whereNot({ guild_id: '__global__' });
    return Promise.all(rows.map(async (r: { guild_id: string; data: string }) => ({
        guildId: r.guild_id,
        data: (await decryptFields(deserialize(r.data), SENSITIVE_GUILD_FIELDS)) as Record<string, unknown>
    })));
}

export async function getUserData(store: string, guildId: string, userId: string): Promise<Record<string, unknown> | undefined> {
    const db = assertDb();
    const row = await db('guild_user_store')
        .select('data')
        .where({ store, guild_id: guildId, user_id: userId })
        .first<{ data: string }>();
    if (!row) { return undefined; }

    const data = deserialize(row.data);
    // Decrypt sensitive fields
    const result = await decryptFields(data, SENSITIVE_USER_FIELDS);
    return (result as Record<string, unknown>) || undefined;
}

export async function setUserData(store: string, guildId: string, userId: string, data: unknown): Promise<void> {
    const db = assertDb();
    // Encrypt sensitive fields before storage
    const encryptedData = await encryptFields(data, SENSITIVE_USER_FIELDS);
    await db('guild_user_store')
        .insert({ store, guild_id: guildId, user_id: userId, data: serialize(encryptedData) })
        .onConflict(['store', 'guild_id', 'user_id'])
        .merge();
}

export async function getAllUserData(store: string, guildId: string): Promise<{ userId: string; data: Record<string, unknown> }[]> {
    const db = assertDb();
    const rows = await db('guild_user_store')
        .select('user_id', 'data')
        .where({ store, guild_id: guildId });
    return Promise.all(rows.map(async (r: { user_id: string; data: string }) => ({
        userId: r.user_id,
        data: (await decryptFields(deserialize(r.data), SENSITIVE_USER_FIELDS)) as Record<string, unknown>
    })));
}

export async function getData(store: string): Promise<Record<string, unknown>> {
    return getGuildData(store, '__global__');
}

export async function setData(store: string, data: unknown): Promise<void> {
    return setGuildData(store, '__global__', data);
}