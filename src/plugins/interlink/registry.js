import crypto from 'crypto';
import { generateApiKey } from './auth.js';

export default class BotRegistry {
    constructor(db) {
        this._db = db;
    }

    async list() {
        return this._db('interlink_bots')
            .select('*')
            .orderBy('created_at', 'asc');
    }

    async get(name) {
        const row = await this._db('interlink_bots')
            .where({ name })
            .first();
        return row ?? null;
    }

    async getById(id) {
        const row = await this._db('interlink_bots')
            .where({ id })
            .first();
        return row ?? null;
    }

    async create({ name, webhookUrl, description = '', supportsRedis = false }) {
        const id = crypto.randomUUID();
        const { rawKey, hash, prefix } = generateApiKey();
        await this._db('interlink_bots').insert({
            id,
            name,
            description,
            webhook_url: webhookUrl,
            supports_redis: supportsRedis ? 1 : 0,
            api_key_hash: hash,
            api_key_prefix: prefix,
            scopes: 'all'
        });
        return {
            id,
            name,
            webhook_url: webhookUrl,
            description,
            supports_redis: supportsRedis,
            api_key_prefix: prefix,
            api_key_hash: hash,
            rawKey,
            scopes: 'all'
        };
    }

    async remove(name) {
        return this._db('interlink_bots').where({ name }).del();
    }

    async findByApiKeyPrefix(prefix) {
        const row = await this._db('interlink_bots')
            .where({ api_key_prefix: prefix })
            .first();
        return row ?? null;
    }

    async rotateKey(name) {
        const { rawKey, hash, prefix } = generateApiKey();
        await this._db('interlink_bots')
            .where({ name })
            .update({
                api_key_hash: hash,
                api_key_prefix: prefix,
                updated_at: this._db.fn.now()
            });
        return { rawKey, hash, prefix };
    }

    async updateLastSeen(name) {
        return this._db('interlink_bots')
            .where({ name })
            .update({ last_seen_at: new Date().toISOString() });
    }
}
