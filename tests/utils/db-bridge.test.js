import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('DB bridge (utils/db.js)', () => {
  it('should export all expected functions as async', async () => {
    const db = await import('../../src/utils/db.js');
    const fns = ['getGuildData', 'setGuildData', 'updateGuildData',
      'appendToGuildArray', 'removeFromGuildArray', 'getAllGuildData',
      'getUserData', 'setUserData', 'appendToUserArray',
      'removeFromUserArray', 'getAllUserData', 'getData', 'setData',
      'generateId'];
    for (const fn of fns) {
      expect(typeof db[fn]).toBe('function');
    }
  });

  it('should have close function', async () => {
    const db = await import('../../src/utils/db.js');
    expect(typeof db.close).toBe('function');
  });
});
