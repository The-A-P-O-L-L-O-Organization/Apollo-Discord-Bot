import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdapter, getData, setData } from '../../../src/db/adapter.js';

describe('Global store (getData/setData)', () => {
  let db;

  beforeAll(async () => {
    const knex = (await import('knex')).default;
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await db.schema.createTable('guild_store', (t) => {
      t.text('store').notNull();
      t.text('guild_id').notNull();
      t.text('data').notNull().defaultTo('{}');
      t.primary(['store', 'guild_id']);
    });
    createAdapter(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('should return empty object for missing key', async () => {
    const result = await getData('nonexistent');
    expect(result).toEqual({});
  });

  it('should write and read global data', async () => {
    await setData('test_global', { foo: 'bar', count: 42 });
    const result = await getData('test_global');
    expect(result).toEqual({ foo: 'bar', count: 42 });
  });

  it('should overwrite existing global data', async () => {
    await setData('test_global', { updated: true });
    const result = await getData('test_global');
    expect(result).toEqual({ updated: true });
  });
});
