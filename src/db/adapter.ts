// Database Adapter - TypeScript migration
// PostgreSQL/SQLite adapter with field-level encryption

import { encryptFields, decryptFields } from '../utils/encryption.js';

// Sensitive fields that should be encrypted at rest
const SENSITIVE_GUILD_FIELDS = ['interlink_api_key', 'webhook_url', 'api_key', 'secret', 'token', 'password'];
const SENSITIVE_USER_FIELDS = ['access_token', 'refresh_token', 'api_key', 'secret', 'token', 'password'];

function deserialize(value: unknown): unknown {
    return typeof value === 'string' ? JSON.parse(value) : value;
}

function serialize(value: unknown): string {
    return JSON.stringify(value);
}

let _db: any = null;

export function createAdapter(db: any): void {
    _db = db;
}

export async function getGuildData(store: string, guildId: string): Promise<Record<string, unknown>> {
    const row = await _db('guild_store')
        .select('data')
        .where({ store, guild_id: guildId })
        .first();
    if (!row) { return {}; }
    
    const data = deserialize(row.data);
    // Decrypt sensitive fields
    return await decryptFields(data as Record<string, unknown>, SENSITIVE_GUILD_FIELDS);
}

export async function setGuildData(store: string, guildId: string, data: Record<string, unknown>): Promise<void> {
    // Encrypt sensitive fields before storage
    const encryptedData = await encryptFields(data, SENSITIVE_GUILD_FIELDS);
    await _db('guild_store')
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

export async function getAllGuildData(store: string): Promise<Array<{ guildId: string; data: Record<string, unknown> }>> {
    const rows = await _db('guild_store')
        .select('guild_id', 'data')
        .where({ store })
        .whereNot({ guild_id: '__global__' });
    return Promise.all(rows.map(async (r: { guild_id: string; data: string }) => ({ 
        guildId: r.guild_id, 
        data: await decryptFields(deserialize(r.data) as Record<string, unknown>, SENSITIVE_GUILD_FIELDS) 
    })));
}

export async function getUserData(store: string, guildId: string, userId: string): Promise<Record<string, unknown> | undefined> {
    const row = await _db('guild_user_store')
        .select('data')
        .where({ store, guild_id: guildId, user_id: userId })
        .first();
    if (!row) { return undefined; }
    
    const data = deserialize(row.data);
    // Decrypt sensitive fields
    return await decryptFields(data as Record<string, unknown>, SENSITIVE_USER_FIELDS);
}

export async function setUserData(store: string, guildId: string, userId: string, data: Record<string, unknown>): Promise<void> {
    // Encrypt sensitive fields before storage
    const encryptedData = await encryptFields(data, SENSITIVE_USER_FIELDS);
    await _db('guild_user_store')
        .insert({ store, guild_id: guildId, user_id: userId, data: serialize(encryptedData) })
        .onConflict(['store', 'guild_id', 'user_id'])
        .merge();
}

export async function getAllUserData(store: string, guildId: string): Promise<Array<{ userId: string; data: Record<string, unknown> }>> {
    const rows = await _db('guild_user_store')
        .select('user_id', 'data')
        .where({ store, guild_id: guildId });
    return Promise.all(rows.map(async (r: { user_id: string; data: string }) => ({ 
        userId: r.user_id, 
        data: await decryptFields(deserialize(r.data) as Record<string, unknown>, SENSITIVE_USER_FIELDS) 
    })));
}

export async function getData(store: string): Promise<Record<string, unknown>> {
    return getGuildData(store, '__global__');
}

export async function setData(store: string, data: Record<string, unknown>): Promise<void> {
    return setGuildData(store, '__global__', data);
}