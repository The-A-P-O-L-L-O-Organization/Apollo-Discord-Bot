import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Interlink Registry', () => {
    let Registry;
    let registry;
    let db;

    beforeAll(async () => {
        const knex = (await import('knex')).default;
        db = knex({
            client: 'better-sqlite3',
            connection: { filename: ':memory:' },
            useNullAsDefault: true
        });
        await db.schema.createTable('interlink_bots', (table) => {
            table.text('id').primary();
            table.text('name').notNullable().unique();
            table.text('description').defaultTo('');
            table.text('webhook_url').notNullable();
            table.integer('supports_redis').defaultTo(0);
            table.text('api_key_hash').notNullable();
            table.text('api_key_prefix').notNullable();
            table.text('scopes').defaultTo('all');
            table.integer('is_active').defaultTo(1);
            table.text('last_seen_at');
            table.text('created_at').defaultTo(db.fn.now());
            table.text('updated_at').defaultTo(db.fn.now());
        });
        Registry = (await import('../../../src/plugins/interlink/registry.js')).default;
        registry = new Registry(db);
    });

    afterAll(async () => {
        await db.destroy();
    });

    it('should list bots (empty initially)', async () => {
        const bots = await registry.list();
        expect(Array.isArray(bots)).toBe(true);
        expect(bots.length).toBe(0);
    });

    it('should create a bot and return record with rawKey', async () => {
        const result = await registry.create({
            name: 'test-bot',
            webhookUrl: 'https://example.com/webhook',
            description: 'A test bot',
            supportsRedis: false
        });
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('rawKey');
        expect(result.name).toBe('test-bot');
        expect(result.webhook_url).toBe('https://example.com/webhook');
    });

    it('should get a bot by name', async () => {
        const bot = await registry.get('test-bot');
        expect(bot).not.toBeNull();
        expect(bot.name).toBe('test-bot');
    });

    it('should return null for unknown name', async () => {
        const bot = await registry.get('nonexistent');
        expect(bot).toBeNull();
    });

    it('should get a bot by id', async () => {
        const all = await registry.list();
        const bot = await registry.getById(all[0].id);
        expect(bot).not.toBeNull();
        expect(bot.id).toBe(all[0].id);
    });

    it('should list bots after creation', async () => {
        const bots = await registry.list();
        expect(bots.length).toBe(1);
        expect(bots[0].name).toBe('test-bot');
    });

    it('should remove a bot', async () => {
        await registry.create({ name: 'to-remove', webhookUrl: 'https://example.com/remove' });
        await registry.remove('to-remove');
        const bot = await registry.get('to-remove');
        expect(bot).toBeNull();
    });

    it('should find by api key prefix', async () => {
        const all = await registry.list();
        const bot = await registry.findByApiKeyPrefix(all[0].api_key_prefix);
        expect(bot).not.toBeNull();
        expect(bot.id).toBe(all[0].id);
    });

    it('should rotate key and return new rawKey', async () => {
        const bot = await registry.get('test-bot');
        const oldHash = bot.api_key_hash;
        const result = await registry.rotateKey('test-bot');
        expect(result).toHaveProperty('rawKey');
        expect(result).toHaveProperty('hash');
        expect(result.hash).not.toBe(oldHash);
        const updated = await registry.get('test-bot');
        expect(updated.api_key_hash).toBe(result.hash);
        expect(updated.api_key_prefix).toBe(result.prefix);
    });

    it('should update last seen', async () => {
        await registry.updateLastSeen('test-bot');
        const bot = await registry.get('test-bot');
        expect(bot.last_seen_at).toBeTruthy();
    });
});
