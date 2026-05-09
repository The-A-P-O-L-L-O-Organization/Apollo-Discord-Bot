import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, runMigrations, closeDb } from '../../../src/db/knex.js';
import {
  createAdapter,
  getGuildData,
  setGuildData,
  updateGuildData,
  getAllGuildData,
  getUserData,
  setUserData,
  getAllUserData,
} from '../../../src/db/adapter.js';

describe('DB adapter', () => {
  beforeAll(async () => {
    const db = getDb();
    await runMigrations();
    createAdapter(db);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('should set and get guild data', async () => {
    await setGuildData('warnings', 'guild-1', { count: 5 });
    const result = await getGuildData('warnings', 'guild-1');
    expect(result).toEqual({ count: 5 });
  });

  it('should return {} for missing guild data', async () => {
    const result = await getGuildData('nonexistent', 'guild-x');
    expect(result).toEqual({});
  });

  it('should update guild data with updater function', async () => {
    await setGuildData('test', 'guild-2', { items: [1] });
    await updateGuildData('test', 'guild-2', (data) => {
      data.items.push(2);
      return data;
    });
    const result = await getGuildData('test', 'guild-2');
    expect(result.items).toEqual([1, 2]);
  });

  it('should get all guild data for a store', async () => {
    await setGuildData('alltest', 'g-a', { x: 1 });
    await setGuildData('alltest', 'g-b', { x: 2 });
    const all = await getAllGuildData('alltest');
    expect(all.length).toBe(2);
    expect(all.find(g => g.guildId === 'g-b').data).toEqual({ x: 2 });
  });

  it('should set and get user data', async () => {
    await setUserData('warnings', 'guild-1', 'user-1', ['warn1', 'warn2']);
    const result = await getUserData('warnings', 'guild-1', 'user-1');
    expect(result).toEqual(['warn1', 'warn2']);
  });

  it('should return undefined for missing user data', async () => {
    const result = await getUserData('test', 'guild-1', 'no-such-user');
    expect(result).toBeUndefined();
  });

  it('should get all users for a guild store', async () => {
    await setUserData('allusers', 'guild-z', 'u1', ['a']);
    await setUserData('allusers', 'guild-z', 'u2', ['b']);
    const all = await getAllUserData('allusers', 'guild-z');
    expect(all.length).toBe(2);
    expect(all.find(u => u.userId === 'u2').data).toEqual(['b']);
  });
});
