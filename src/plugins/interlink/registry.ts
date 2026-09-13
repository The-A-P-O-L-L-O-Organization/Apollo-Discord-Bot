import crypto from 'crypto';
import { generateApiKey } from './auth.js';
import type { Knex } from 'knex';

interface BotRecord {
    id: string;
    name: string;
    description: string;
    webhook_url: string;
    supports_redis: number;
    api_key_hash: string;
    api_key_prefix: string;
    scopes: string;
    is_active: number;
    created_at: string;
    updated_at: string;
    last_seen_at: string | null;
}

interface CreateBotData {
    name: string;
    webhookUrl: string;
    description?: string;
    supportsRedis?: boolean;
}

interface CreatedBot {
    id: string;
    name: string;
    webhook_url: string;
    description: string;
    supports_redis: boolean;
    api_key_prefix: string;
    api_key_hash: string;
    rawKey: string;
    scopes: string;
}

interface RotatedKey {
    rawKey: string;
    hash: string;
    prefix: string;
}

export default class BotRegistry {
    private _db: Knex;

    constructor(db: Knex) {
        this._db = db;
    }

    async list(): Promise<BotRecord[]> {
        return this._db('interlink_bots')
            .select('*')
            .orderBy('created_at', 'asc') as Promise<BotRecord[]>;
    }

    async get(name: string): Promise<BotRecord | null> {
        const row = await this._db('interlink_bots')
            .where({ name })
            .first();
        return row ?? null;
    }

    async getById(id: string): Promise<BotRecord | null> {
        const row = await this._db('interlink_bots')
            .where({ id })
            .first();
        return row ?? null;
    }

    async create({ name, webhookUrl, description = '', supportsRedis = false }: CreateBotData): Promise<CreatedBot> {
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

    async remove(name: string): Promise<number> {
        return this._db('interlink_bots').where({ name }).del();
    }

    async findByApiKeyPrefix(prefix: string): Promise<BotRecord | null> {
        const row = await this._db('interlink_bots')
            .where({ api_key_prefix: prefix })
            .first();
        return row ?? null;
    }

    async rotateKey(name: string): Promise<RotatedKey> {
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

    async updateLastSeen(name: string): Promise<number> {
        return this._db('interlink_bots')
            .where({ name })
            .update({ last_seen_at: new Date().toISOString() });
    }
}