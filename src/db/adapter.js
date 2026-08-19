let _db = null;

import { encryptFields, decryptFields } from '../utils/encryption.js';

// Sensitive fields that should be encrypted at rest
const SENSITIVE_GUILD_FIELDS = ['interlink_api_key', 'webhook_url', 'api_key', 'secret', 'token', 'password'];
const SENSITIVE_USER_FIELDS = ['access_token', 'refresh_token', 'api_key', 'secret', 'token', 'password'];

function deserialize(value) {
    return typeof value === 'string' ? JSON.parse(value) : value;
}

function serialize(value) {
    return JSON.stringify(value);
}

export function createAdapter(db) {
    _db = db;
}

export async function getGuildData(store, guildId) {
    const row = await _db('guild_store')
        .select('data')
        .where({ store, guild_id: guildId })
        .first();
    if (!row) {return {};}
    
    const data = deserialize(row.data);
    // Decrypt sensitive fields
    return decryptFields(data, SENSITIVE_GUILD_FIELDS);
}

export async function setGuildData(store, guildId, data) {
    // Encrypt sensitive fields before storage
    const encryptedData = encryptFields(data, SENSITIVE_GUILD_FIELDS);
    await _db('guild_store')
        .insert({ store, guild_id: guildId, data: serialize(encryptedData) })
        .onConflict(['store', 'guild_id'])
        .merge();
}

export async function updateGuildData(store, guildId, updater) {
    const current = await getGuildData(store, guildId);
    const next = updater(current);
    await setGuildData(store, guildId, next);
    return next;
}

export async function getAllGuildData(store) {
    const rows = await _db('guild_store')
        .select('guild_id', 'data')
        .where({ store })
        .whereNot({ guild_id: '__global__' });
    return rows.map(r => ({ 
        guildId: r.guild_id, 
        data: decryptFields(deserialize(r.data), SENSITIVE_GUILD_FIELDS) 
    }));
}

export async function getUserData(store, guildId, userId) {
    const row = await _db('guild_user_store')
        .select('data')
        .where({ store, guild_id: guildId, user_id: userId })
        .first();
    if (!row) {return undefined;}
    
    const data = deserialize(row.data);
    // Decrypt sensitive fields
    return decryptFields(data, SENSITIVE_USER_FIELDS);
}

export async function setUserData(store, guildId, userId, data) {
    // Encrypt sensitive fields before storage
    const encryptedData = encryptFields(data, SENSITIVE_USER_FIELDS);
    await _db('guild_user_store')
        .insert({ store, guild_id: guildId, user_id: userId, data: serialize(encryptedData) })
        .onConflict(['store', 'guild_id', 'user_id'])
        .merge();
}

export async function getAllUserData(store, guildId) {
    const rows = await _db('guild_user_store')
        .select('user_id', 'data')
        .where({ store, guild_id: guildId });
    return rows.map(r => ({ 
        userId: r.user_id, 
        data: decryptFields(deserialize(r.data), SENSITIVE_USER_FIELDS) 
    }));
}

export async function getData(store) {
    return getGuildData(store, '__global__');
}

export async function setData(store, data) {
    return setGuildData(store, '__global__', data);
}
