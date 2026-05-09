import { describe, it, expect, afterAll } from 'vitest';
import { getDb, closeDb } from '../../../src/db/knex.js';

describe('Knex connection', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('should create a knex instance', () => {
    const db = getDb();
    expect(db).toBeDefined();
    expect(typeof db.select).toBe('function');
  });

  it('should return the same instance on repeated calls', () => {
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });
});
